# syllabusAI 테스트 계획 (Phase 0 MVP)

## 1. 테스트 전략

### 비율
| 종류 | 비율 | 도구 |
|---|---|---|
| 유닛 테스트 | 60% | Vitest |
| 통합 테스트 | 30% | Vitest + msw |
| E2E 테스트 | 10% | Playwright |

### 원칙
- 비용 로깅·RLS·채점 로직은 유닛 테스트로 100% 커버
- 외부 의존성(LLM, Supabase, Sandbox)은 msw/vi.mock으로 모킹
- E2E는 핵심 Happy Path 1개 (온보딩→커리큘럼 생성→학습→평가) 만 구현

---

## 2. 우선순위 테스트 케이스

### A. 온보딩 → 커리큘럼 생성 흐름 (API)

| # | 테스트명 | 유형 | 기대 결과 |
|---|---|---|---|
| TC-001 | 유효한 입력으로 POST /api/curricula 성공 | 통합 | 201, curriculum.id 반환 |
| TC-002 | 미인증 요청 시 401 반환 | 유닛 | 401 Unauthorized |
| TC-003 | goal_text 10자 미만 시 400 반환 | 유닛 | 400 + validation message |
| TC-004 | level_target 유효하지 않은 값 시 400 반환 | 유닛 | 400 |
| TC-005 | curricula 생성 후 gen_jobs에 curriculum_calibration 작업 적재 확인 | 통합 | gen_jobs 레코드 존재 |

### B. 평가 채점 로직

| # | 테스트명 | 유형 | 기대 결과 |
|---|---|---|---|
| TC-006 | MCQ 정답 제출 시 correct=true | 유닛 | correct=true, mastery 상승 |
| TC-007 | MCQ 오답 제출 시 correct=false + failureType 분류 | 유닛 | correct=false, failure_type 존재 |
| TC-008 | 코드 제출 exit_code=0 + 출력 일치 시 correct=true | 유닛 | correct=true |
| TC-009 | 코드 제출 exit_code=1 시 correct=false | 유닛 | correct=false |
| TC-010 | calculateNewMastery: 첫 정답 시 마스터리 상승 | 유닛 | newMastery > 0 |
| TC-011 | calculateNewMastery: 반복 오답 시 마스터리 0 수렴 | 유닛 | newMastery < 0.1 |
| TC-012 | failureType: mastery<0.3 오답 → gap | 유닛 | failure_type='gap' |
| TC-013 | 존재하지 않는 item_id 제출 시 404 반환 | 통합 | 404 |

### C. RLS 정책 (다른 사용자 데이터 차단)

| # | 테스트명 | 유형 | 기대 결과 |
|---|---|---|---|
| TC-014 | 다른 사용자의 curriculum_id로 GET /api/curricula/:id 시 404 | 통합 | 404 (RLS로 조회 불가) |
| TC-015 | 다른 사용자의 attempts 데이터 조회 불가 (RLS) | DB | 빈 결과 |
| TC-016 | 다른 사용자의 mastery 데이터 조회 불가 (RLS) | DB | 빈 결과 |
| TC-017 | service role key 없이 gen_jobs INSERT 시 실패 | DB | RLS 거부 |

### D. gen_jobs 워커

| # | 테스트명 | 유형 | 기대 결과 |
|---|---|---|---|
| TC-018 | 올바른 워커 시크릿 없이 POST /api/gen/worker 시 401 | 유닛 | 401 |
| TC-019 | dry_run=true 시 실제 처리 없이 job 목록 반환 | 유닛 | processed>0, 실제 DB 변경 없음 |
| TC-020 | curriculum_calibration 작업 처리 후 curriculum_units 생성 | 통합 | units 레코드 존재 |
| TC-021 | unit_generation 처리 후 unit_variants 적재 + status=ready | 통합 | variant 존재, unit.status=ready |
| TC-022 | 모든 core 유닛 ready 시 curricula.status=active | 통합 | curriculum.status='active' |
| TC-023 | dequeue_jobs SKIP LOCKED — 동시 호출 시 중복 처리 없음 | DB | 각 job은 1회만 처리 |

### E. 코드 샌드박스

| # | 테스트명 | 유형 | 기대 결과 |
|---|---|---|---|
| TC-024 | 정상 Python 코드 실행 → stdout 반환 | 통합 | exit_code=0, stdout 존재 |
| TC-025 | 타임아웃 코드 실행 시 timed_out=true | 통합 | timed_out=true |
| TC-026 | SANDBOX_API_URL 미설정 시 503 반환 | 유닛 | 503 |
| TC-027 | HTTP 8초 타임아웃 초과 시 408 반환 | 유닛 | 408 SANDBOX_HTTP_TIMEOUT |
| TC-028 | 허용되지 않은 언어 코드 제출 시 400 | 유닛 | 400 |

### F. SSE 튜터 스트리밍

| # | 테스트명 | 유형 | 기대 결과 |
|---|---|---|---|
| TC-029 | 유효한 요청 시 SSE 스트림 시작 | 통합 | Content-Type: text/event-stream |
| TC-030 | messages 배열 비어있을 시 400 반환 | 유닛 | 400 |
| TC-031 | 튜터 세션 완료 후 gen_jobs에 비용 기록 | 통합 | gen_jobs 레코드 type='tutor_session' |

---

## 3. 테스트 파일 구조

```
src/__tests__/
├── api/
│   ├── assess.test.ts          # 채점 로직 테스트 (TC-006~013)
│   ├── worker.test.ts          # gen_jobs 워커 테스트 (TC-018~023)
│   ├── curricula.test.ts       # 커리큘럼 API 테스트 (TC-001~005)
│   ├── run.test.ts             # 샌드박스 테스트 (TC-024~028)
│   └── tutor.test.ts           # 튜터 API 테스트 (TC-029~031)
├── lib/
│   ├── gateway.test.ts         # LLM Gateway 테스트
│   ├── calibrator.test.ts
│   └── self-check.test.ts
├── db/
│   └── rls.test.ts             # RLS 정책 테스트 (TC-014~017)
└── setup.ts                    # 글로벌 테스트 설정
```

---

## 4. 핵심 유닛 테스트 코드

아래 파일들에 실제 테스트 코드를 작성한다.

### 4.1 `src/__tests__/api/assess.test.ts`

채점 로직(`gradeAnswer`, `calculateNewMastery`)과 `/api/assess/submit` 엔드포인트를 검증한다.

### 4.2 `src/__tests__/api/worker.test.ts`

워커 인증, dry_run 모드, 작업 처리 흐름을 검증한다.

### 4.3 `src/__tests__/lib/gateway.test.ts`

LLM Gateway의 모델 선택, 비용 추정, fallback 로직을 검증한다.

---

## 5. 테스트 환경 설정

### vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/app/api/**', 'src/lib/**'],
      exclude: ['src/lib/supabase/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### 필요 패키지
```
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom msw
```
