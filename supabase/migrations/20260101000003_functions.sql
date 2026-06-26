-- ============================================================
-- syllabusAI DB 함수
-- ============================================================

-- ============================================================
-- dequeue_jobs: 워커 큐 디큐 함수 (FOR UPDATE SKIP LOCKED)
-- 중복 처리 방지: 여러 워커 인스턴스가 동시에 호출해도 안전
-- ============================================================
CREATE OR REPLACE FUNCTION dequeue_jobs(job_limit INTEGER DEFAULT 5)
RETURNS SETOF gen_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE gen_jobs
  SET status = 'running'
  WHERE id IN (
    SELECT id FROM gen_jobs
    WHERE status = 'queued'
    ORDER BY priority ASC, created_at ASC
    LIMIT job_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION dequeue_jobs IS '큐에서 작업을 가져와 running 상태로 변경 (SKIP LOCKED으로 중복 처리 방지)';

-- ============================================================
-- get_curriculum_progress: 커리큘럼 진도 집계 함수
-- ============================================================
CREATE OR REPLACE FUNCTION get_curriculum_progress(p_curriculum_id UUID)
RETURNS TABLE (
  total_units INTEGER,
  ready_units INTEGER,
  failed_units INTEGER,
  progress_percent NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER AS total_units,
    COUNT(*) FILTER (WHERE status = 'ready')::INTEGER AS ready_units,
    COUNT(*) FILTER (WHERE status = 'failed')::INTEGER AS failed_units,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(
        COUNT(*) FILTER (WHERE status = 'ready')::NUMERIC / COUNT(*)::NUMERIC * 100,
        1
      )
    END AS progress_percent
  FROM curriculum_units
  WHERE curriculum_id = p_curriculum_id;
END;
$$;

-- ============================================================
-- reset_stale_jobs: 장시간 running 상태인 작업을 queued로 재설정
-- (워커 크래시 복구용, pg_cron에서 주기적으로 호출)
-- ============================================================
CREATE OR REPLACE FUNCTION reset_stale_jobs(stale_minutes INTEGER DEFAULT 15)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reset_count INTEGER;
BEGIN
  UPDATE gen_jobs
  SET
    status = 'queued',
    -- 재시도 횟수 추적을 위해 payload에 retry 카운트 증가
    payload = jsonb_set(
      payload,
      '{retry_count}',
      to_jsonb(COALESCE((payload->>'retry_count')::INTEGER, 0) + 1)
    )
  WHERE
    status = 'running'
    AND created_at < NOW() - (stale_minutes || ' minutes')::INTERVAL;

  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RETURN reset_count;
END;
$$;

COMMENT ON FUNCTION reset_stale_jobs IS '장시간 running 상태 작업을 queued로 재설정 (워커 크래시 복구)';
