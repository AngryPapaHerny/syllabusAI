# syllabusAI — API 명세

> 모든 엔드포인트는 zod 스키마로 요청·응답 검증.
> 인증된 엔드포인트는 Supabase Auth JWT를 쿠키에서 검증 (`auth.getUser()`).
> 에러 응답 형식: `{ error: string, code?: string }`

---

## 1. POST /api/curricula

**설명:** 온보딩 입력 → 커리큘럼 레코드 생성 + gen_jobs 큐 적재

**인증:** 필수 (RLS 적용 — `owner_id = auth.uid()`)

### Request Body

```typescript
// Zod 스키마
const CreateCurriculumSchema = z.object({
  goal_text: z.string().min(10).max(500),        // 학습 목표 ("파이썬으로 웹 스크래핑 마스터하기")
  domain: z.enum(['coding', 'general']).default('coding'),
  level_target: z.enum(['beginner', 'intermediate', 'advanced']),
  time_budget_hours_per_week: z.number().int().min(1).max(40),
});

type CreateCurriculumRequest = z.infer<typeof CreateCurriculumSchema>;
```

**예시:**
```json
{
  "goal_text": "파이썬으로 웹 스크래핑 마스터하기",
  "domain": "coding",
  "level_target": "beginner",
  "time_budget_hours_per_week": 5
}
```

### Response Body (201 Created)

```typescript
interface CreateCurriculumResponse {
  curriculum: {
    id: string;              // UUID
    owner_id: string;
    goal_text: string;
    domain: string;
    level_target: string;
    time_budget_hours_per_week: number;
    status: 'generating';
    created_at: string;      // ISO 8601
  };
  jobs_queued: number;       // 적재된 gen_jobs 수
}
```

**예시:**
```json
{
  "curriculum": {
    "id": "a1b2c3d4-...",
    "owner_id": "user-uuid",
    "goal_text": "파이썬으로 웹 스크래핑 마스터하기",
    "domain": "coding",
    "level_target": "beginner",
    "time_budget_hours_per_week": 5,
    "status": "generating",
    "created_at": "2026-06-12T09:00:00Z"
  },
  "jobs_queued": 8
}
```

### Error Cases

| 상태 코드 | 조건 | 메시지 |
|---|---|---|
| 400 | 요청 스키마 검증 실패 | `{ error: "goal_text must be at least 10 characters" }` |
| 401 | 미인증 요청 | `{ error: "Unauthorized" }` |
| 500 | DB 오류 또는 LLM Calibrator 실패 | `{ error: "Internal server error" }` |

---

## 2. GET /api/curricula/:id

**설명:** 특정 커리큘럼과 소속 유닛 목록 조회 (상태 폴링용)

**인증:** 필수 (RLS — owner_id = auth.uid() 자동 필터링)

### Request

- **Path Parameter:** `id` — 커리큘럼 UUID
- Request Body 없음

### Response Body (200 OK)

```typescript
interface GetCurriculumResponse {
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
    // status='ready'일 때만 포함
    variant?: {
      id: string;
      format: 'analogy' | 'code' | 'visual';
      quality_score: number;
    };
  }>;
  progress: {
    total_units: number;
    ready_units: number;
    percent: number;    // 0~100
  };
}
```

### Error Cases

| 상태 코드 | 조건 | 메시지 |
|---|---|---|
| 401 | 미인증 | `{ error: "Unauthorized" }` |
| 404 | 존재하지 않거나 다른 사용자 소유 (RLS) | `{ error: "Curriculum not found" }` |

---

## 3. POST /api/diagnostic/submit

**설명:** 진단 문항 응답 제출 → `learner_concept_mastery` 초기화/갱신

**인증:** 필수 (RLS — user_id = auth.uid())

### Request Body

```typescript
const DiagnosticSubmitSchema = z.object({
  curriculum_id: z.string().uuid(),
  responses: z.array(z.object({
    concept_key: z.string(),
    item_id: z.string().uuid(),
    answer: z.union([
      z.object({ index: z.number().int().min(0).max(3) }),  // MCQ
      z.object({ code: z.string() }),                        // 코드
    ]),
  })).min(1).max(20),
});
```

**예시:**
```json
{
  "curriculum_id": "a1b2c3d4-...",
  "responses": [
    { "concept_key": "python_variables", "item_id": "item-uuid-1", "answer": { "index": 2 } },
    { "concept_key": "python_loops",     "item_id": "item-uuid-2", "answer": { "index": 0 } }
  ]
}
```

### Response Body (200 OK)

```typescript
interface DiagnosticSubmitResponse {
  mastery_initialized: number;    // 초기화된 concept 수
  mastery_summary: Array<{
    concept_key: string;
    mastery: number;              // 0.0 ~ 1.0 (정답 비율 기반 초기값)
    status: 'needs_review' | 'proficient';
  }>;
  recommended_start_unit: {
    curriculum_unit_id: string;
    concept_key: string;
    title: string;
  } | null;
}
```

