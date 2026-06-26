# syllabusAI — 배포 가이드

---

## 1. 사전 준비

### 1-1. Supabase 프로젝트 생성

1. https://supabase.com 에서 새 프로젝트 생성
2. 프로젝트 생성 완료 후 **Settings > API** 에서 아래 값 확인:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` 키 → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role secret` 키 → `SUPABASE_SERVICE_ROLE_KEY`
3. **Settings > General** 에서 `Reference ID` 확인 → `SUPABASE_PROJECT_REF` (GitHub Actions용)
4. https://supabase.com/dashboard/account/tokens 에서 Access Token 생성 → `SUPABASE_ACCESS_TOKEN`

### 1-2. Vercel 프로젝트 연결

1. https://vercel.com 에서 GitHub 리포지터리 임포트
2. **Settings > General** 에서 `Project ID` 확인 → `VERCEL_PROJECT_ID`
3. **Team Settings** 에서 `Team ID` 확인 → `VERCEL_ORG_ID`
4. https://vercel.com/account/tokens 에서 Token 생성 → `VERCEL_TOKEN`

### 1-3. GitHub Secrets 등록

리포지터리 **Settings > Secrets and variables > Actions** 에서 등록:

| Secret 이름 | 값 출처 |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase Account Tokens |
| `SUPABASE_PROJECT_REF` | Supabase Settings > General |
| `VERCEL_TOKEN` | Vercel Account Tokens |
| `VERCEL_ORG_ID` | Vercel Team Settings |
| `VERCEL_PROJECT_ID` | Vercel Project Settings |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Settings > API |
| `NEXT_PUBLIC_APP_URL` | 배포 도메인 (예: `https://syllabusai.vercel.app`) |
| `ANTHROPIC_API_KEY` | Anthropic Console |
| `SANDBOX_API_URL` | 샌드박스 서비스 URL |
| `SANDBOX_API_KEY` | 샌드박스 API 키 |
| `WORKER_SECRET` | `openssl rand -hex 32` 생성값 |

---

## 2. 로컬 개발 환경 설정 순서

```bash
# 1. Supabase CLI 설치
npm install -g supabase

# 2. 리포지터리 클론 및 의존성 설치
git clone https://github.com/your-org/syllabusAI.git
cd syllabusAI
pnpm install

# 3. 로컬 Supabase 스택 시작
supabase start
# 출력에서 아래 값 확인:
#   API URL: http://localhost:54321
#   anon key: eyJ...
#   service_role key: eyJ...

# 4. 환경 변수 파일 설정
cp .env.local.example .env.local
# .env.local 편집: supabase start 출력값으로 채우기

# 5. DB 마이그레이션 실행
supabase db reset
# 또는 개별 마이그레이션:
# supabase migration up

# 6. (선택) Edge Function 로컬 실행
supabase functions serve gen-worker --env-file .env.local

# 7. Next.js 개발 서버 시작
pnpm dev
# http://localhost:3000 접속
```

### 로컬 Supabase Studio 접속

`supabase start` 후 http://localhost:54323 에서 로컬 대시보드 이용 가능.

---

## 3. 첫 배포 순서

### 3-1. 마이그레이션 (Supabase)

```bash
# Supabase CLI로 프로덕션 프로젝트 연결
supabase link --project-ref <your-project-ref>

# 마이그레이션 실행
supabase db push

# 실행되는 파일 순서:
# 1. 20260611_001_init_schema.sql  — 8개 테이블 + 트리거
# 2. 20260611_002_rls_policies.sql — RLS 정책
# 3. 20260611_003_indexes.sql      — 성능 인덱스
# 4. 20260611_004_gen_jobs_cron.sql — dequeue_jobs RPC + pg_cron
```

### 3-2. Edge Function 배포

```bash
# gen-worker Edge Function 배포 (JWT 검증 비활성화 — service role key로 직접 인증)
supabase functions deploy gen-worker --no-verify-jwt

# Edge Function 환경 변수 (Supabase Secrets) 설정
supabase secrets set ANTHROPIC_API_KEY="sk-ant-..."
supabase secrets set SANDBOX_API_URL="https://your-sandbox.example.com"
supabase secrets set SANDBOX_API_KEY="your-key"
supabase secrets set WORKER_SECRET="your-worker-secret"
```

