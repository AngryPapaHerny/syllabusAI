# syllabusAI MVP — 빌드 입력 명세

## 앱 설명
입력(주제·수준·주당 학습 시간) 기반 개인 맞춤 커리큘럼/콘텐츠 자동 생성 + 평가·재학습 플랫폼.
학습 루프: **온보딩 → 진단 → 커리큘럼 생성 → 학습 뷰 → 평가 → 재학습(다른 변형) → 진도**

## 핵심 기능
- 온보딩: 주제·수준·주당 학습 시간 입력
- 간이 진단: 사전 지식 확인 → mastery 초기화
- 커리큘럼 자동 생성: gen_jobs 큐 → Supabase Edge Function 워커 → unit_variants 적재
- 학습 뷰: P-C-S-M-A 콘텐츠 렌더러 (문제제기→개념→코드→동기→평가)
- 스트리밍 AI 튜터: SSE 기반 소크라테스식 힌트
- 평가: MCQ + 코드 문항 채점 → failure_type 분류
- 재학습 분기: 오답 시 다른 변형(unit_variants) 제공
- 진도 대시보드

## 기술 스택
- Frontend/Runtime: Next.js 14+ App Router + TypeScript + Vercel
- UI: Tailwind CSS + shadcn/ui
- DB/Auth/Storage: Supabase (Postgres + RLS + Auth)
- LLM Gateway: Vercel AI SDK (`ai` 패키지) — Claude 기본
- 생성 워커: Supabase Edge Function + gen_jobs 큐
- 코드 샌드박스: /api/run (격리 실행, 타임아웃·네트워크 차단)

## 데이터 모델 (확정)
```sql
profiles(user_id pk→auth.users, display_name, created_at)
curricula(id pk, owner_id→profiles, goal_text, domain, level_target, time_budget_hours_per_week, status, created_at)
curriculum_units(id pk, curriculum_id→curricula, concept_key text, title, order_idx int, role text, status)
unit_variants(id pk, concept_key text, level text, format text, content jsonb, source_meta jsonb, quality_score numeric, status text, created_at)
assessment_items(id pk, concept_key text, type text, stem text, options jsonb, answer jsonb, rationale text, difficulty numeric)
learner_concept_mastery(user_id, concept_key, mastery numeric, last_seen timestamptz, next_review_at timestamptz, attempts int)
attempts(id pk, user_id, item_id→assessment_items, answer jsonb, correct bool, failure_type text, created_at)
gen_jobs(id pk, type text, payload jsonb, status text, priority int, provider text, model text, tokens int, cost numeric, created_at, finished_at)
```

## P-C-S-M-A 콘텐츠 포맷
```json
{
  "P": "문제 제기",
  "C": "개념 설명",
  "S": "코드 스니펫 (실행 검증됨)",
  "M": "동기 부여",
  "A": { "type": "mcq|code", "stem": "...", "options": [], "answer": "...", "rationale": "..." }
}
```

## 핵심 API 경로
- POST /api/curricula
- GET /api/curricula/:id
- POST /api/diagnostic/submit
- POST /api/tutor (SSE)
- POST /api/assess/submit
- POST /api/run
- POST /api/gen/worker

## 개발 원칙
- RLS: owner_id = auth.uid()
- 코드 예제 검증: /api/run 샌드박스 통과 필수
- 비용 로깅: gen_jobs에 tokens·cost 기록
- Phase 0 Out: pgvector·IRT·간격반복 제외
- TypeScript strict + zod 검증

## 규모 / 배포
MVP (Phase 0) · Vercel + Supabase
