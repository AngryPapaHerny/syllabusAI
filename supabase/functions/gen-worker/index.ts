// Supabase Edge Function: gen-worker
// pg_cron에서 2분마다 호출되어 gen_jobs 큐를 처리하는 래퍼
// 실제 처리 로직은 Next.js /api/gen/worker Route Handler에 위임

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface WorkerResponse {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  jobs: Array<{
    id: string;
    type: string;
    status: 'done' | 'failed';
    tokens?: number;
    cost_usd?: number;
    duration_ms: number;
  }>;
}

Deno.serve(async (req: Request) => {
  // Service Role Key 검증
  const authHeader = req.headers.get('Authorization');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? Deno.env.get('APP_URL');

  if (!appUrl) {
    // APP_URL 미설정 시 직접 처리 모드
    return await processJobsDirectly(serviceRoleKey);
  }

  // Next.js Route Handler에 위임
  try {
    const response = await fetch(`${appUrl}/api/gen/worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ limit: 5 }),
    });

    const result: WorkerResponse = await response.json();

    return new Response(JSON.stringify(result), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[Edge Function gen-worker] error:', err);
    return new Response(
      JSON.stringify({ error: 'Worker invocation failed' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});

// APP_URL 미설정 시 Supabase 직접 처리 (폴백)
async function processJobsDirectly(serviceRoleKey: string): Promise<Response> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
    { auth: { persistSession: false } }
  );

  const { data: jobs, error } = await supabase.rpc('dequeue_jobs', {
    job_limit: 5,
  });

  if (error || !jobs?.length) {
    return new Response(
      JSON.stringify({
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 1,
        jobs: [],
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 직접 처리 모드에서는 작업을 queued로 되돌리고 에러 반환
  // (실제 LLM 처리는 Next.js 환경에서 수행)
  await supabase
    .from('gen_jobs')
    .update({ status: 'queued' })
    .in(
      'id',
      jobs.map((j: { id: string }) => j.id)
    );

  return new Response(
    JSON.stringify({
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: jobs.length,
      message: 'APP_URL not configured. Jobs returned to queue.',
      jobs: [],
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
