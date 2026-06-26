# syllabusAI — Claude Code 컨텍스트

## 세션 연속성

- **진행 상황**: `_workspace/progress.md` — 완료/진행/대기 작업 체크리스트
- **트러블슈팅**: `_workspace/troubleshooting.md` — 실패 사례와 해결 방법
- **새 세션 시작 시**: 위 두 파일을 먼저 읽고 작업을 이어서 진행할 것

---

## 제품 개요

입력(주제·수준·주당 학습 시간) 기반 개인 맞춤 커리큘럼/콘텐츠 자동 생성 + 평가·재학습 플랫폼.
학습 루프: **온보딩 → 진단 → 커리큘럼 생성 → 학습 뷰 → 평가 → 재학습(다른 변형) → 진도**

- 1차 타깃: 코딩/IT 학습자 (이후 일반 도메인 확장)
- 현재 단계: **Phase 0 MVP** — 코딩 단일 도메인, per-user 생성, 재사용 라이브러리 없음

---

## 기술 스택

| 레이어 | 선택 |
|---|---|
| 프론트/런타임 | Next.js 14+ (App Router) + TypeScript + Vercel |
| UI | Tailwind CSS + shadcn/ui |
| DB/Auth/Storage | Supabase (Postgres + pgvector + RLS + Auth) |
| LLM Gateway | Vercel AI SDK (`ai` 패키지) — Claude·GPT·Gemini 교체·혼용 |
| 생성 워커 | Supabase Edge Function + `gen_jobs` 큐 (pg_cron 디스패치) |
| 코드 샌드박스 | 격리 실행 API (타임아웃·리소스 제한·네트워크 차단) |
| 관측/로깅 | `gen_jobs` 테이블에 provider·model·tokens·cost 기록 |

---

## 핵심 데이터 모델 (Phase 0)

```sql
profiles(user_id pk→auth.users, display_name, created_at)

curricula(id pk, owner_id→profiles, goal_text, domain, level_target,
          time_budget_hours_per_week, status, created_at)

curriculum_units(id pk, curriculum_id→curricula, concept_key text, title,
                 order_idx int, role text /* core|optional|remediation */, status)

unit_variants(id pk, concept_key text, level text, format text /* analogy|code|visual */,
              content jsonb /* {P,C,S,M,A} */, source_meta jsonb, quality_score numeric,
              status text /* draft|verified|failed */, created_at)

assessment_items(id pk, concept_key text, type text /* mcq|code */, stem text,
                 options jsonb, answer jsonb, rationale text, difficulty numeric)

learner_concept_mastery(user_id, concept_key, mastery numeric /* 0~1 */,
                        last_seen timestamptz, next_review_at timestamptz, attempts int,
                        pk(user_id, concept_key))

attempts(id pk, user_id, item_id→assessment_items, answer jsonb, correct bool,
         failure_type text /* gap|misconception|slip|null */, created_at)

gen_jobs(id pk, type text, payload jsonb, status text /* queued|running|done|failed */,
         priority int, provider text, model text, tokens int, cost numeric,
         created_at, finished_at)
```

**RLS**: `curricula` / `learner_concept_mastery` / `attempts`는 `owner_id = auth.uid()` 적용.
**인덱스**: `concept_key`, `gen_jobs(status, priority)`, `next_review_at`.

---

## P-C-S-M-A 콘텐츠 포맷

`unit_variants.content` jsonb 스키마:

```json
{
  "P": "문제 제기 — 이 개념이 왜 필요한지 실제 상황 제시",
  "C": "개념 설명 — 핵심 아이디어, 정의, 원리",
  "S": "코드 스니펫 — 실행 검증된 예제 코드",
  "M": "동기 부여 — 실무·커리어 연결, 왜 배울 가치 있는지",
  "A": {
    "type": "mcq | code",
    "stem": "문제 텍스트",
    "options": ["선택지1", "선택지2", "선택지3", "선택지4"],
    "answer": "정답 인덱스 또는 코드",
    "rationale": "해설"
  }
}
```

