# syllabusAI — 시스템 아키텍처 설계

## 1. 시스템 개요 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│                         사용자 (Browser)                             │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS
┌───────────────────────────────▼─────────────────────────────────────┐
│                        Vercel (Edge + Serverless)                    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Next.js App Router                        │    │
│  │                                                              │    │
│  │  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐  │    │
│  │  │  Server      │  │  Client       │  │  Route          │  │    │
│  │  │  Components  │  │  Components   │  │  Handlers       │  │    │
│  │  │  (DB 직접)   │  │  (상태·인터랙) │  │  (API 엔드포인트)│  │    │
│  │  └──────┬───────┘  └───────┬───────┘  └────────┬────────┘  │    │
│  └─────────┼─────────────────┼──────────────────┼────────────┘    │
│            │                  │                   │                  │
└────────────┼──────────────────┼───────────────────┼──────────────────┘
             │                  │                   │
     ┌───────▼──────────────────▼───────────────────▼──────────┐
     │                    Supabase                               │
     │                                                           │
     │  ┌────────────┐  ┌──────────────┐  ┌──────────────────┐ │
     │  │  Auth      │  │  Postgres    │  │  Edge Functions  │ │
     │  │  (JWT/RLS) │  │  (8 tables)  │  │  (gen-worker)    │ │
     │  └────────────┘  └──────────────┘  └────────┬─────────┘ │
     │                                              │            │
     │                       ┌──────────────────────┘            │
     │                       │  pg_cron (*/2 * * * *)            │
     │                       │  → dequeue_jobs RPC               │
     └───────────────────────┼───────────────────────────────────┘
                             │
             ┌───────────────▼────────────────┐
             │         LLM Gateway             │
             │  (Vercel AI SDK)                │
             │                                 │
             │  ┌──────────┐  ┌────────────┐  │
             │  │ Anthropic │  │  OpenAI    │  │
             │  │ (primary) │  │ (fallback) │  │
             │  └──────────┘  └────────────┘  │
             └─────────────────────────────────┘
                             │
             ┌───────────────▼────────────────┐
             │      코드 샌드박스 API           │
             │  (외부 격리 실행 서비스)          │
             │  타임아웃 5s / 메모리 128MB      │
             │  네트워크 차단                   │
             └─────────────────────────────────┘
```

### gen_jobs 워커 비동기 흐름

```
사용자 요청
  │
  ▼
POST /api/curricula
  │  curricula 레코드 생성 (status='generating')
  │  gen_jobs 큐에 작업 적재 (status='queued')
  │  즉시 응답 반환 → 클라이언트 폴링 시작
  │
  ▼
pg_cron (*/2 * * * *)
  │  dequeue_jobs RPC 호출 (FOR UPDATE SKIP LOCKED, limit=5)
  │
  ▼
Supabase Edge Function: gen-worker
  │
  ├─ Calibrator  : 주제 → concept_key 목록 (LLM, JSON)
  │     ↓
  ├─ Grounding   : /api/run 샌드박스로 코드 검증 (실패 시 최대 2회 재시도)
  │     ↓
  ├─ Writer      : P-C-S-M-A JSON 스키마 강제 출력 (generateObject)
  │     ↓
  └─ Self-Check  : 정답 테스트 + 형식 검증 → unit_variants 적재
        ↓
     gen_jobs.status = 'done', tokens, cost 기록

클라이언트 폴링
  GET /api/curricula/:id → status 확인 → 준비된 유닛부터 점진 노출
