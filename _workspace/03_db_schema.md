# syllabusAI — DB 스키마 설계

---

## 1. 확정된 8개 테이블 DDL (PostgreSQL / Supabase 호환)

```sql
-- ============================================================
-- 확장 활성화
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_cron";    -- 워커 스케줄
CREATE EXTENSION IF NOT EXISTS "pg_net";     -- Edge Function HTTP 호출

-- ============================================================
-- 1. profiles
-- ============================================================
CREATE TABLE profiles (
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
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 2. curricula
-- ============================================================
CREATE TABLE curricula (
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
CREATE TABLE curriculum_units (
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
CREATE TABLE unit_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_key   TEXT NOT NULL,
  level         TEXT NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  format        TEXT NOT NULL CHECK (format IN ('analogy', 'code', 'visual')),
  content       JSONB NOT NULL,
  -- content 스키마: { P: string, C: string, S: string, M: string,
  --   A: { type: 'mcq'|'code', stem: string, options: string[]|null,
  --        answer: { index?: number, code?: string }, rationale: string } }
  source_meta   JSONB,
  -- source_meta: { provider: string, model: string, generated_at: string }
  quality_score NUMERIC(3,2) CHECK (quality_score BETWEEN 0 AND 1),
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'verified', 'failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE unit_variants IS 'concept_key × level × format 조합 콘텐츠 변형';

-- ============================================================
-- 5. assessment_items
-- ============================================================
CREATE TABLE assessment_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_key TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('mcq', 'code')),
  stem        TEXT NOT NULL,
  options     JSONB,
  -- MCQ: ["선택지1", "선택지2", "선택지3", "선택지4"]
  -- code: null
  answer      JSONB NOT NULL,
  -- MCQ: { "index": 2 }
  -- code: { "code": "expected output or solution" }
  rationale   TEXT NOT NULL,
  difficulty  NUMERIC(3,2) CHECK (difficulty BETWEEN 0 AND 1),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE assessment_items IS '평가 문항 (MCQ + 코드)';

-- ============================================================
-- 6. learner_concept_mastery
-- ============================================================
CREATE TABLE learner_concept_mastery (
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
CREATE TABLE attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  item_id      UUID NOT NULL REFERENCES assessment_items(id) ON DELETE CASCADE,
  answer       JSONB NOT NULL,
  correct      BOOLEAN NOT NULL,
  failure_type TEXT CHECK (failure_type IN ('gap', 'misconception', 'slip')),
  -- null = 정답
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE attempts IS '평가 시도 기록 (채점 결과 + 오류 유형)';

-- ============================================================
-- 8. gen_jobs
-- ============================================================
CREATE TABLE gen_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,
  -- 'unit_generation' | 'assessment_generation' | 'curriculum_calibration'
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'done', 'failed')),
  priority    INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  -- 낮은 숫자 = 높은 우선순위
  provider    TEXT CHECK (provider IN ('anthropic', 'openai', 'google')),
  model       TEXT,
  tokens      INTEGER,
  cost        NUMERIC(10,6),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
COMMENT ON TABLE gen_jobs IS 'LLM 생성 작업 큐 (비동기 워커 처리)';
```

---

## 2. RLS 정책 SQL

