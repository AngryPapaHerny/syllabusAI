-- ============================================================
-- syllabusAI pg_cron 설정
-- ============================================================
-- 실행 전 필수 설정:
-- ALTER DATABASE postgres SET app.edge_function_url = 'https://<project-ref>.supabase.co/functions/v1';
-- ALTER DATABASE postgres SET app.service_role_key = '<service_role_key>';
-- ============================================================

-- gen-worker: 2분마다 gen_jobs 큐 처리
SELECT cron.schedule(
  'gen-worker-trigger',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.edge_function_url') || '/gen-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    )
  $$
);

-- stale-job-reset: 30분마다 장시간 running 작업 복구
SELECT cron.schedule(
  'stale-job-reset',
  '*/30 * * * *',
  $$SELECT reset_stale_jobs(15)$$
);

-- 기존 스케줄 존재 시 중복 방지를 위한 upsert 패턴 (이미 등록된 경우 무시)
-- cron.schedule은 동일 이름 존재 시 업데이트로 동작