```

---

## 2. 디렉토리 구조 (Next.js App Router 전체 파일 트리)

```
syllabusAI/
├── app/
│   ├── layout.tsx                    # 루트 레이아웃 (Auth Provider, 폰트)
│   ├── page.tsx                      # 랜딩 페이지 (로그인 유도)
│   ├── globals.css
│   │
│   ├── (auth)/                       # 인증 라우트 그룹 (레이아웃 없음)
│   │   ├── login/
│   │   │   └── page.tsx              # 이메일/소셜 로그인
│   │   ├── signup/
│   │   │   └── page.tsx              # 회원가입
│   │   └── callback/
│   │       └── route.ts              # OAuth 콜백 처리
│   │
│   ├── (app)/                        # 인증 필요 라우트 그룹
│   │   ├── layout.tsx                # AppShell (Sidebar, Header)
│   │   │
│   │   ├── onboarding/
│   │   │   └── page.tsx              # 주제·수준·시간 입력 폼
│   │   │
│   │   ├── diagnostic/
│   │   │   └── page.tsx              # 간이 진단 문항 (5~10문항)
│   │   │
│   │   ├── dashboard/
│   │   │   └── page.tsx              # 진도 대시보드 (커리큘럼 목록)
│   │   │
│   │   ├── curricula/
│   │   │   ├── page.tsx              # 커리큘럼 목록
│   │   │   └── [id]/
│   │   │       ├── page.tsx          # 커리큘럼 상세 (유닛 목록)
│   │   │       └── generating/
│   │   │           └── page.tsx      # 생성 중 대기 화면 (폴링)
│   │   │
│   │   ├── learn/
│   │   │   └── [unitId]/
│   │   │       └── page.tsx          # P-C-S-M-A 학습 뷰
│   │   │
│   │   ├── assess/
│   │   │   └── [itemId]/
│   │   │       └── page.tsx          # MCQ / 코드 평가 화면
│   │   │
│   │   └── tutor/
│   │       └── page.tsx              # AI 튜터 채팅 (SSE 스트리밍)
│   │
│   └── api/
│       ├── curricula/
│       │   ├── route.ts              # POST /api/curricula
│       │   └── [id]/
│       │       └── route.ts          # GET /api/curricula/:id
│       ├── diagnostic/
│       │   └── submit/
│       │       └── route.ts          # POST /api/diagnostic/submit
│       ├── tutor/
│       │   └── route.ts              # POST /api/tutor (SSE)
│       ├── assess/
│       │   └── submit/
│       │       └── route.ts          # POST /api/assess/submit
│       ├── run/
│       │   └── route.ts              # POST /api/run (코드 샌드박스)
│       └── gen/
│           └── worker/
│               └── route.ts          # POST /api/gen/worker (크론 트리거)
│
├── components/
│   ├── ui/                           # shadcn/ui 기본 컴포넌트
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   ├── badge.tsx
│   │   └── ...
│   │
│   ├── layout/
│   │   ├── app-shell.tsx             # 전체 레이아웃 래퍼
│   │   ├── sidebar.tsx               # 네비게이션 사이드바
│   │   └── header.tsx                # 상단 헤더
│   │
│   ├── onboarding/
│   │   ├── onboarding-form.tsx       # 주제·수준·시간 입력 폼 (Client)
│   │   └── level-selector.tsx        # 수준 선택 컴포넌트
│   │
│   ├── curriculum/
│   │   ├── curriculum-card.tsx       # 커리큘럼 카드 (Server)
│   │   ├── unit-list.tsx             # 유닛 목록 (Server)
│   │   ├── unit-status-badge.tsx     # 생성 상태 배지
│   │   └── generating-skeleton.tsx   # 생성 중 스켈레톤 (Client, 폴링)
│   │
│   ├── learn/
│   │   ├── pcsma-renderer.tsx        # P-C-S-M-A 콘텐츠 렌더러 (Client)
│   │   ├── problem-section.tsx       # P: 문제 제기
│   │   ├── concept-section.tsx       # C: 개념 설명
│   │   ├── code-section.tsx          # S: 코드 스니펫 + 실행 버튼
│   │   ├── motivation-section.tsx    # M: 동기 부여
│   │   └── assessment-section.tsx    # A: 평가 문항
│   │
│   ├── assess/
│   │   ├── mcq-question.tsx          # MCQ 문항 (Client)
│   │   ├── code-question.tsx         # 코드 문항 + 에디터 (Client)
│   │   └── result-feedback.tsx       # 채점 결과·해설
│   │
│   ├── tutor/
│   │   ├── tutor-chat.tsx            # 채팅 UI (Client, SSE)
│   │   ├── message-bubble.tsx        # 메시지 버블
│   │   └── hint-panel.tsx            # 소크라테스식 힌트 패널
│   │
│   └── dashboard/
│       ├── progress-overview.tsx     # 전체 진도 요약 (Server)
│       ├── mastery-chart.tsx         # 개념 마스터리 차트 (Client)
│       └── recent-activity.tsx       # 최근 학습 활동
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # Supabase 브라우저 클라이언트
│   │   ├── server.ts                 # Supabase 서버 클라이언트 (cookies)
│   │   └── middleware.ts             # 세션 갱신 미들웨어
│   ├── llm-gateway.ts                # LLM Gateway (Vercel AI SDK)
│   ├── gen-pipeline/
│   │   ├── calibrator.ts             # 주제 → concept_key 목록
│   │   ├── grounding.ts              # 코드 샌드박스 검증
│   │   ├── writer.ts                 # P-C-S-M-A 생성
│   │   └── self-check.ts             # 품질 검증
│   └── utils.ts
│
├── types/
│   ├── database.ts                   # Supabase 생성 타입 + 확장
│   └── api.ts                        # API 요청/응답 타입
│
├── hooks/
│   ├── use-curriculum-status.ts      # 커리큘럼 생성 상태 폴링 (SWR)
│   └── use-stream.ts                 # SSE 스트리밍 훅
│
├── middleware.ts                     # 인증 미들웨어 (세션 갱신 + 리다이렉트)
├── supabase/
│   ├── functions/
│   │   └── gen-worker/
│   │       └── index.ts              # Edge Function 워커
│   └── migrations/
│       ├── 20260611_001_init_schema.sql
│       ├── 20260611_002_rls_policies.sql
│       ├── 20260611_003_indexes.sql
│       └── 20260611_004_gen_jobs_cron.sql
├── .env.local                        # 환경변수 (gitignore)
├── env.example                       # 환경변수 템플릿
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json                     # strict: true
└── package.json
```

---

## 3. 페이지 라우팅 목록

| 경로 | 파일 | 설명 | 인증 필요 |
|---|---|---|---|
| `/` | `app/page.tsx` | 랜딩·로그인 유도 | 아니오 |
| `/login` | `app/(auth)/login/page.tsx` | 이메일/소셜 로그인 | 아니오 |
| `/signup` | `app/(auth)/signup/page.tsx` | 회원가입 | 아니오 |
| `/callback` | `app/(auth)/callback/route.ts` | OAuth 콜백 | 아니오 |
| `/onboarding` | `app/(app)/onboarding/page.tsx` | 주제·수준·시간 입력 | 예 |
| `/diagnostic` | `app/(app)/diagnostic/page.tsx` | 간이 진단 | 예 |
| `/dashboard` | `app/(app)/dashboard/page.tsx` | 진도 대시보드 | 예 |
| `/curricula` | `app/(app)/curricula/page.tsx` | 커리큘럼 목록 | 예 |
| `/curricula/:id` | `app/(app)/curricula/[id]/page.tsx` | 커리큘럼 상세·유닛 목록 | 예 |
| `/curricula/:id/generating` | `app/(app)/curricula/[id]/generating/page.tsx` | 생성 대기·폴링 | 예 |
| `/learn/:unitId` | `app/(app)/learn/[unitId]/page.tsx` | P-C-S-M-A 학습 뷰 | 예 |
| `/assess/:itemId` | `app/(app)/assess/[itemId]/page.tsx` | 평가 화면 | 예 |
| `/tutor` | `app/(app)/tutor/page.tsx` | AI 튜터 채팅 | 예 |

**API 라우트:**

| 경로 | 메서드 | 설명 |
|---|---|---|
| `/api/curricula` | POST | 커리큘럼 생성 |
| `/api/curricula/:id` | GET | 커리큘럼 조회 |
| `/api/diagnostic/submit` | POST | 진단 결과 제출 |
| `/api/tutor` | POST | SSE 튜터 스트리밍 |
| `/api/assess/submit` | POST | 답안 채점 |
| `/api/run` | POST | 코드 샌드박스 실행 |
| `/api/gen/worker` | POST | gen_jobs 워커 트리거 |

---

## 4. 컴포넌트 구조 (주요 계층)

```
app/(app)/layout.tsx (Server)
└── AppShell (Server)
    ├── Sidebar (Server, 활성 경로는 Client)
    ├── Header (Server, 사용자 정보 포함)
    └── {children}