```sql
-- ============================================================
-- profiles RLS
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================
-- curricula RLS
-- ============================================================
ALTER TABLE curricula ENABLE ROW LEVEL SECURITY;

CREATE POLICY "curricula_all_own"
  ON curricula FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ============================================================
-- curriculum_units RLS (curricula를 통한 소유권 확인)
-- ============================================================
ALTER TABLE curriculum_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "curriculum_units_all_own"
  ON curriculum_units FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM curricula
      WHERE curricula.id = curriculum_units.curriculum_id
        AND curricula.owner_id = auth.uid()
    )
  );

-- ============================================================
-- unit_variants RLS
-- 콘텐츠 자체는 공유 가능 (concept_key 기반 재사용 설계)
-- Phase 0: 인증된 사용자는 모두 읽기 가능, 쓰기는 service role만
-- ============================================================
ALTER TABLE unit_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unit_variants_select_authenticated"
  ON unit_variants FOR SELECT
  TO authenticated
  USING (status = 'verified');

-- INSERT/UPDATE는 service role만 (Edge Function 워커)

-- ============================================================
-- assessment_items RLS
-- unit_variants와 동일 — 인증된 사용자 읽기, 쓰기는 service role
-- ============================================================
ALTER TABLE assessment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assessment_items_select_authenticated"
  ON assessment_items FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- learner_concept_mastery RLS
-- ============================================================
ALTER TABLE learner_concept_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mastery_all_own"
  ON learner_concept_mastery FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- attempts RLS
-- ============================================================
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attempts_all_own"
  ON attempts FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- gen_jobs RLS
-- 일반 사용자: 자신의 커리큘럼 관련 job만 읽기 (payload.owner_id 비교)
-- 쓰기: service role만 (워커 전용)
-- ============================================================
ALTER TABLE gen_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gen_jobs_select_own"
  ON gen_jobs FOR SELECT
  TO authenticated
  USING (
    payload->>'owner_id' = auth.uid()::text
  );

-- INSERT/UPDATE/DELETE: service role key 사용 시 RLS 우회
```

---

## 3. 인덱스 정의

```sql
-- ============================================================
-- curricula
-- ============================================================
CREATE INDEX idx_curricula_owner_id
  ON curricula (owner_id);

CREATE INDEX idx_curricula_status
  ON curricula (status);

-- ============================================================
-- curriculum_units
-- ============================================================
CREATE INDEX idx_curriculum_units_curriculum_id
  ON curriculum_units (curriculum_id);

CREATE INDEX idx_curriculum_units_concept_key
  ON curriculum_units (concept_key);

CREATE INDEX idx_curriculum_units_status
  ON curriculum_units (curriculum_id, status);

-- ============================================================
-- unit_variants
-- ============================================================
-- 생성 파이프라인 조회: concept_key × level × format
CREATE INDEX idx_unit_variants_concept_level_format
  ON unit_variants (concept_key, level, format)
  WHERE status = 'verified';

-- ============================================================
-- assessment_items
-- ============================================================
CREATE INDEX idx_assessment_items_concept_key
  ON assessment_items (concept_key);

CREATE INDEX idx_assessment_items_type
  ON assessment_items (concept_key, type);

-- ============================================================
-- learner_concept_mastery
-- ============================================================
-- 사용자별 마스터리 조회
CREATE INDEX idx_mastery_user_id
  ON learner_concept_mastery (user_id);

-- Phase 1 대비: 복습 스케줄 (현재는 사용 안 함, 인덱스만 준비)
CREATE INDEX idx_mastery_next_review
  ON learner_concept_mastery (next_review_at)
  WHERE next_review_at IS NOT NULL;

-- ============================================================
-- attempts
-- ============================================================
CREATE INDEX idx_attempts_user_id
  ON attempts (user_id, created_at DESC);

CREATE INDEX idx_attempts_item_id
  ON attempts (item_id);

-- ============================================================
-- gen_jobs
-- ============================================================
-- 워커 큐 조회: 상태 + 우선순위 + 생성 시간
CREATE INDEX idx_gen_jobs_queue
  ON gen_jobs (status, priority ASC, created_at ASC)
  WHERE status = 'queued';

-- 모니터링: 최근 실패 작업
CREATE INDEX idx_gen_jobs_failed
  ON gen_jobs (created_at DESC)
  WHERE status = 'failed';
```

---

## 4. Supabase Edge Function 배포 구조

### 디렉토리 구조

```
supabase/
├── functions/
│   └── gen-worker/
│       ├── index.ts           # Edge Function 진입점
│       ├── pipeline/
│       │   ├── calibrator.ts  # 주제 → concept_key 목록
│       │   ├── grounding.ts   # 코드 샌드박스 검증
│       │   ├── writer.ts      # P-C-S-M-A 생성
│       │   └── self-check.ts  # 품질 검증
│       └── deno.json          # Deno 설정 (import map)
├── migrations/                # 마이그레이션 파일 (아래 참조)
└── config.toml                # Supabase 프로젝트 설정
```