---

## 생성 파이프라인 4단계

```
주제 입력
  └─ [Calibrator]  주제 → concept_key 목록 + 수준 매핑 (LLM 1콜, JSON 출력)
       └─ [Grounding]  코드 예제를 /api/run 샌드박스로 실행 검증 (실패 시 재생성 최대 2회)
            └─ [Writer]  P-C-S-M-A JSON 스키마 강제 출력
                 └─ [Self-Check]  정답 테스트 통과 + 퀴즈 형식 검증 → unit_variants 적재
```

- 모든 LLM 호출은 **Gateway 경유** (생성=상위 모델, 검증=경량 모델)
- 비동기: `gen_jobs` 큐에 적재 → 워커 처리 → 준비된 유닛부터 점진 노출

---

## 핵심 API 경로 (Phase 0)

| 경로 | 설명 |
|---|---|
| `POST /api/curricula` | 온보딩 입력 → 커리큘럼 생성 + gen_jobs 적재 |
| `GET /api/curricula/:id` | 조립된 커리큘럼·유닛 상태 |
| `POST /api/diagnostic/submit` | 진단 결과 → mastery 초기화 |
| `POST /api/tutor` | SSE 스트리밍 튜터 응답 (Vercel AI SDK streamText) |
| `POST /api/assess/submit` | 답안 채점 → attempts 기록 → 재학습 판정 |
| `POST /api/run` | 코드 샌드박스 실행 (실습·검증 공용) |
| `POST /api/gen/worker` | gen_jobs 큐 처리 (크론 트리거) |

---

## 에이전트팀 구성

### 🎓 syllabusAI 도메인 에이전트 (핵심)

| 에이전트 | 역할 | 주요 트리거 |
|---|---|---|
| `content-generator` | Calibrator→Grounding→Writer→Self-Check 파이프라인 | 유닛 생성 요청 |
| `curriculum-architect` | 온보딩 → 커리큘럼·학습경로 설계 | 커리큘럼 설계 |
| `assessment-engine` | 평가 문항 생성·채점·failure_type 분류·재학습 분기 | 평가 시스템 |
| `ai-tutor` | 스트리밍 튜터 응답·소크라테스식 힌트 | 튜터 API 설계 |
| `platform-engineer` | Next.js+Supabase+LLM Gateway 기술 구현 | 플랫폼 코드 작성 |

### 🏗️ 풀스택 플랫폼 에이전트 (16-fullstack-webapp)

| 에이전트 | 역할 | 주요 트리거 |
|---|---|---|
| `architect` | 요구사항 분석·시스템 아키텍처·기술 스택 선정·DB 모델링 | 설계 문서 작성, 아키텍처 결정 |
| `frontend-dev` | Next.js App Router·UI 컴포넌트·상태관리·API 연동 | 학습뷰·대시보드·온보딩 UI 구현 |
| `backend-dev` | API 구현·DB 연동·인증·비즈니스 로직 | Edge Function·RLS·gen_jobs 워커 구현 |
| `devops-engineer` | CI/CD·인프라·배포 자동화·모니터링 | Vercel 배포 파이프라인·환경 구성 |
| `qa-engineer` | 테스트 전략·유닛/통합/E2E 테스트·품질 검증 | 기능 검증·회귀 테스트 |

### 🔌 API 설계 에이전트 (18-api-designer)

| 에이전트 | 역할 | 주요 트리거 |
|---|---|---|
| `api-architect` | REST 리소스 모델링·엔드포인트·버전 전략·페이지네이션 | API 신규 설계, 스펙 정의 |
| `schema-validator` | OpenAPI 3.1 스키마 생성·타입 안전성·포맷 검증 | API 스키마 검증, zod 타입 생성 |
| `review-auditor` | API 보안·일관성·성능·베스트프랙티스 감사 | API 리뷰, 보안 점검 |