app/(app)/learn/[unitId]/page.tsx (Server — DB에서 unit_variant 조회)
└── PCSMARenderer (Client — 섹션 간 이동, 코드 실행)
    ├── ProblemSection     (Server Component로 렌더 후 hydrate)
    ├── ConceptSection
    ├── CodeSection        (Client — 코드 실행 버튼, /api/run 호출)
    ├── MotivationSection
    └── AssessmentSection  (Client — MCQ 선택 또는 코드 입력 + 제출)

app/(app)/curricula/[id]/generating/page.tsx (Client)
└── GeneratingSkeleton    (Client — SWR 폴링, 준비된 유닛 목록 표시)

app/(app)/tutor/page.tsx (Client)
└── TutorChat             (Client — SSE ReadableStream 소비)
    ├── MessageBubble[]
    └── HintPanel

app/(app)/assess/[itemId]/page.tsx (Server — item 조회)
├── MCQQuestion           (Client — 선택·제출)
└── CodeQuestion          (Client — 에디터·실행·제출)
```

---

## 5. 상태 관리 전략

### 서버 컴포넌트 vs 클라이언트 컴포넌트 경계

| 범주 | 컴포넌트 타입 | 근거 |
|---|---|---|
| DB 데이터 조회 (curricula, unit_variants, mastery) | Server | RLS 보안, 초기 렌더 성능 |
| 인증 상태 확인 | Server (middleware + Server Component) | 쿠키 기반 세션 |
| 폼 입력 (온보딩, 채점 제출) | Client | 사용자 인터랙션 필요 |
| 코드 에디터·실행 | Client | DOM 의존, 동적 상태 |
| SSE 스트리밍 (튜터) | Client | ReadableStream API |
| 폴링 (커리큘럼 생성 상태) | Client (SWR) | 주기적 재요청 |
| UI 컴포넌트 (shadcn) | Client | 이벤트 핸들러 포함 시 |

**원칙:**
- 데이터 페칭은 Server Component에서 직접 Supabase 서버 클라이언트 사용
- 클라이언트에서 Supabase 직접 접근 금지 — 모든 변이는 Route Handler 경유
- 글로벌 상태 관리 라이브러리 불필요 (서버 컴포넌트 + URL 상태로 충분)
- 로컬 UI 상태만 `useState`/`useReducer` 사용

---

## 6. Supabase Auth 흐름

```
1. 로그인 요청
   클라이언트 → POST /login (이메일+비밀번호 또는 OAuth)
        │
        ▼
   Supabase Auth → JWT 발급 → Set-Cookie (HttpOnly, SameSite=Lax)
        │
        ▼
   OAuth의 경우: /callback route.ts → exchangeCodeForSession() → 대시보드 리다이렉트

