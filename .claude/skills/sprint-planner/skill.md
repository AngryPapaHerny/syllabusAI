---
name: sprint-planner
description: syllabusAI Phase 0 스프린트 계획 및 태스크 분배. "스프린트 계획", "다음 스프린트 뭐 해야 해", "S0 셋업 시작", "이번 주 태스크", "DoD 체크" 요청 시 호출. S0~S5 스프린트별 목표·완료조건·에이전트 분배 제공.
---

당신은 syllabusAI **스프린트 플래너**입니다. 개발계획서의 S0~S5 스프린트를 기반으로 현재 단계의 태스크를 구체화하고 에이전트팀에 분배합니다.

## 스프린트 현황판

| 스프린트 | 기간 | 목표 | 상태 |
|---|---|---|---|
| **S0 셋업** | ~2주 | 환경·스킬 검증 | 현재 |
| S1 데이터+생성코어 | ~2주 | 스키마 + 생성 파이프라인 | 대기 |
| S2 학습뷰+튜터 | ~2주 | 콘텐츠 소비 경험 | 대기 |
| S3 온보딩+진단 | ~2주 | 진입 흐름 | 대기 |
| S4 평가+재학습 | ~2주 | 루프 닫기 | 대기 |
| S5 통합+검증 | ~2주 | MVP 완성 | 대기 |

---

## 스프린트별 태스크 상세

### S0 — 셋업 (현재 단계)

**목표**: 개발 환경과 핵심 기술 검증

**체크리스트**:
- [ ] Next.js 프로젝트 초기화 (App Router + TypeScript + Tailwind + shadcn/ui)
- [ ] Supabase 프로젝트 생성 + 로컬 CLI 설정 (`supabase init`, `supabase start`)
- [ ] 환경변수 설정 (`.env.local`, `.env.example`)
- [ ] LLM Gateway 모듈 스캐폴드 + 2개 프로바이더 "hello" 테스트
- [ ] 코드 샌드박스 PoC (임의 Python 스니펫 실행 → 결과 반환)
- [ ] CI 설정 (빌드·린트·타입체크)
- [ ] Vercel 프리뷰 배포 연결

**에이전트 분배**:
- `platform-engineer` → LLM Gateway + Supabase 설정 + 샌드박스 PoC
- `content-generator` → "hello" 생성 테스트 (LLM Gateway 검증)

**완료 조건(DoD)**:
- `npm run build` 통과
- `supabase status` 로컬 정상
- Claude API + OpenAI API 각 1회 호출 성공 로그
- Python 스니펫 실행 → stdout 수신 확인

---

### S1 — 데이터+생성코어

**목표**: 데이터 스키마 확정 + 유닛 1개 end-to-end 생성

**체크리스트**:
- [ ] Phase 0 마이그레이션 SQL 작성 (8개 테이블)
- [ ] RLS 정책 적용
- [ ] `gen_jobs` 워커 기본 구현
- [ ] `/api/gen/worker` route handler
- [ ] content-generator 파이프라인 코드 연결
- [ ] "파이썬 변수" 유닛 1개 실제 생성 + DB 저장

**에이전트 분배**:
- `platform-engineer` → 마이그레이션·RLS·워커 구현
- `content-generator` → 파이프라인 로직 + Self-Check

**완료 조건(DoD)** (M1):
- 코딩 주제 1개로 P-C-S-M-A 유닛이 자동 생성됨
- 코드 예제가 샌드박스에서 실행 통과
- `unit_variants` 테이블에 status='verified' 레코드 존재

---

### S2 — 학습뷰+튜터

**목표**: 생성된 유닛을 학습 뷰에서 소비 + AI 튜터 대화

**체크리스트**:
- [ ] 학습 뷰 페이지 (`/learn/[unitId]`)
- [ ] P-C-S-M-A 렌더러 컴포넌트
- [ ] 코드 에디터 + 실행 버튼 (Monaco Editor 또는 CodeMirror)
- [ ] `/api/tutor` SSE 스트리밍 route handler
- [ ] 튜터 채팅 UI (useChat hook)

**에이전트 분배**:
- `ai-tutor` → `/api/tutor` 구현 + 시스템 프롬프트
- `platform-engineer` → 학습 뷰 라우트·컴포넌트 구조
- `content-generator` → P-C-S-M-A 렌더 스펙

**완료 조건(DoD)** (M2):
- 생성된 유닛을 학습 뷰에서 볼 수 있음
- AI 튜터와 스트리밍 대화 가능

---

### S3 — 온보딩+진단

**목표**: 신규 사용자 진입 흐름 완성

**체크리스트**:
- [ ] Supabase Auth 연동 (이메일·소셜 로그인)
- [ ] 온보딩 폼 (`/onboarding`)
- [ ] `/api/curricula` POST 구현
- [ ] 간이 진단 페이지 + `/api/diagnostic/submit`
- [ ] 커리큘럼 대시보드 (`/dashboard`)
- [ ] 진도바·생성 상태 실시간 업데이트

**에이전트 분배**:
- `curriculum-architect` → 온보딩 로직 + 커리큘럼 설계
- `platform-engineer` → Auth 연동·API 라우트·대시보드

---

### S4 — 평가+재학습

**목표**: 학습 루프 완성 (평가 → 오답 → 재학습)

**체크리스트**:
- [ ] 평가 뷰 (`/assess/[unitId]`)
- [ ] MCQ + 코드 실행형 채점 로직
- [ ] `/api/assess/submit` 구현
- [ ] `attempts` + `learner_concept_mastery` 갱신
- [ ] 오답 시 재학습 변형 라우팅

**에이전트 분배**:
- `assessment-engine` → 채점·failure_type·재학습 분기 로직
- `platform-engineer` → 평가 뷰·API·DB 갱신

**완료 조건(DoD)** (M3):
- 의도적 오답 → 다른 변형 제공
- `learner_concept_mastery` / `attempts` 갱신 확인

---

### S5 — 통합+검증

**목표**: MVP end-to-end 완주

**체크리스트**:
- [ ] E2E 시나리오: "파이썬 기초 알고리즘" 온보딩→진단→학습→평가→재학습
- [ ] Playwright E2E 테스트 스크립트
- [ ] RLS 격리 테스트 (타 사용자 데이터 접근 차단)
- [ ] LLM 비용 로깅 확인
- [ ] 버그픽스·UX 개선
- [ ] 내부 시연 준비

**완료 조건(DoD)** (M4 = MVP):
- "파이썬 기초 알고리즘" end-to-end 완주
- E2E 테스트 통과
- RLS 격리 검증

---

## 태스크 분배 출력 형식

```markdown
## S{N} 스프린트 태스크 분배

### platform-engineer 담당
- [ ] 태스크 1
- [ ] 태스크 2

### content-generator 담당
- [ ] 태스크 1

### assessment-engine 담당
- [ ] 태스크 1

### 이번 주 우선순위 (3개)
1. 가장 중요한 태스크
2. 두 번째
3. 세 번째

### DoD 체크리스트
- [ ] 완료 조건 1
- [ ] 완료 조건 2
```

## 실행 방법

```
/sprint-planner
→ 현재 스프린트 확인 + 전체 현황 표시

/sprint-planner S0
→ S0 상세 태스크 + 에이전트 분배 출력

/sprint-planner DoD S1
→ S1 완료 조건 체크리스트 출력
```
