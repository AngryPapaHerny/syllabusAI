// API 요청/응답 타입 정의

// POST /api/curricula
export interface CreateCurriculumRequest {
  goal_text: string;
  domain: 'coding' | 'general';
  level_target: 'beginner' | 'intermediate' | 'advanced';
  time_budget_hours_per_week: number;
}

export interface CreateCurriculumResponse {
  curriculum: {
    id: string;
    owner_id: string;
    goal_text: string;
    domain: string;
    level_target: string;
    time_budget_hours_per_week: number;
    status: 'generating';
    created_at: string;
  };
  jobs_queued: number;
}

// GET /api/curricula/:id
export interface GetCurriculumResponse {
  curriculum: {
    id: string;
    goal_text: string;
    domain: string;
    level_target: string;
    time_budget_hours_per_week: number;
    status: 'generating' | 'active' | 'archived';
    created_at: string;
  };
  units: Array<{
    id: string;
    concept_key: string;
    title: string;
    order_idx: number;
    role: 'core' | 'optional' | 'remediation';
    status: 'pending' | 'ready' | 'failed';
    variant?: {
      id: string;
      format: 'analogy' | 'code' | 'visual';
      quality_score: number;
    };
  }>;
  progress: {
    total_units: number;
    ready_units: number;
    percent: number;
  };
}

// POST /api/diagnostic/submit
export interface DiagnosticSubmitRequest {
  curriculum_id: string;
  responses: Array<{
    concept_key: string;
    item_id: string;
    answer: { index: number } | { code: string };
  }>;
}

export interface DiagnosticSubmitResponse {
  mastery_initialized: number;
  mastery_summary: Array<{
    concept_key: string;
    mastery: number;
    status: 'needs_review' | 'proficient';
  }>;
  recommended_start_unit: {
    curriculum_unit_id: string;
    concept_key: string;
    title: string;
  } | null;
}

// POST /api/tutor
export interface TutorRequest {
  curriculum_id: string;
  concept_key: string;
  unit_variant_id?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  context?: {
    current_section?: 'P' | 'C' | 'S' | 'M' | 'A';
    user_code?: string;
    error_message?: string;
  };
}

// POST /api/assess/submit
export interface AssessSubmitRequest {
  item_id: string;
  curriculum_id: string;
  concept_key: string;
  answer:
    | { type: 'mcq'; index: number }
    | { type: 'code'; code: string };
}

export interface AssessSubmitResponse {
  correct: boolean;
  failure_type: 'gap' | 'misconception' | 'slip' | null;
  rationale: string;
  mastery_updated: {
    concept_key: string;
    previous_mastery: number;
    new_mastery: number;
  };
  next_action: {
    type: 'next_unit' | 'remediation' | 'retry';
    next_unit_id?: string;
    remediation_unit_id?: string;
    remediation_variant_id?: string;
    remediation_concept_key?: string;
  };
  execution_result?: {
    stdout: string;
    stderr: string;
    exit_code: number;
  };
}

// POST /api/run
export interface RunCodeRequest {
  language: 'python' | 'javascript' | 'typescript';
  code: string;
  stdin?: string;
  _internal_pipeline?: boolean;
}

export interface RunCodeResponse {
  stdout: string;
  stderr: string;
  exit_code: number;
  execution_time_ms: number;
  timed_out: boolean;
}

// POST /api/gen/worker
export interface WorkerRequest {
  limit?: number;
  dry_run?: boolean;
}

export interface WorkerResponse {
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

// 에러 응답
export interface ApiError {
  error: string;
  code?: string;
}