2. 세션 갱신 (middleware.ts)
   모든 요청 → middleware.ts
        │  supabase.auth.getSession() — 만료 시 자동 갱신
        │  미인증 + 보호 경로 → /login 리다이렉트
        ▼
   Next.js 라우터

3. 서버 컴포넌트 DB 접근
   Server Component
        │  createServerClient(cookies()) — anon key + RLS 적용
        │  SELECT * FROM curricula WHERE owner_id = auth.uid()
        ▼  (RLS가 JWT의 sub = auth.uid() 자동 비교)
   Supabase Postgres

4. API Route Handler (변이 작업)
   Route Handler
        │  createServerClient(cookies()) — anon key + RLS
        │  auth.getUser() → 401 if not authenticated
        │  DB 쓰기 → RLS 자동 적용
        ▼
   Supabase Postgres

5. gen-worker Edge Function (서비스 롤)
   pg_cron → Edge Function
        │  createClient(SERVICE_ROLE_KEY) — RLS 우회
        │  gen_jobs 큐 처리 (사용자 격리 불필요한 내부 작업)
        ▼
   unit_variants 적재
```

**클라이언트 Supabase 사용 금지 이유:**
- anon key가 브라우저에 노출되어도 RLS로 보호되지만, 직접 접근 패턴은 API 로깅·검증 우회 위험
- 모든 쓰기 작업은 Route Handler에서 zod 검증 후 처리

---

## 7. gen_jobs 워커 비동기 처리 흐름 (상세)

```
[적재 단계]
POST /api/curricula
  1. curricula INSERT → id 획득
  2. gen_jobs INSERT (N개 유닛 × type='unit_generation')
     payload: { curriculum_id, concept_key, level, format }
     status: 'queued', priority: 5
  3. 응답: { curriculum_id, status: 'generating' }

