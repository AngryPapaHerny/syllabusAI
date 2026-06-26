import { z } from 'zod';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';

const CreateCurriculumSchema = z.object({
  goal_text: z.string().min(10).max(500),
  domain: z.enum(['coding', 'general']).default('coding'),
  level_target: z.enum(['beginner', 'intermediate', 'advanced']),
  time_budget_hours_per_week: z.number().int().min(1).max(40),
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

  const parsed = CreateCurriculumSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { goal_text, domain, level_target, time_budget_hours_per_week } =
    parsed.data;

  // Service role 클라이언트로 curricula 생성 (RLS 우회 불필요하지만 gen_jobs 쓰기용으로 일관성 유지)
  const serviceClient = createServiceClient();

  // curricula 레코드 생성
  const { data: curriculum, error: curriculumError } = await serviceClient
    .from('curricula')
    .insert({
      owner_id: user.id,
      goal_text,
      domain,
      level_target,
      time_budget_hours_per_week,
      status: 'generating',
    })
    .select()
    .single();

  if (curriculumError || !curriculum) {
    console.error('[POST /api/curricula] curricula insert error:', curriculumError);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }

  // gen_jobs에 curriculum_calibration 작업 큐잉
  const { error: jobError } = await serviceClient.from('gen_jobs').insert({
    type: 'curriculum_calibration',
    payload: {
      curriculum_id: curriculum.id,
      goal_text,
      domain,
      level_target,
      time_budget_hours_per_week,
      owner_id: user.id,
    },
    status: 'queued',
    priority: 1, // 캘리브레이션은 최우선
  });

  if (jobError) {
    console.error('[POST /api/curricula] gen_jobs insert error:', jobError);
  }

  // 워커를 비동기로 즉시 트리거 (fire-and-forget)
  if (!jobError) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5000';
    const workerSecret =
      process.env.WORKER_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    fetch(`${appUrl}/api/gen/worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify({ limit: 10 }),
    }).catch((err) =>
      console.error('[POST /api/curricula] worker trigger error:', err)
    );
  }

  return Response.json(
    {
      curriculum,
      jobs_queued: jobError ? 0 : 1,
    },
    { status: 201 }
  );
}
