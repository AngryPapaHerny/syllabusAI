/**
 * worker.test.ts
 * /api/gen/worker 엔드포인트 테스트
 * - 인증 검증
 * - dry_run 모드
 * - 작업 처리 흐름 (curriculum_calibration, unit_generation)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const WORKER_SECRET = 'test-worker-secret'

// 환경변수 설정
beforeEach(() => {
  vi.stubEnv('WORKER_SECRET', WORKER_SECRET)
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

function makeWorkerRequest(body: unknown = {}, secret = WORKER_SECRET) {
  return new Request('http://localhost/api/gen/worker', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/gen/worker — 인증', () => {
  it('TC-018: Authorization 헤더 없으면 401', async () => {
    vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

    const { POST } = await import('@/app/api/gen/worker/route')
    const req = new Request('http://localhost/api/gen/worker', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('잘못된 시크릿으로 401', async () => {
    vi.mock('@/lib/supabase/server', () => ({ createServiceClient: () => ({}) }))

    const { POST } = await import('@/app/api/gen/worker/route')
    const req = makeWorkerRequest({}, 'wrong-secret')

    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/gen/worker — dry_run', () => {
  it('TC-019: dry_run=true 시 job 목록 반환, 처리 없음', async () => {
    const mockJobs = [
      { id: 'job-1', type: 'curriculum_calibration', payload: { curriculum_id: 'c-1', goal_text: 'test', level_target: 'beginner', time_budget_hours_per_week: 5, owner_id: 'u-1' }, status: 'queued', priority: 1 },
    ]

    vi.mock('@/lib/supabase/server', () => ({
      createServiceClient: () => ({
        rpc: vi.fn().mockResolvedValue({ data: mockJobs, error: null }),
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }),
      }),
    }))

    const { POST } = await import('@/app/api/gen/worker/route')
    const req = makeWorkerRequest({ dry_run: true, limit: 5 })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.processed).toBe(1)
    expect(body.succeeded).toBe(0)   // dry_run: 실제 처리 없음
    expect(body.jobs[0].status).toBe('done')
  })
})

describe('POST /api/gen/worker — 빈 큐', () => {
  it('큐가 비어있으면 processed=0, skipped=1', async () => {
    vi.mock('@/lib/supabase/server', () => ({
      createServiceClient: () => ({
        rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }))

    const { POST } = await import('@/app/api/gen/worker/route')
    const req = makeWorkerRequest({})

    const res = await POST(req)
    const body = await res.json()

    expect(body.processed).toBe(0)
    expect(body.skipped).toBe(1)
  })
})

describe('POST /api/gen/worker — dequeue 실패', () => {
  it('dequeue_jobs RPC 오류 시 500 반환', async () => {
    vi.mock('@/lib/supabase/server', () => ({
      createServiceClient: () => ({
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      }),
    }))

    const { POST } = await import('@/app/api/gen/worker/route')
    const req = makeWorkerRequest({})

    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

describe('gen_jobs 비용 로깅 — processJob', () => {
  it('TC-021: unit_generation 완료 후 gen_jobs status=done + tokens, cost 기록', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })

    // processUnitGeneration 내부는 복잡하므로 처리 함수 자체를 모킹
    vi.mock('@/lib/gen-pipeline/writer', () => ({
      runWriter: vi.fn().mockResolvedValue({
        P: 'Problem', C: 'Concept', S: 'print("hi")', M: 'Motivation',
        A: { type: 'mcq', stem: 'Q?', options: ['A', 'B', 'C', 'D'], answer: { index: 0 }, rationale: 'R' },
      }),
    }))
    vi.mock('@/lib/gen-pipeline/grounding', () => ({
      runGrounding: vi.fn().mockResolvedValue({ passed: true }),
    }))
    vi.mock('@/lib/gen-pipeline/self-check', () => ({
      runSelfCheck: vi.fn().mockResolvedValue({ quality_score: 0.85, code_valid: true, assessment_wellformed: true, problem_clear: true, concept_accurate: true, motivation_genuine: true, issues: [] }),
      isSelfCheckPassed: vi.fn().mockReturnValue(true),
    }))

    const jobs = [{
      id: 'job-1',
      type: 'unit_generation',
      payload: { curriculum_id: 'c-1', curriculum_unit_id: 'u-1', concept_key: 'variables', level: 'beginner', format: 'code', goal_text: 'learn python', owner_id: 'usr-1' },
      status: 'running',
      priority: 2,
    }]

    let updateCallArgs: unknown[] = []
    vi.mock('@/lib/supabase/server', () => ({
      createServiceClient: () => ({
        rpc: vi.fn().mockResolvedValue({ data: jobs, error: null }),
        from: vi.fn().mockImplementation((table: string) => ({
          insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'v-1' }, error: null }) }) }),
          update: vi.fn().mockImplementation((values) => {
            if (table === 'gen_jobs') updateCallArgs = [values]
            return { eq: vi.fn().mockResolvedValue({ error: null }) }
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        })),
      }),
    }))

    const { POST } = await import('@/app/api/gen/worker/route')
    const req = makeWorkerRequest({ limit: 1 })
    const res = await POST(req)
    const body = await res.json()

    expect(body.succeeded).toBe(1)
    // gen_jobs 업데이트에 status='done', tokens, cost가 포함되어야 함
    expect(updateCallArgs).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({ status: 'done', tokens: expect.any(Number), cost: expect.any(Number) }),
      ])
    )
  })
})