### 🗄️ 데이터베이스 에이전트 (19-database-architect)

| 에이전트 | 역할 | 주요 트리거 |
|---|---|---|
| `data-modeler` | ERD 설계·정규화/역정규화·관계 설계·타입 선정 | 스키마 설계, 테이블 구조 변경 |
| `migration-manager` | DDL 스크립트·마이그레이션 버전관리·롤백 전략 | Supabase 마이그레이션 작성 |
| `security-auditor` | RBAC·RLS·컬럼 암호화·SQL 인젝션 방어·감사 로그 | DB 보안 검토, RLS 정책 설계 |

### 🔍 코드 품질 에이전트 (21-code-reviewer)

| 에이전트 | 역할 | 주요 트리거 |
|---|---|---|
| `security-analyst` | OWASP Top 10·인젝션·인증 취약점·의존성 취약점 분석 | 보안 리뷰, 취약점 점검 |
| `architecture-reviewer` | SOLID·의존성 방향·커플링·모듈 구조·테스트 가능성 | 아키텍처 리뷰, 설계 검토 |
| `review-synthesizer` | 리뷰 결과 우선순위화·최종 판정·팀 조율 | 종합 코드 리뷰 완료 시 |

### 🧪 테스트 자동화 에이전트 (24-test-automation)

