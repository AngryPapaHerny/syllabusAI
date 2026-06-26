# 트러블슈팅 로그

작업 전 반드시 이 파일을 확인하여 동일 실수를 반복하지 않을 것.

---

## 2026-06-12

### 1. next.config.ts 미지원
- **증상**: `Configuring Next.js via 'next.config.ts' is not supported`
- **원인**: Next.js 14.2.5는 `.ts` 설정 파일 미지원
- **해결**: `next.config.mjs`로 교체

### 2. Supabase 미들웨어 무한 대기
- **증상**: `supabase.auth.getUser()` 호출 시 응답 없이 hang
- **원인**: 존재하지 않는 `http://localhost:54321`에 fetch 시도 → throw가 아닌 hang
- **해결**: env 변수 placeholder 값 체크 후 early return (`middleware.ts`)

### 3. pnpm 설치 실패 (OneDrive)
- **증상**: pnpm이 심볼릭 링크 생성 실패
- **원인**: OneDrive 경로는 심볼릭 링크 제한
- **해결**: `npm install --legacy-peer-deps` 사용

### 4. 포트 3000 충돌
- **증상**: `Port 3000 is in use`
- **원인**: 다른 프로세스가 3000 점유
- **해결**: 5000번대 포트 사용으로 변경 (launch.json `port: 5000`)

### 5. Preview 서버 스크린샷 실패
- **증상**: `mcp__Claude_Preview__preview_screenshot` 반복 실패, 빈 화면
- **원인**: Preview 서버 환경이 불안정, 사용자 거부
- **해결**: Chrome 브라우저 직접 사용 (`mcp__Claude_in_Chrome__*` 도구)

### 6. git 명령어 실패 → ✅ 정정 (git 정상 동작, 2026-06-19)
- **증상(과거)**: `Not a git repository`
- **원인**: 단순히 git init이 안 됐던 것뿐. OneDrive라서 git이 안 되는 게 아니었음.
- **현재**: `git init -b main` → commit → `git push`(GitHub https, Git Credential Manager) **모두 정상**.
  원격: https://github.com/AngryPapaHerny/syllabusAI.git (main). diff/commit/push 사용 가능.
- 주의: `.env.local`(실제 키)은 .gitignore로 제외됨. `.claude/settings.json`(로컬 권한 allowlist)도 제외. pnpm 심볼릭 링크 이슈와는 무관 — git은 영향 없음.

### 7. Tailwind CSS 미적용 (postcss.config.js → .mjs)
- **증상**: 페이지가 완전히 스타일 없이 렌더링됨 (흰 배경, 기본 HTML)
- **원인**: `postcss.config.js` (CommonJS) 파일을 Next.js 14.2.5가 인식하지 못함
- **해결**: `postcss.config.mjs` (ESM)로 교체. 반드시 `.next` 캐시 삭제 후 서버 재시작.
- **확인**: `.next/static/css/app/layout.css`에 `tailwindcss v3` 주석과 유틸리티 클래스 포함 여부 확인

### 9. 코드 샌드박스(/api/run) 동작 불가 → ✅ 해결 (Wandbox 교체, 2026-06-19)

**해결**: 백엔드를 공개 Piston → **Wandbox(`https://wandbox.org/api/compile.json`, 키 불필요)**로 교체.
- `src/app/api/run/route.ts` 재작성: 언어→Wandbox 컴파일러 매핑(python=`cpython-3.10.15`, javascript=`nodejs-20.17.0`, typescript=`typescript-5.6.2`), 응답을 기존 계약(`{stdout, stderr, exit_code, execution_time_ms, timed_out}`)으로 변환. `program_output`→stdout, `program_error`+`compiler_error`→stderr, `status`→exit_code, `signal`→timed_out.
- `SANDBOX_API_URL=https://wandbox.org`로 변경(.env.local + 예제들).
- grounding.ts/assess 타임아웃을 Wandbox 지연 고려해 20초로 상향.
- **검증**: OK 케이스(stdout/exit 0, ~2s), 런타임 에러(traceback/exit 1), 미인증 401, 워커 unit_generation 1잡 Grounding 통과(경고 0) 모두 확인.
- 주의: Wandbox도 공개 서비스 → 장기적으로는 자체 호스팅(Docker 미설치 환경이라 현재 불가) 또는 Judge0 등 검토 필요.