[스케줄 단계]
pg_cron '*/2 * * * *'
  → net.http_post(edge_function_url/gen-worker)

[처리 단계]
Edge Function gen-worker
  1. dequeue_jobs(limit=5)  -- FOR UPDATE SKIP LOCKED
  2. 각 job 병렬 처리:
     a. gen_jobs UPDATE status='running'
     b. Calibrator (low tier LLM): concept_key 정제·메타 생성
     c. Writer (high tier LLM): generateObject(PCSMASchema)
     d. Grounding: /api/run 호출 → 코드 실행 검증
        - 실패 시 Writer 재호출 (최대 2회)
     e. Self-Check (low tier LLM): 정답 검증·형식 확인
     f. unit_variants INSERT (status='verified')
     g. curriculum_units UPDATE status='ready'
     h. gen_jobs UPDATE status='done', tokens, cost, finished_at
  3. 실패 시: gen_jobs UPDATE status='failed'

[소비 단계]
GET /api/curricula/:id (SWR 폴링, 5초 간격)
  → curriculum_units WHERE status='ready' 반환
  → 클라이언트: 준비된 유닛부터 점진 노출
  → 모든 유닛 ready → curricula UPDATE status='active'
```

---

## 8. 기술 스택 결정 근거

| 기술 | 선택 근거 |
|---|---|
| **Next.js 14+ App Router** | Server Component로 DB 직접 접근(지연 없음), SSE 스트리밍 기본 지원, Vercel 배포 최적화 |
| **TypeScript strict** | 런타임 오류 사전 차단, zod와 타입 추론 연동, 팀 협업 명시성 |
| **Tailwind CSS + shadcn/ui** | 빠른 UI 구성, 접근성 기본 제공(Radix UI 기반), 커스터마이징 자유도 |
| **Supabase (Postgres + RLS + Auth)** | RLS로 row-level 보안 DB-레벨 보장, Auth 내장, Edge Function으로 워커 통합, pg_cron 제공 |
| **Vercel AI SDK** | 멀티 프로바이더(Anthropic·OpenAI·Google) 단일 인터페이스, `generateObject`로 JSON 스키마 강제, SSE 스트리밍 추상화 |
| **gen_jobs 큐 패턴** | LLM 생성은 느림(30~60s) → 비동기 분리 필수, pg_cron으로 외부 스케줄러 불필요, SKIP LOCKED로 중복 실행 방지 |
| **외부 코드 샌드박스** | 서버에서 사용자 코드 직접 실행 금지(보안), 격리 API로 타임아웃·메모리·네트워크 제어 위임 |
| **Phase 0 단순화** | pgvector·IRT·간격반복 제외 → MVP 복잡도 최소화, 학습 루프 검증 후 Phase 1에서 점진 추가 |
