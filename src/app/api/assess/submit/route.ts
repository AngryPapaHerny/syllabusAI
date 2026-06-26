import { z } from 'zod';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { generateWithSchema } from '@/lib/llm/gateway';
import { failureTypePrompt } from '@/lib/llm/prompts';

const AssessSubmitSchema = z.object({
  item_id: z.string().uuid(),
  curriculum_id: z.string().uuid(),
  concept_key: z.string(),
  answer: z.union([
    z.object({ type: z.literal('mcq'), index: z.number().int().min(0).max(3) }),
    z.object({ type: z.literal('code'), code: z.string().max(10000) }),
  ]),
});

const FailureTypeSchema = z.object({
  failure_type: z.enum(['gap', 'misconception', 'slip']).nullable(),
});

export async function POST(req: Request) {
  // 인증 확인
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 요청 검증
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = AssessSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { item_id, curriculum_id, concept_key, answer } = parsed.data;

  // assessment_item 조회
  const { data: item, error: itemError } = await supabase
    .from('assessment_items')
    .select('*')
    .eq('id', item_id)
    .single();

  if (itemError || !item) {
    return Response.json({ error: 'Assessment item not found' }, { status: 404 });
  }

  // 코드 문항: 샌드박스 실행
  let executionResult:
    | { stdout: string; stderr: string; exit_code: number }
    | undefined;

  if (answer.type === 'code') {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5000';
    try {
      const workerSecret =
        process.env.WORKER_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
      const runResponse = await fetch(`${appUrl}/api/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${workerSecret}`,
        },
        body: JSON.stringify({
          language: 'python',
          code: answer.code,
          _internal_pipeline: true,
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (runResponse.ok) {
        const runResult = await runResponse.json();
        if (runResult.timed_out) {
          return Response.json(
            { error: 'Code execution timeout', code: 'SANDBOX_TIMEOUT' },
            { status: 422 }
          );
        }
        executionResult = {
          stdout: runResult.stdout,
          stderr: runResult.stderr,
          exit_code: runResult.exit_code,
        };
      }
    } catch (err) {
      console.error('[POST /api/assess/submit] sandbox error:', err);
    }
  }

  // 채점
  const correct = gradeAnswer(item, answer, executionResult);

  // 현재 마스터리 조회
  const serviceClient = createServiceClient();
  const { data: currentMastery } = await supabase
    .from('learner_concept_mastery')
    .select('mastery, attempts')
    .eq('user_id', user.id)
    .eq('concept_key', concept_key)
    .single();

  const previousMastery = currentMastery?.mastery ?? 0;
  const previousAttempts = currentMastery?.attempts ?? 0;

  // failure_type 분류 (오답인 경우에만)
  let failureType: 'gap' | 'misconception' | 'slip' | null = null;
  if (!correct) {
    try {
      const { system, user } = failureTypePrompt(
        concept_key,
        item.answer as Record<string, unknown>,
        answer as Record<string, unknown>,
        previousMastery,
        previousAttempts
      );
      const result = await generateWithSchema(FailureTypeSchema, user, {
        tier: 'low',
        system,
      });
      failureType = result.object.failure_type;
    } catch {
      // failure_type 분류 실패 시 기본값 사용
      failureType = previousMastery < 0.3 ? 'gap' : 'slip';
    }
  }

  // 마스터리 업데이트
  const newMastery = calculateNewMastery(previousMastery, correct, previousAttempts);

  await serviceClient.from('learner_concept_mastery').upsert(
    {
      user_id: user.id,
      concept_key,
      mastery: newMastery,
      last_seen: new Date().toISOString(),
      attempts: previousAttempts + 1,
    },
    { onConflict: 'user_id,concept_key' }
  );

  // attempts 기록
  await serviceClient.from('attempts').insert({
    user_id: user.id,
    item_id,
    answer: answer as Record<string, unknown>,
    correct,
    failure_type: failureType,
  });

  // 재학습 분기 판정
  const nextAction = await determineNextAction(
    supabase,
    curriculum_id,
    concept_key,
    correct,
    failureType,
    item.difficulty
  );

  return Response.json({
    correct,
    failure_type: failureType,
    rationale: item.rationale,
    mastery_updated: {
      concept_key,
      previous_mastery: previousMastery,
      new_mastery: newMastery,
    },
    next_action: nextAction,
    ...(executionResult ? { execution_result: executionResult } : {}),
  });
}

function gradeAnswer(
  item: { type: string; answer: Record<string, unknown> },
  submitted: { type: string; index?: number; code?: string },
  executionResult?: { stdout: string; exit_code: number }
): boolean {
  if (item.type === 'mcq' && submitted.type === 'mcq') {
    return (item.answer as { index?: number }).index === submitted.index;
  }
  if (item.type === 'code' && submitted.type === 'code') {
    if (!executionResult) return false;
    if (executionResult.exit_code !== 0) return false;
    // 기대 출력과 실제 출력 비교
    const expectedOutput = (item.answer as { code?: string }).code?.trim();
    const actualOutput = executionResult.stdout.trim();
    return expectedOutput === actualOutput;
  }
  return false;
}

function calculateNewMastery(
  previousMastery: number,
  correct: boolean,
  attempts: number
): number {
  // 지수 이동 평균 기반 마스터리 업데이트
  const alpha = Math.max(0.1, 1 / (attempts + 1)); // 학습률 (시간이 지날수록 감소)
  const target = correct ? 1.0 : 0.0;
  const newMastery = previousMastery + alpha * (target - previousMastery);
  return Math.min(1.0, Math.max(0.0, Math.round(newMastery * 1000) / 1000));
}

async function determineNextAction(
  supabase: ReturnType<typeof createServerClient>,
  curriculumId: string,
  conceptKey: string,
  correct: boolean,
  failureType: string | null,
  difficulty: number | null
) {
  if (correct) {
    // 다음 유닛 찾기
    const { data: currentUnit } = await supabase
      .from('curriculum_units')
      .select('order_idx')
      .eq('curriculum_id', curriculumId)
      .eq('concept_key', conceptKey)
      .single();

    if (currentUnit) {
      const { data: nextUnit } = await supabase
        .from('curriculum_units')
        .select('id')
        .eq('curriculum_id', curriculumId)
        .gt('order_idx', currentUnit.order_idx)
        .eq('status', 'ready')
        .order('order_idx', { ascending: true })
        .limit(1)
        .single();

      if (nextUnit) {
        return { type: 'next_unit' as const, next_unit_id: nextUnit.id };
      }
    }
    return { type: 'next_unit' as const };
  }

  // 오답: gap이면 remediation 유닛 찾기
  if (failureType === 'gap') {
    const { data: remediationUnit } = await supabase
      .from('curriculum_units')
      .select('id, concept_key')
      .eq('curriculum_id', curriculumId)
      .eq('role', 'remediation')
      .eq('status', 'ready')
      .limit(1)
      .single();

    if (remediationUnit) {
      const { data: variant } = await supabase
        .from('unit_variants')
        .select('id')
        .eq('concept_key', remediationUnit.concept_key)
        .eq('status', 'verified')
        .limit(1)
        .single();

      return {
        type: 'remediation' as const,
        remediation_unit_id: remediationUnit.id,
        remediation_variant_id: variant?.id,
        remediation_concept_key: remediationUnit.concept_key,
      };
    }
  }

  // misconception 또는 slip: 재시도
  return { type: 'retry' as const };
}
