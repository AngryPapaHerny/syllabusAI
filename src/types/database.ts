// P-C-S-M-A 콘텐츠 타입 (unit_variants.content jsonb 구조)
export interface UnitVariantContent {
  P: string; // 문제 제기
  C: string; // 개념 설명
  S: string; // 코드 스니펫 (실행 검증됨)
  M: string; // 동기 부여
  A: {
    type: 'mcq' | 'code';
    stem: string;
    options: string[] | null; // MCQ: 4개 항목, code: null
    answer: {
      index?: number; // MCQ 정답 인덱스 (0~3)
      code?: string; // 코드 문항 정답/기대 출력
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
  retry_count?: number;
}

export interface CurriculumCalibrationPayload {
  curriculum_id: string;
  goal_text: string;
  domain: string;
  level_target: 'beginner' | 'intermediate' | 'advanced';
  time_budget_hours_per_week: number;
  owner_id: string;
}

// DB 로우 타입
export interface Profile {
  user_id: string;
  display_name: string | null;
  created_at: string;
}

export interface Curriculum {
  id: string;
  owner_id: string;
  goal_text: string;
  domain: string;
  level_target: 'beginner' | 'intermediate' | 'advanced';
  time_budget_hours_per_week: number;
  status: 'generating' | 'active' | 'archived';
  created_at: string;
}

export interface CurriculumUnit {
  id: string;
  curriculum_id: string;
  concept_key: string;
  title: string;
  order_idx: number;
  role: 'core' | 'optional' | 'remediation';
  status: 'pending' | 'ready' | 'failed';
}

export interface UnitVariant {
  id: string;
  concept_key: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  format: 'analogy' | 'code' | 'visual';
  content: UnitVariantContent;
  source_meta: {
    provider: string;
    model: string;
    generated_at: string;
  } | null;
  quality_score: number | null;
  status: 'draft' | 'verified' | 'failed';
  created_at: string;
}

export interface AssessmentItem {
  id: string;
  concept_key: string;
  type: 'mcq' | 'code';
  stem: string;
  options: string[] | null;
  answer: { index?: number; code?: string };
  rationale: string;
  difficulty: number | null;
  created_at: string;
}

export interface LearnerConceptMastery {
  user_id: string;
  concept_key: string;
  mastery: number;
  last_seen: string | null;
  next_review_at: string | null;
  attempts: number;
}

export interface Attempt {
  id: string;
  user_id: string;
  item_id: string;
  answer: { index?: number; code?: string };
  correct: boolean;
  failure_type: 'gap' | 'misconception' | 'slip' | null;
  created_at: string;
}

export interface GenJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: 'queued' | 'running' | 'done' | 'failed';
  priority: number;
  provider: string | null;
  model: string | null;
  tokens: number | null;
  cost: number | null;
  created_at: string;
  finished_at: string | null;
}