### 3-3. pg_cron 설정 (아래 4번 섹션 참조)

### 3-4. Vercel 배포

```bash
# Vercel CLI로 배포
vercel --prod

# 또는 GitHub main 브랜치에 push하면 자동 배포 (deploy.yml)
git push origin main
```

---

## 4. 환경 변수 설정 위치

### Vercel Dashboard

**Vercel Dashboard > Project > Settings > Environment Variables**

| 변수명 | 환경 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development | 공개 가능 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview, Development | 공개 가능 (RLS 보호) |
| `SUPABASE_SERVICE_ROLE_KEY` | Production | Sensitive — 서버 전용 |
| `ANTHROPIC_API_KEY` | Production | Sensitive |
| `OPENAI_API_KEY` | Production | Sensitive (폴백용) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Production | Sensitive (폴백용) |
| `SANDBOX_API_URL` | Production | |
| `SANDBOX_API_KEY` | Production | Sensitive |
| `WORKER_SECRET` | Production | Sensitive |
| `NEXT_PUBLIC_APP_URL` | Production | 배포 도메인 |

### Supabase Dashboard

**Supabase Dashboard > Settings > Edge Functions > Secrets**

또는 CLI: `supabase secrets set KEY=value`

Edge Function(`gen-worker`)에서 사용하는 변수:
- `ANTHROPIC_API_KEY`
- `SANDBOX_API_URL`
- `SANDBOX_API_KEY`
- `WORKER_SECRET`
- `SUPABASE_URL` (자동 주입)
- `SUPABASE_SERVICE_ROLE_KEY` (자동 주입)

---

## 5. pg_cron 설정

Supabase Dashboard **SQL Editor** 또는 마이그레이션 파일 실행 후, 아래 쿼리를 **SQL Editor에서 직접 실행**:

```sql
-- 1. app 설정값 등록 (프로젝트 ref로 URL 교체)
ALTER DATABASE postgres
  SET app.edge_function_url = 'https://<project-ref>.supabase.co/functions/v1';

ALTER DATABASE postgres
  SET app.service_role_key = '<your-service-role-key>';

-- 2. pg_cron 작업 등록 (2분마다 gen-worker 호출)
SELECT cron.schedule(
  'gen-worker-trigger',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.edge_function_url') || '/gen-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    )
  $$
);

-- 3. 등록 확인
SELECT * FROM cron.job;
```

**주의사항:**
- `service_role_key`를 DB에 평문 저장하는 대신 Supabase Vault 사용을 권장합니다 (Phase 1).
- pg_cron은 Supabase 프로 플랜 이상에서 기본 활성화됩니다.
- 로컬 개발 환경에서는 `supabase functions serve`로 직접 호출 테스트.

---

## 6. 모니터링: gen_jobs 테이블 LLM 비용 추적

Supabase Dashboard SQL Editor에서 실행:

### 최근 24시간 처리 현황

```sql
SELECT
  status,
  COUNT(*) AS count,
  SUM(tokens) AS total_tokens,
  ROUND(SUM(cost)::numeric, 4) AS total_cost_usd
FROM gen_jobs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status
ORDER BY count DESC;
```

### 프로바이더별 누적 비용

```sql
SELECT
  provider,
  model,
  COUNT(*) AS jobs,
  SUM(tokens) AS total_tokens,
  ROUND(SUM(cost)::numeric, 6) AS total_cost_usd,
  ROUND(AVG(cost)::numeric, 6) AS avg_cost_per_job
FROM gen_jobs
WHERE status = 'done'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY provider, model
ORDER BY total_cost_usd DESC;
```

### 실패 작업 모니터링

```sql
SELECT
  id,
  type,
  payload->>'concept_key' AS concept_key,
  payload->>'curriculum_id' AS curriculum_id,
  created_at,
  finished_at,
  EXTRACT(EPOCH FROM (finished_at - created_at))::int AS duration_sec
FROM gen_jobs
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 20;
```

