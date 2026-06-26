-- ============================================================
-- syllabusAI 성능 인덱스
-- ============================================================

-- ============================================================
-- curricula
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_curricula_owner_id
  ON curricula (owner_id);

CREATE INDEX IF NOT EXISTS idx_curricula_status
  ON curricula (status);

-- ============================================================
-- curriculum_units
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_curriculum_units_curriculum_id
  ON curriculum_units (curriculum_id);

CREATE INDEX IF NOT EXISTS idx_curriculum_units_concept_key
  ON curriculum_units (concept_key);

CREATE INDEX IF NOT EXISTS idx_curriculum_units_status
  ON curriculum_units (curriculum_id, status);

-- ============================================================
-- unit_variants
-- 생성 파이프라인 조회: concept_key × level × format
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_unit_variants_concept_level_format
  ON unit_variants (concept_key, level, format)
  WHERE status = 'verified';

-- ============================================================
-- assessment_items
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_assessment_items_concept_key
  ON assessment_items (concept_key);

CREATE INDEX IF NOT EXISTS idx_assessment_items_type
  ON assessment_items (concept_key, type);

-- ============================================================
-- learner_concept_mastery
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_mastery_user_id
  ON learner_concept_mastery (user_id);

-- Phase 1 대비: 복습 스케줄 (현재는 사용 안 함, 인덱스만 준비)
CREATE INDEX IF NOT EXISTS idx_mastery_next_review
  ON learner_concept_mastery (next_review_at)
  WHERE next_review_at IS NOT NULL;

-- ============================================================
-- attempts
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_attempts_user_id
  ON attempts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_attempts_item_id
  ON attempts (item_id);

-- ============================================================
-- gen_jobs
-- 워커 큐 조회: 상태 + 우선순위 + 생성 시간
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_gen_jobs_queue
  ON gen_jobs (status, priority ASC, created_at ASC)
  WHERE status = 'queued';

-- 모니터링: 최근 실패 작업
CREATE INDEX IF NOT EXISTS idx_gen_jobs_failed
  ON gen_jobs (created_at DESC)
  WHERE status = 'failed';
