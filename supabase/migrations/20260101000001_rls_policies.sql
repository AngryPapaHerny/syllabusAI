-- ============================================================
-- syllabusAI RLS 정책
-- ============================================================

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
-- Phase 0: 인증된 사용자는 verified 상태만 읽기 가능
-- INSERT/UPDATE는 service role만 (Edge Function 워커)
-- ============================================================
ALTER TABLE unit_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unit_variants_select_authenticated"
  ON unit_variants FOR SELECT
  TO authenticated
  USING (status = 'verified');

-- ============================================================
-- assessment_items RLS
-- 인증된 사용자 읽기 가능, 쓰기는 service role만
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
-- 쓰기: service role만 (워커 전용, RLS 우회)
-- ============================================================
ALTER TABLE gen_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gen_jobs_select_own"
  ON gen_jobs FOR SELECT
  TO authenticated
  USING (
    payload->>'owner_id' = auth.uid()::text
  );