### Error Cases

| 상태 코드 | 조건 | 메시지 |
|---|---|---|
| 400 | 스키마 검증 실패 | `{ error: "..." }` |
| 401 | 미인증 | `{ error: "Unauthorized" }` |
| 404 | curriculum_id 없음 | `{ error: "Curriculum not found" }` |

---

## 4. POST /api/tutor (SSE 스트리밍)

**설명:** AI 튜터 소크라테스식 힌트·설명 스트리밍 응답

**인증:** 필수

**Content-Type 응답:** `text/event-stream`

### Request Body

```typescript
const TutorRequestSchema = z.object({
  curriculum_id: z.string().uuid(),
  concept_key: z.string(),
  unit_variant_id: z.string().uuid().optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(2000),
  })).min(1).max(20),
  // 현재 학습 맥락
  context: z.object({
    current_section: z.enum(['P', 'C', 'S', 'M', 'A']).optional(),
    user_code: z.string().max(5000).optional(),    // 코드 섹션에서 작성 중인 코드
    error_message: z.string().max(500).optional(), // 실행 오류
  }).optional(),
});
```

**예시:**
```json
{
  "curriculum_id": "a1b2c3d4-...",
  "concept_key": "python_list_comprehension",
  "messages": [
    { "role": "user", "content": "리스트 컴프리헨션이 왜 더 빠른가요?" }
  ],
  "context": { "current_section": "C" }
}
```

### Response (SSE Stream)

```
// Vercel AI SDK streamText 형식
data: {"type":"text-delta","textDelta":"리스트 컴프리헨션은 "}
data: {"type":"text-delta","textDelta":"C 레벨에서 최적화된 "}
data: {"type":"text-delta","textDelta":"내부 루프를 사용하기 때문에..."}
data: {"type":"finish","finishReason":"stop","usage":{"promptTokens":120,"completionTokens":85}}
data: [DONE]
```

**스트림 종료 후 기록:** `gen_jobs`에 tokens·cost 로깅 (background, 응답 완료 후)

### Error Cases

| 상태 코드 | 조건 | 메시지 |
|---|---|---|
| 400 | 스키마 검증 실패 | JSON 응답 `{ error: "..." }` (스트림 시작 전) |
| 401 | 미인증 | `{ error: "Unauthorized" }` |
| 503 | 모든 LLM 프로바이더 실패 | `{ error: "LLM service unavailable" }` |

---

## 5. POST /api/assess/submit

**설명:** 평가 답안 제출 → 채점 → `attempts` 기록 → 재학습 분기 판정

**인증:** 필수 (RLS — user_id = auth.uid())

### Request Body

```typescript
const AssessSubmitSchema = z.object({
  item_id: z.string().uuid(),
  curriculum_id: z.string().uuid(),
  concept_key: z.string(),
  answer: z.union([
    z.object({ type: z.literal('mcq'), index: z.number().int().min(0).max(3) }),
    z.object({ type: z.literal('code'), code: z.string().max(10000) }),
  ]),
});
```

**예시:**
```json
{
  "item_id": "item-uuid",
  "curriculum_id": "curric-uuid",
  "concept_key": "python_list_comprehension",
  "answer": { "type": "mcq", "index": 1 }
}
```

### Response Body (200 OK)

```typescript
interface AssessSubmitResponse {
  correct: boolean;
  failure_type: 'gap' | 'misconception' | 'slip' | null;
  rationale: string;           // 해설 텍스트
  mastery_updated: {
    concept_key: string;
    previous_mastery: number;
    new_mastery: number;
  };
  next_action: {
    type: 'next_unit' | 'remediation' | 'retry';
    // type='remediation'일 때
    remediation_variant_id?: string;
    remediation_concept_key?: string;
    // type='next_unit'일 때
    next_unit_id?: string;
  };
  // 코드 문항의 경우
  execution_result?: {
    stdout: string;
    stderr: string;
    exit_code: number;
  };
}
```

**failure_type 분류 로직:**
- `gap`: 관련 개념 미학습 (mastery < 0.3)
- `misconception`: 오답 패턴이 특정 오해와 일치
- `slip`: 실수성 오류 (이전에 정답 이력 있음)
- `null`: 정답

### Error Cases

| 상태 코드 | 조건 | 메시지 |
|---|---|---|
| 400 | 스키마 검증 실패 | `{ error: "..." }` |
| 401 | 미인증 | `{ error: "Unauthorized" }` |
| 404 | item_id 없음 | `{ error: "Assessment item not found" }` |
| 422 | 코드 문항 실행 타임아웃 | `{ error: "Code execution timeout", code: "SANDBOX_TIMEOUT" }` |