### 큐 적체 모니터링

```sql
SELECT
  COUNT(*) AS queued_count,
  MIN(created_at) AS oldest_queued_at,
  EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))::int AS max_wait_sec
FROM gen_jobs
WHERE status = 'queued';
```

### 일별 비용 집계

```sql
SELECT
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS total_jobs,
  SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS succeeded,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
  ROUND(SUM(cost)::numeric, 4) AS total_cost_usd
FROM gen_jobs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;
```

---

## 7. 트러블슈팅 FAQ

### Q1. `supabase db push` 실패 — "extension pg_cron not found"

**원인:** Supabase Free 플랜은 pg_cron이 기본 비활성화.

**해결:**
1. Supabase Dashboard > Settings > Database > Extensions 에서 `pg_cron` 활성화
2. 또는 Pro 플랜으로 업그레이드 후 재시도

---

### Q2. gen-worker Edge Function이 호출되지 않음

**확인 순서:**
1. **cron 등록 확인:** `SELECT * FROM cron.job;` 실행 → `gen-worker-trigger` 있는지 확인
2. **pg_net 확인:** `SELECT * FROM pg_extension WHERE extname = 'pg_net';`
3. **Edge Function 로그:** Supabase Dashboard > Edge Functions > gen-worker > Logs
4. **service_role_key 설정 확인:**
   ```sql
   SELECT current_setting('app.service_role_key');
   ```
5. **수동 테스트:**
   ```bash
   curl -X POST https://<ref>.supabase.co/functions/v1/gen-worker \
     -H "Authorization: Bearer <service-role-key>" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

---

### Q3. Next.js 빌드 오류 — "Cannot find module '@/lib/supabase/server'"

**해결:** `tsconfig.json`의 `paths` 설정 확인:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

---

### Q4. RLS 오류 — "new row violates row-level security policy"

**원인:** 클라이언트 컴포넌트에서 직접 Supabase 접근 시도.

**원칙:** 모든 DB 쓰기는 Route Handler 경유. 클라이언트에서 직접 `supabase.from(...).insert()` 금지.

**확인:** `SUPABASE_SERVICE_ROLE_KEY` 설정 여부 — RLS 우회가 필요한 내부 작업(워커)에만 사용.

---

### Q5. 코드 샌드박스 타임아웃 오류

**확인:**
1. `SANDBOX_API_URL` 환경 변수 설정 확인
2. `vercel.json`의 `/api/run` `maxDuration: 10` 확인
3. 샌드박스 서비스 자체 상태 확인 (`https://emkc.org/api/v2/piston/runtimes`)

**Piston 로컬 호스팅 설정 (권장):**
```bash
docker run -d \
  -p 2000:2000 \
  --name piston-api \
  ghcr.io/engineer-man/piston
```
`.env.local`에서 `SANDBOX_API_URL=http://localhost:2000/api/v2/piston`

---

### Q6. Vercel 빌드 오류 — 환경 변수 누락

**확인:** Vercel Dashboard > Settings > Environment Variables 에서 필수 변수 모두 등록 확인.

`vercel env pull .env.local` 명령으로 Vercel 환경 변수를 로컬에 동기화 가능.

---

### Q7. GitHub Actions deploy.yml 권한 오류

**확인:**
1. `SUPABASE_ACCESS_TOKEN` Secret 등록 여부
2. Access Token 권한: Supabase 대시보드에서 해당 조직의 `owner` 또는 `developer` 역할 필요
3. `VERCEL_TOKEN` 만료 여부: Vercel 계정에서 토큰 재발급

---

### Q8. 로컬에서 Auth 이메일이 수신되지 않음

**원인:** 로컬 Supabase는 실제 이메일 발송 대신 Inbucket 사용.

**확인:** http://localhost:54324 (Inbucket 웹 UI) 접속 → 이메일 수신 확인.

또는 `supabase/config.toml`에서 `enable_confirmations = false` 설정 시 이메일 확인 없이 로그인 가능.
