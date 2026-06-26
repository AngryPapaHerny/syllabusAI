import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { runCalibrator } from '@/lib/gen-pipeline/calibrator';
import { runWriter } from '@/lib/gen-pipeline/writer';
import { runGrounding } from '@/lib/gen-pipeline/grounding';
import { runSelfCheck, isSelfCheckPassed } from '@/lib/gen-pipeline/self-check';
import type { GenJob, UnitGenerationPayload, CurriculumCalibrationPayload } from '@/types/database';

const WorkerRequestSchema = z
  .object({
    limit: z.number().int().min(1).max(10).default(5),
    dry_run: z.boolean().default(false),
  })
  .optional();

export async function POST(req: Request) {
  // Service Role Key 인증
  const authHeader = req.headers.get('Authorization');
  const workerSecret = process.env.WORKER_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!authHeader || authHeader !== `Bearer ${workerSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 요청 파싱 (빈 body 허용)
  let workerOptions = { limit: 5, dry_run: false };
  try {
    const rawBody = await req.text();
    if (rawBody.trim()) {
      const parsed = WorkerRequestSchema.safeParse(JSON.parse(rawBody));
      if (parsed.success && parsed.data) {
        workerOptions = { ...workerOptions, ...parsed.data };
      }
    }
  } catch {
    // 빈 body 무시
  }

  const { limit, dry_run } = workerOptions;
  const serviceClient = createServiceClient();

  // gen_jobs 큐에서 작업 dequeue (FOR UPDATE SKIP LOCKED)
  const { data: jobs, error: dequeueError } = await serviceClient.rpc(
    'dequeue_jobs',
    { job_limit: limit }
  );

  if (dequeueError) {
    console.error('[Worker] dequeue error:', dequeueError);
    return Response.json(
      { error: 'Failed to dequeue jobs' },
      { status: 500 }
    );
  }

  const jobList = (jobs as GenJob[]) ?? [];

  if (jobList.length === 0) {
    return Response.json({
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 1,
      jobs: [],
    });
  }

  if (dry_run) {
    return Response.json({
      processed: jobList.length,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      jobs: jobList.map((j) => ({
        id: j.id,
        type: j.type,
        status: 'done' as const,
        duration_ms: 0,
      })),
    });
  }

  // 작업 병렬 처리
  const results = await Promise.allSettled(
    jobList.map((job) => processJob(serviceClient, job))
  );

  const jobResults = results.map((result, i) => {
    const job = jobList[i];
    if (result.status === 'fulfilled') {
      return {
        id: job.id,
        type: job.type,
        status: 'done' as const,
        tokens: result.value.tokens,
        cost_usd: result.value.cost,
        duration_ms: result.value.duration_ms,
      };
    } else {
      return {
        id: job.id,
        type: job.type,
        status: 'failed' as const,
        duration_ms: 0,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      };
    }
  });

  const succeeded = jobResults.filter((j) => j.status === 'done').length;
  const failed = jobResults.filter((j) => j.status === 'failed').length;

  return Response.json({
    processed: jobList.length,
    succeeded,
    failed,
    skipped: 0,
    jobs: jobResults,
  });
}

interface JobResult {
  tokens: number;
  cost: number;
  duration_ms: number;
}

async function processJob(
  serviceClient: ReturnType<typeof createServiceClient>,
  job: GenJob
): Promise<JobResult> {
  const startTime = Date.now();

  try {
    let result: { tokens: number; cost: number };

    if (job.type === 'curriculum_calibration') {
      result = await processCurriculumCalibration(serviceClient, job);
    } else if (job.type === 'unit_generation') {
      result = await processUnitGeneration(serviceClient, job);
    } else {
      throw new Error(`Unknown job type: ${job.type}`);
    }

    const duration_ms = Date.now() - startTime;

    await serviceClient
      .from('gen_jobs')
      .update({
        status: 'done',
        tokens: result.tokens,
        cost: result.cost,
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    return { ...result, duration_ms };
  } catch (err) {
    console.error(`[Worker] job ${job.id} failed:`, err);

    await serviceClient
      .from('gen_jobs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    throw err;
  }
}

// curriculum_calibration: 학습 목표 → concept_key 목록 생성 → unit 레코드 + unit_generation 작업 적재
async function processCurriculumCalibration(
  serviceClient: ReturnType<typeof createServiceClient>,
  job: GenJob
): Promise<{ tokens: number; cost: number }> {
  const payload = job.payload as unknown as CurriculumCalibrationPayload;

  const calibratorOutput = await runCalibrator(
    payload.goal_text,
    payload.level_target,
    payload.time_budget_hours_per_week,
    job.id
  );

  // curriculum_units 생성
  const units = calibratorOutput.concepts.map((concept) => ({
    curriculum_id: payload.curriculum_id,
    concept_key: concept.concept_key,
    title: concept.title,
    order_idx: concept.order_idx,
    role: concept.role,
    status: 'pending' as const,
  }));

  const { data: insertedUnits, error: unitsError } = await serviceClient
    .from('curriculum_units')
    .insert(units)
    .select('id, concept_key, order_idx, role');

  if (unitsError || !insertedUnits) {
    throw new Error(`Failed to insert curriculum_units: ${unitsError?.message}`);
  }

  // 각 유닛에 대해 unit_generation gen_jobs 생성
  const formats: Array<'analogy' | 'code' | 'visual'> = ['code', 'analogy', 'visual'];
  const unitJobs = insertedUnits.flatMap((unit) =>
    formats.map((format, formatIdx) => ({
      type: 'unit_generation',
      payload: {
        curriculum_id: payload.curriculum_id,
        curriculum_unit_id: unit.id,
        concept_key: unit.concept_key,
        level: payload.level_target,
        format,
        goal_text: payload.goal_text,
        owner_id: payload.owner_id,
      },
      status: 'queued',
      // code format 우선, 그 다음 analogy, visual
      priority: unit.role === 'core' ? 2 + formatIdx : 4 + formatIdx,
    }))
  );

  await serviceClient.from('gen_jobs').insert(unitJobs);

  // 토큰 추정 (Calibrator 호출 기준)
  const estimatedTokens = calibratorOutput.concepts.length * 150 + 500;
  return {
    tokens: estimatedTokens,
    cost: (estimatedTokens / 1_000_000) * 3.0,
  };
}

// unit_generation: P-C-S-M-A 콘텐츠 생성 → 샌드박스 검증 → unit_variants 적재
async function processUnitGeneration(
  serviceClient: ReturnType<typeof createServiceClient>,
  job: GenJob
): Promise<{ tokens: number; cost: number }> {
  const payload = job.payload as unknown as UnitGenerationPayload;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5000';

  let content = await runWriter(
    payload.concept_key,
    payload.level,
    payload.goal_text,
    job.id
  );

  // Grounding: 코드 실행 검증 (실패 시 최대 2회 재시도)
  let groundingPassed = false;
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const groundingResult = await runGrounding(content, appUrl);
    if (groundingResult.passed) {
      groundingPassed = true;
      break;
    }

    if (attempt < MAX_RETRIES) {
      // Writer 재호출
      content = await runWriter(
        payload.concept_key,
        payload.level,
        payload.goal_text
      );
    }
  }

  if (!groundingPassed) {
    console.warn(
      `[Worker] Grounding failed for ${payload.concept_key} after ${MAX_RETRIES + 1} attempts`
    );
  }

  // Self-Check
  const selfCheckResult = await runSelfCheck(content, payload.concept_key);
  const qualityScore = selfCheckResult.quality_score;

  // unit_variants 적재
  const variantStatus = isSelfCheckPassed(selfCheckResult) ? 'verified' : 'draft';
  const defaultProvider = process.env.DEFAULT_LLM_PROVIDER ?? 'google';
  const defaultModel = defaultProvider === 'anthropic' ? 'claude-sonnet-4-6' : 'gemini-2.0-flash';

  const { data: variant, error: variantError } = await serviceClient
    .from('unit_variants')
    .insert({
      concept_key: payload.concept_key,
      level: payload.level,
      format: payload.format,
      content,
      source_meta: {
        provider: defaultProvider,
        model: defaultModel,
        generated_at: new Date().toISOString(),
      },
      quality_score: qualityScore,
      status: variantStatus,
    })
    .select('id')
    .single();

  if (variantError || !variant) {
    throw new Error(`Failed to insert unit_variant: ${variantError?.message}`);
  }

  // assessment_items 저장 (concept_key당 1개, 첫 verified variant만 저장)
  if (variantStatus === 'verified') {
    const { count } = await serviceClient
      .from('assessment_items')
      .select('id', { count: 'exact', head: true })
      .eq('concept_key', payload.concept_key);

    if (!count || count === 0) {
      const assessment = content.A;
      await serviceClient.from('assessment_items').insert({
        concept_key: payload.concept_key,
        type: assessment.type,
        stem: assessment.stem,
        options: assessment.options,
        answer: assessment.answer,
        rationale: assessment.rationale,
        difficulty: 0.5,
      });
    }
  }

  // curriculum_unit status 업데이트 (verified variant가 있으면 ready)
  if (variantStatus === 'verified') {
    await serviceClient
      .from('curriculum_units')
      .update({ status: 'ready' })
      .eq('id', payload.curriculum_unit_id);

    // 모든 core 유닛이 ready면 curricula status = 'active'
    const { data: pendingCoreUnits } = await serviceClient
      .from('curriculum_units')
      .select('id')
      .eq('curriculum_id', payload.curriculum_id)
      .eq('role', 'core')
      .neq('status', 'ready');

    if (!pendingCoreUnits || pendingCoreUnits.length === 0) {
      await serviceClient
        .from('curricula')
        .update({ status: 'active' })
        .eq('id', payload.curriculum_id);
    }
  }

  // 토큰 추정 (Writer + Self-Check 기준)
  const estimatedTokens = 3000 + 800;
  const costPer1M = defaultProvider === 'anthropic' ? (3.0 * 0.8 + 0.25 * 0.2) : 0.1;
  return {
    tokens: estimatedTokens,
    cost: (estimatedTokens / 1_000_000) * costPer1M,
  };
}
