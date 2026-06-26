# QA 리뷰 보고서

## 종합 판정
**조건부 통과** — 필수 수정 사항 2건을 직접 수정 완료. 개선 권고 5건은 Phase 1 대응 가능.

---

## 🔴 필수 수정 사항

| # | 파일 | 문제 | 수정 방법 | 상태 |
|---|---|---|---|---|
| 1 | `src/app/api/run/route.ts` | `_internal_pipeline=true` 요청도 Supabase 세션 인증을 요구하여 워커에서 호출 시 항상 401 반환 — Grounding 단계 전체 실패 | 내부 파이프라인은 `WORKER_SECRET` Bearer 토큰으로 인증, 일반 요청은 Supabase 세션으로 분기 처리 | **수정 완료** |
| 2 | `src/lib/supabase/server.ts` L38 | `createServiceClient`에서 `require('@supabase/supabase-js')` — ESM/TypeScript 환경에서 CommonJS require 사용. 번들러에 따라 타입 손실 및 런타임 오류 가능 | 파일 상단에 `import { createClient } from '@supabase/supabase-js'` 추가, require 제거 | **수정 완료** |
| 3 | `src/lib/gen-pipeline/grounding.ts` | `/api/run` 내부 호출 시 Authorization 헤더 없음 → run/route.ts 수정 후 인증 실패 | `WORKER_SECRET` Bearer 헤더 추가 | **수정 완료** |
| 4 | `src/app/api/assess/submit/route.ts` L69 | 코드 제출 채점 시 `/api/run` 내부 호출에 Authorization 헤더 없음 | `WORKER_SECRET` Bearer 헤더 추가 | **수정 완료** |

---

## 🟡 개선 권고 사항

| # | 파일 | 문제 | 권고 |
|---|---|---|---|
| 1 | `src/app/api/gen/worker/route.ts` L228~232 | Calibrator LLM 호출의 실제 usage 토큰 대신 추정값(`개념수 * 150 + 500`) 하드코딩 기록. cost 추적 부정확 | `runCalibrator`가 반환하는 실제 토큰 수를 포함하도록 `CalibratorOutput` 타입에 `usage_tokens` 필드 추가 |
| 2 | `src/app/api/gen/worker/route.ts` L331 | `unit_generation` 토큰도 추정값(3000+800) 하드코딩. Writer·SelfCheck 실제 사용량과 괴리 | `runWriter`, `runSelfCheck` 반환값에 `usage_tokens` 포함하고 합산하여 기록 |
| 3 | `src/components/assess/MCQQuestion.tsx` L39~51 | `itemId` 없는 인라인 채점 시 `correctIndex` prop이 클라이언트 번들에 노출됨. 학습 뷰 연습 문제 전용이라 의도된 설계지만, 실제 평가 페이지에서 `itemId` 미전달 시 보안 우회 가능 | PCSMARenderer에서 MCQQuestion 사용 시 반드시 `itemId`를 전달하도록 Props를 required로 강제하거나, 인라인 채점 전용 컴포넌트를 분리 |
| 4 | `src/app/api/curricula/[id]/route.ts` L51~56 | `concept_key` 배열로 unit_variants를 IN 쿼리 조회 시 concept_key가 많아지면 단건 쿼리보다 느릴 수 있음. 또한 curriculum_units에 RLS가 없어 curriculum_id 기반 간접 소유권 확인만 수행 | unit_variants 조회에 `curriculum_unit_id` 외래키 인덱스 추가; curriculum_units RLS WITH CHECK 조건 명시적 추가 |
| 5 | `src/lib/gen-pipeline/grounding.ts` L60~73 | 언어 감지 휴리스틱이 단순함 (`import` 키워드는 Python과 JS 모두 존재, `print(` 없는 Python 코드는 JS로 오분류 가능) | 언어 정보를 Writer가 content에 메타데이터로 포함하거나, concept_key 기반 기본 언어를 payload에서 전달 |

---

## 🟢 확인 완료 항목

- **`src/app/api/curricula/route.ts`**: zod 검증, 인증, gen_jobs 큐잉 모두 올바름. owner_id 명시적 주입으로 RLS 우회 없음.
- **`src/app/api/curricula/[id]/route.ts`**: anon key 클라이언트 사용으로 RLS 자동 적용. 다른 사용자 curriculum 404 처리 정상.
- **`src/app/api/tutor/route.ts`**: zod 검증, 스트리밍, gen_jobs 비용 로깅 모두 구현됨. result.usage.then() 비동기 처리로 스트림 응답 블로킹 없음.
- **`src/app/api/assess/submit/route.ts`**: gradeAnswer 로직 정확. calculateNewMastery 지수 이동 평균 구현 타당. failure_type LLM 분류 + fallback 모두 처리.
- **`src/lib/llm/gateway.ts`**: Provider/Tier 분리, 비용 추정, logLLMUsage(jobId 조건부) 모두 올바름. generateWithFallback 순차 폴백 정상.
- **`src/lib/gen-pipeline/calibrator.ts`**: zod 스키마 강제 출력, jobId 전달로 비용 로깅 연동.
- **`src/lib/gen-pipeline/writer.ts`**: PCSMASchema 엄격 검증 (min 길이, options 4개 고정, answer 구조 확인).
- **`src/lib/gen-pipeline/self-check.ts`**: 경량 모델(`tier: 'low'`) 사용으로 비용 최적화. isSelfCheckPassed 임계값(0.7) + code_valid + assessment_wellformed 복합 판정.
- **`src/components/learn/PCSMARenderer.tsx`**: 'use client' 분리, SSR 없음, TutorChat·MCQQuestion 올바른 props 전달.
- **`src/components/learn/TutorChat.tsx`**: useChat hook 올바른 body 구성, satisfies 타입 안전 사용.
- **`supabase/migrations/20260101000001_rls_policies.sql`**: 7개 테이블 RLS 전부 활성화. curricula/mastery/attempts에 WITH CHECK 포함. gen_jobs SELECT는 payload->>'owner_id' 비교로 서버 측 우회 차단.
- **`supabase/migrations/20260101000003_functions.sql`**: dequeue_jobs SKIP LOCKED으로 중복 처리 방지. reset_stale_jobs 크래시 복구. get_curriculum_progress 집계 함수.

---

## 총평

Phase 0 MVP 코드는 전반적으로 설계 원칙(RLS, zod 검증, 비용 로깅, 서버 컴포넌트 분리)을 잘 준수한다.

핵심 버그는 **내부 파이프라인 인증 흐름** 한 곳에 집중되었다: `/api/run`이 항상 Supabase 세션을 요구했고, 워커 내 Grounding/채점 코드가 Authorization 헤더 없이 내부 호출하여 Grounding 단계 전체와 코드 문항 채점이 실제로 작동하지 않았을 것이다. 이를 WORKER_SECRET Bearer 토큰 분기 방식으로 수정 완료했다.

개선 권고 중 가장 중요한 것은 **토큰 추정값 하드코딩 제거**(#1, #2)로, 비용 추적의 정확도에 직접 영향을 미친다. Phase 1에서 실제 usage를 파이프라인 반환값으로 전달하도록 리팩터링을 권장한다.