**(아래는 원인 기록 — 참고용)**
### 9-old. 코드 샌드박스(/api/run) 동작 불가 — 2건 (2026-06-18 E2E 검증 중 발견)
- **증상**: `/api/run` 호출 시 항상 503 `Sandbox unavailable`
- **원인 A (코드 버그)**: 라우트가 `${sandboxUrl}/api/v2/execute`를 호출하는데 `SANDBOX_API_URL=https://emkc.org/api/v2/piston` → 최종 URL이 `.../piston/api/v2/execute`로 **경로 중복** → 404. Piston 실제 실행 경로는 `.../piston/execute`.
- **원인 B (환경 변화)**: 공개 Piston API(emkc.org)가 **2026-02-15부터 whitelist 전용**으로 전환 → 경로를 고쳐 `.../piston/execute`로 직접 호출해도 401 반환. 공개 인스턴스로는 더 이상 사용 불가.
- **영향**:
  - Grounding 단계는 **비치명적**(실패해도 경고만 로깅하고 진행) → 콘텐츠 생성 자체는 막히지 않음. 단 "코드 예제 검증 필수" 원칙이 실질 무력화됨.
  - `/api/assess/submit`의 **code 타입 채점은 항상 오답** 처리됨(executionResult undefined). 현재 assessment_items는 전부 mcq라 당장은 영향 없음.
  - 학습뷰 CodeSandbox 실습 실행도 동작 안 함.
- **해결 방향(미적용, 사용자 결정 필요)**: ① URL 경로 버그 수정(`/execute`) + ② 자체 호스팅 Piston 또는 대체 샌드박스(예: 컨테이너 실행 서비스) 도입. 둘 다 해야 복구됨.

### 11. 학습뷰 코드 실행 시 EOFError (input() + stdin 미전달) (2026-06-19 해결)
- **증상**: "입출력" 레슨 예제 `name = input(...)` 실행 시 `EOFError: EOF when reading a line`, exit 1.
- **원인**: 샌드박스는 정상. CodeSandbox.tsx가 `/api/run`에 `stdin`을 보내지 않아 대화형 입력이 빈 상태 → input()이 EOF. (route/스키마는 이미 stdin 지원했음)
- **해결**:
  - `CodeSandbox.tsx`: 코드에 `input(`(py)/`readline`(js) 감지 시 **입력값(stdin) 칸** 노출, 그 값을 `/api/run`에 전달.
  - `grounding.ts`: 자동 검증 시 stdin 부재로 인한 EOFError만 있는 경우(코드에 input() 존재)는 코드 결함이 아니므로 **통과로 간주** → I/O 레슨도 Grounding 의미 유지.
  - 검증: `{code: input(), stdin:"Alice"}` → `Enter your name: Hello Alice!` exit 0.

### 10. gen_jobs 큐 미배수 / orphan 커리큘럼 (2026-06-18 발견)
- **증상**: unit_generation 잡 25개가 `queued`로 잔류. 커리큘럼 `15e85e7c`는 calibration 실패로 `generating` 상태 영구 정체.
- **원인**: 워커 트리거가 생성 시점 fire-and-forget(limit=10) 1회뿐 — 이후 큐를 주기적으로 배수하는 디스패처(pg_cron 등) 미가동. core 유닛만 처리되고 optional/remediation 변형은 큐에 방치됨.
- **영향**: remediation 유닛이 `pending`/verified 변형 없음 → 평가 `gap→remediation` 분기가 빈 결과로 떨어져 `retry`로 폴백(실제 remediation 이동 불가).
- **해결 방향**: 큐 배수용 크론/반복 워커 호출 도입, orphan 커리큘럼 정리.

### 8. (app)/layout.tsx 인증 리다이렉트
- **증상**: 미들웨어 bypass가 동작해도 /dashboard, /onboarding 등이 /login으로 리다이렉트
- **원인**: `src/app/(app)/layout.tsx`에 별도 `redirect('/login')` 로직 존재
- **해결**: layout.tsx에서도 `NEXT_PUBLIC_SUPABASE_URL` placeholder 체크 → 로컬 개발 시 인증 스킵