---

## 6. POST /api/run

**설명:** 코드 샌드박스 실행 (학습 뷰 실습 + gen-pipeline 검증 공용)

**인증:** 필수 (남용 방지)

**보안:**
- 외부 격리 API 경유 — 서버에서 직접 실행 금지
- 타임아웃 5초, 메모리 128MB, 네트워크 차단

### Request Body

```typescript
const RunCodeSchema = z.object({
  language: z.enum(['python', 'javascript', 'typescript']).default('python'),
  code: z.string().min(1).max(10000),
  stdin: z.string().max(1000).optional(),
  // gen-pipeline 검증용 플래그 (내부 호출 시)
  _internal_pipeline: z.boolean().optional(),
});
```

**예시:**
```json
{
  "language": "python",
  "code": "nums = [1, 2, 3, 4, 5]\nsquares = [x**2 for x in nums]\nprint(squares)"
}
```

### Response Body (200 OK)

```typescript
interface RunCodeResponse {
  stdout: string;
  stderr: string;
  exit_code: number;           // 0 = 성공
  execution_time_ms: number;
  timed_out: boolean;
}
```

**예시:**
```json
{
  "stdout": "[1, 4, 9, 16, 25]\n",
  "stderr": "",
  "exit_code": 0,
  "execution_time_ms": 142,
  "timed_out": false
}
```

### Error Cases

| 상태 코드 | 조건 | 메시지 |
|---|---|---|
| 400 | 스키마 검증 실패 / 지원하지 않는 언어 | `{ error: "..." }` |
| 401 | 미인증 | `{ error: "Unauthorized" }` |
| 408 | 샌드박스 HTTP 타임아웃 (8초) | `{ error: "Sandbox request timeout", code: "SANDBOX_HTTP_TIMEOUT" }` |
| 503 | 샌드박스 서비스 불가 | `{ error: "Sandbox unavailable" }` |

**참고:** 코드 자체 실행 타임아웃(5초)은 200 응답 + `timed_out: true`로 반환

---

## 7. POST /api/gen/worker

**설명:** gen_jobs 큐 처리 트리거 (pg_cron에서 2분마다 호출)

**인증:** Bearer Token (Supabase Service Role Key) — 외부 접근 차단

**호출자:** Supabase pg_cron (내부 전용)

### Request

```typescript
// Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
// Body: 빈 객체 또는 아래 선택적 파라미터
const WorkerRequestSchema = z.object({
  limit: z.number().int().min(1).max(10).default(5),  // 처리할 최대 작업 수
  dry_run: z.boolean().default(false),                 // 테스트용 (실제 LLM 호출 없음)
}).optional();
```

### Response Body (200 OK)

```typescript
interface WorkerResponse {
  processed: number;       // 처리 완료 수
  succeeded: number;
  failed: number;
  skipped: number;         // 큐 비어있음
  jobs: Array<{
    id: string;
    type: string;
    status: 'done' | 'failed';
    tokens?: number;
    cost_usd?: number;
    duration_ms: number;
  }>;
}
```

**예시:**
```json
{
  "processed": 3,
  "succeeded": 2,
  "failed": 1,
  "skipped": 0,
  "jobs": [
    { "id": "job-1", "type": "unit_generation", "status": "done", "tokens": 2340, "cost_usd": 0.0047, "duration_ms": 8200 },
    { "id": "job-2", "type": "unit_generation", "status": "done", "tokens": 2100, "cost_usd": 0.0042, "duration_ms": 7900 },
    { "id": "job-3", "type": "unit_generation", "status": "failed", "duration_ms": 3000 }
  ]
}
```

### Error Cases

| 상태 코드 | 조건 | 메시지 |
|---|---|---|
| 401 | 잘못된 Service Role Key | `{ error: "Unauthorized" }` |
| 503 | 모든 LLM 프로바이더 실패 | `{ error: "All LLM providers failed" }` (개별 job은 failed 처리 후 200 반환) |

---

## 공통 사항

### 인증 미들웨어 패턴

```typescript
// 모든 보호된 Route Handler에서 사용
async function getAuthenticatedUser(req: Request) {
  const supabase = createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  return user;
}
```

### zod 검증 패턴

```typescript
// 요청 본문 파싱 + 검증
const body = await req.json();
const parsed = Schema.safeParse(body);
if (!parsed.success) {
  return Response.json(
    { error: parsed.error.issues[0].message },
    { status: 400 }
  );
}
```

### 비용 로깅 패턴 (모든 LLM 호출 후)

```typescript
// gen_jobs 업데이트
await supabase.from('gen_jobs').update({
  tokens: result.usage.totalTokens,
  cost: estimateCost(result.usage, provider, tier),
  finished_at: new Date().toISOString(),
}).eq('id', jobId);
```
