-- ============================================================
-- syllabusAI Phase 0 초기 스키마
-- ============================================================

-- 확장 활성화
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- ============================================================
-- 1. profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS '사용자 프로필 (auth.users 1:1 확장)';

-- auth.users 신규 가입 시 profiles 자동 생성 트리거
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. curricula
-- ============================================================
CREATE TABLE IF NOT EXISTS curricula (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                    UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  goal_text                   TEXT NOT NULL,
  domain                      TEXT NOT NULL DEFAULT 'coding'
                                CHECK (domain IN ('coding', 'general')),
  level_target                TEXT NOT NULL
                                CHECK (level_target IN ('beginner', 'intermediate', 'advanced')),
  time_budget_hours_per_week  INTEGER NOT NULL CHECK (time_budget_hours_per_week BETWEEN 1 AND 40),
  status                      TEXT NOT NULL DEFAULT 'generating'
                                CHECK (status IN ('generating', 'active', 'archived')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE curricula IS '사용자별 커리큘럼 (온보딩 결과)';

-- ============================================================
-- 3. curriculum_units
-- ============================================================
CREATE TABLE IF NOT EXISTS curriculum_units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id   UUID NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  concept_key     TEXT NOT NULL,
  title           TEXT NOT NULL,
  order_idx       INTEGER NOT NULL,
  role            TEXT NOT NULL DEFAULT 'core'
                    CHECK (role IN ('core', 'optional', 'remediation')),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'ready', 'failed')),
  UNIQUE (curriculum_id, order_idx)
);

COMMENT ON TABLE curriculum_units IS '커리큘럼 내 학습 단위 목록';

-- ============================================================
-- 4. unit_variants
-- ============================================================
CREATE TABLE IF NOT EXISTS unit_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_key   TEXT NOT NULL,
  level         TEXT NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  format        TEXT NOT NULL CHECK (format IN ('analogy', 'code', 'visual')),
  content       JSONB NOT NULL,
  source_meta   JSONB,
  quality_score NUMERIC(3,2) CHECK (quality_score BETWEEN 0 AND 1),
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'verified', 'failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE unit_variants IS 'concept_key × level × format 조합 콘텐츠 변형';

-- ============================================================
-- 5. assessment_items
-- ============================================================
CREATE TABLE IF NOT EXISTS assessment_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_key TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('mcq', 'code')),
  stem        TEXT NOT NULL,
  options     JSONB,
  answer      JSONB NOT NULL,
  rationale   TEXT NOT NULL,
  difficulty  NUMERIC(3,2) CHECK (difficulty BETWEEN 0 AND 1),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE assessment_items IS '평가 문항 (MCQ + 코드)';

-- ============================================================
-- 6. learner_concept_mastery
-- ============================================================
CREATE TABLE IF NOT EXISTS learner_concept_mastery (
  user_id        UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  concept_key    TEXT NOT NULL,
  mastery        NUMERIC(4,3) NOT NULL DEFAULT 0
                   CHECK (mastery BETWEEN 0 AND 1),
  last_seen      TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ,
  attempts       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, concept_key)
);

COMMENT ON TABLE learner_concept_mastery IS '학습자별 개념 마스터리 (Phase 0: 정답률 기반)';

-- ============================================================
-- 7. attempts
-- ============================================================
CREATE TABLE IF NOT EXISTS attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  item_id      UUID NOT NULL REFERENCES assessment_items(id) ON DELETE CASCADE,
  answer       JSONB NOT NULL,
  correct      BOOLEAN NOT NULL,
  failure_type TEXT CHECK (failure_type IN ('gap', 'misconception', 'slip')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE attempts IS '평가 시도 기록 (채점 결과 + 오류 유형)';

-- ============================================================
-- 8. gen_jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS gen_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'done', 'failed')),
  priority    INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  provider    TEXT CHECK (provider IN ('anthropic', 'openai', 'google')),
  model       TEXT,
  tokens      INTEGER,
  cost        NUMERIC(10,6),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

COMMENT ON TABLE gen_jobs IS 'LLM 생성 작업 큐 (비동기 워커 처리)';