| 에이전트 | 역할 | 주요 트리거 |
|---|---|---|
| `test-strategist` | 테스트 피라미드·프레임워크 선택·CI 품질 게이트 설계 | 테스트 전략 수립 |
| `integration-tester` | API·DB·외부 서비스 통합 테스트·시드 데이터 전략 | 통합 테스트 작성, /api/* 검증 |
| `coverage-analyst` | 커버리지 갭 식별·리스크 기반 우선순위화 | 커버리지 분석, 테스트 보강 |

### 🤖 LLM 앱 에이전트 (41-llm-app-builder)

| 에이전트 | 역할 | 주요 트리거 |
|---|---|---|
| `rag-architect` | 문서 처리·청킹·임베딩·벡터스토어·검색·리랭킹 파이프라인 | Phase 1 pgvector 검색 설계 |
| `prompt-engineer` | 시스템 프롬프트·few-shot·출력 포맷·가드레일 설계 | LLM 프롬프트 최적화, 튜터 프롬프트 |
| `eval-specialist` | 프롬프트 품질·RAG 성능 평가 프레임워크·A/B 테스트 | LLM 출력 품질 평가, 벤치마크 |

### 📚 코스 빌더 에이전트 (08-course-builder)

| 에이전트 | 역할 | 주요 트리거 |
|---|---|---|
| `curriculum-designer` | ADDIE·블룸 분류법 기반 학습목표·모듈 구조·선수 지식 매핑 | 커리큘럼 콘텐츠 설계 |
| `quiz-maker` | 형성평가·총괄평가·다양한 문항 유형·블룸 분류 기반 피드백 | 평가 문항 생성, assessment_items 적재 |
| `content-writer` | 레슨 플랜·슬라이드 개요·강사 노트·학습자 핸드아웃 작성 | P-C-S-M-A 콘텐츠 초안 |

---

## 스킬 목록

### syllabusAI 전용 스킬
| 스킬 | 설명 |
|---|---|
| `/syllabus-ai` | 메인 오케스트레이터 — 전체 학습 루프 흐름 조율 |
| `/content-pipeline` | 콘텐츠 생성 파이프라인 단독 실행 (Calibrator→Self-Check) |
| `/sprint-planner` | 스프린트 계획 및 태스크 분배 |

### 플랫폼 개발 스킬
| 스킬 | 설명 |
|---|---|
| `/fullstack-webapp` | 풀스택 웹앱 개발 팀 오케스트레이터 |
| `/api-designer` | REST/GraphQL API 설계·문서화·검증 오케스트레이터 |
| `/api-security-checklist` | API 보안 체크리스트 검토 |
| `/rest-api-conventions` | REST URL 명명·상태코드·페이지네이션·버전 가이드 |
| `/api-error-design` | API 에러 응답 설계 패턴 |
| `/database-architect` | DB 모델링→마이그레이션→최적화 오케스트레이터 |
| `/query-optimization-catalog` | 쿼리 최적화 패턴 카탈로그 |

### 코드 품질·테스트 스킬
| 스킬 | 설명 |
|---|---|
| `/code-reviewer` | 스타일·보안·성능·아키텍처 종합 코드 리뷰 |
| `/vulnerability-patterns` | CWE 분류·언어별 취약점 패턴·안전한 대안 |
| `/test-automation` | 테스트 전략·작성·CI 통합·커버리지 분석 오케스트레이터 |
| `/test-design-patterns` | 체계적 테스트 설계 패턴 가이드 |

### LLM·콘텐츠 스킬
| 스킬 | 설명 |
|---|---|
| `/llm-app-builder` | LLM 앱 설계·구현·최적화 오케스트레이터 |
| `/prompt-optimizer` | 프롬프트 품질 개선·가드레일 설계 |
| `/chunking-strategy-guide` | RAG용 청킹 전략 가이드 (Phase 1) |
| `/course-builder` | 코스 설계→콘텐츠→평가 오케스트레이터 |
| `/assessment-engineering` | 평가 문항 엔지니어링 가이드 |
| `/learning-design` | 학습 설계 원칙·ADDIE·블룸 분류법 적용 |

---

## 로컬 개발 환경 규칙

- **브라우저**: Chrome 사용 (`mcp__Claude_in_Chrome__*` 도구). Preview 서버(`mcp__Claude_Preview__*`)는 사용하지 않는다.
- **로컬 포트**: `5000`번대 사용 (launch.json `port: 5000`). 3000번대는 다른 프로세스와 충돌하므로 피한다.
- **트러블슈팅 로그**: `_workspace/troubleshooting.md`에 실패 사례와 해결 방법을 기록한다. 작업 전 반드시 참고하여 같은 실수를 반복하지 않는다.
- **OneDrive 제약**: 이 프로젝트는 OneDrive 경로에 있으므로 `git`이 동작하지 않는다. `pnpm`도 심볼릭 링크 문제로 실패하므로 `npm install --legacy-peer-deps`를 사용한다.

---

## 개발 원칙

- **RLS 필수**: 모든 사용자 데이터는 `owner_id = auth.uid()` 격리
- **코드 예제 검증 필수**: Grounding 단계에서 `/api/run` 샌드박스 통과 확인
- **비용 로깅**: 모든 LLM 호출은 `gen_jobs`에 tokens·cost 기록
- **Phase 0 Out 엄수**: pgvector 검색·IRT 진단·간격 반복은 Phase 1/2
- **타입 안전**: TypeScript strict mode, API 응답은 zod 스키마 검증

---

## 스프린트 계획 (Phase 0, 2주 단위)

| 스프린트 | 목표 | 핵심 산출물 |
|---|---|---|
| S0 셋업 | 환경·스킬 검증 | 레포·CI·Supabase·LLM Gateway·샌드박스 PoC |
| S1 데이터+생성코어 | 스키마 + 생성 파이프라인 | 마이그레이션·gen_jobs 워커·유닛 1개 생성 |
| S2 학습뷰+튜터 | 콘텐츠 소비 경험 | 학습뷰·P-C-S-M-A 렌더·스트리밍 튜터 |
| S3 온보딩+진단 | 진입 흐름 | 온보딩·간이 진단·mastery 초기화·대시보드 |
| S4 평가+재학습 | 루프 닫기 | 채점·attempts·재학습 변형 분기 |
| S5 통합+검증 | MVP 완성 | E2E 시나리오·버그픽스·내부 시연 |