### gen-worker Edge Function 핵심 코드

```typescript
// supabase/functions/gen-worker/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface GenJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
    { auth: { persistSession: false } }
  );

  // 큐에서 최대 5개 작업 가져오기 (FOR UPDATE SKIP LOCKED)
  const { data: jobs, error } = await supabase
    .rpc('dequeue_jobs', { job_limit: 5 });

  if (error || !jobs?.length) {
    return new Response(
      JSON.stringify({ processed: 0, succeeded: 0, failed: 0, skipped: jobs?.length === 0 ? 1 : 0 }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  const results = await Promise.allSettled(
    (jobs as GenJob[]).map(job => processJob(supabase, job))
  );

  const summary = results.reduce(
    (acc, r) => ({ ...acc, [r.status === 'fulfilled' ? 'succeeded' : 'failed']: acc[r.status === 'fulfilled' ? 'succeeded' : 'failed'] + 1 }),
    { succeeded: 0, failed: 0 }
  );

  return new Response(
    JSON.stringify({ processed: jobs.length, ...summary, skipped: 0 }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
```

### dequeue_jobs RPC 함수

```sql
-- 워커가 호출하는 큐 디큐 함수 (SKIP LOCKED으로 중복 처리 방지)
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
```

### Edge Function 배포 명령

```bash
# 로컬 개발
supabase functions serve gen-worker --env-file .env.local

# 프로덕션 배포
supabase functions deploy gen-worker --no-verify-jwt

# 환경변수 설정
supabase secrets set ANTHROPIC_API_KEY=<key>
supabase secrets set SANDBOX_API_URL=<url>
supabase secrets set SANDBOX_API_KEY=<key>
```

---

## 5. 마이그레이션 파일 목록

```
supabase/migrations/
├── 20260611_001_init_schema.sql          -- 8개 테이블 DDL + 트리거
├── 20260611_002_rls_policies.sql         -- RLS 정책 (모든 테이블)
├── 20260611_003_indexes.sql              -- 성능 인덱스 (11개)
└── 20260611_004_gen_jobs_cron.sql        -- dequeue_jobs RPC + pg_cron 설정
```

### 20260611_004_gen_jobs_cron.sql 내용

```sql
-- dequeue_jobs RPC (위에 정의)
-- (본 파일에 포함)

-- pg_cron: gen-worker Edge Function을 2분마다 호출
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

-- app.edge_function_url, app.service_role_key는 Supabase Vault 또는
-- ALTER DATABASE SET 으로 설정:
-- ALTER DATABASE postgres SET app.edge_function_url = 'https://<project>.supabase.co/functions/v1';
-- ALTER DATABASE postgres SET app.service_role_key = '<service_role_key>';
```

---

## 6. TypeScript 타입 정의 (Supabase 생성 타입 확장)

```typescript
// types/database.ts

// Supabase CLI로 생성: supabase gen types typescript --project-id <id> > types/database.ts

// P-C-S-M-A 콘텐츠 타입 (unit_variants.content jsonb 구조)
export interface UnitVariantContent {
  P: string;  // 문제 제기
  C: string;  // 개념 설명
  S: string;  // 코드 스니펫 (실행 검증됨)
  M: string;  // 동기 부여
  A: {
    type: 'mcq' | 'code';
    stem: string;
    options: string[] | null;  // MCQ: 4개 항목, code: null
    answer: {
      index?: number;    // MCQ 정답 인덱스 (0~3)
      code?: string;     // 코드 문항 정답/기대 출력
    };
    rationale: string;
  };
}

// gen_jobs.payload 타입
export interface UnitGenerationPayload {
  curriculum_id: string;
  curriculum_unit_id: string;
  concept_key: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  format: 'analogy' | 'code' | 'visual';
  goal_text: string;
  owner_id: string;
  retry_count?: number;  // 재시도 횟수 (최대 2)
}
```
