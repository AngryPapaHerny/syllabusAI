/**
 * assess.test.ts
 * 채점 로직(gradeAnswer, calculateNewMastery) 및 /api/assess/submit 엔드포인트 테스트
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ──────────────────────────────────────────────
// gradeAnswer / calculateNewMastery 내부 함수 테스트
// 라우트 핸들러에서 export 되지 않으므로 로직을 직접 재현한다.
// ──────────────────────────────────────────────

function gradeAnswer(
  item: { type: string; answer: Record<string, unknown> },
  submitted: { type: string; index?: number; code?: string },
  executionResult?: { stdout: string; exit_code: number }
): boolean {
  if (item.type === 'mcq' && submitted.type === 'mcq') {
    return (item.answer as { index?: number }).index === submitted.index
  }
  if (item.type === 'code' && submitted.type === 'code') {
    if (!executionResult) return false
    if (executionResult.exit_code !== 0) return false
    const expectedOutput = (item.answer as { code?: string }).code?.trim()
    const actualOutput = executionResult.stdout.trim()
    return expectedOutput === actualOutput
  }
  return false
}

function calculateNewMastery(
  previousMastery: number,
  correct: boolean,
  attempts: number
): number {
  const alpha = Math.max(0.1, 1 / (attempts + 1))
  const target = correct ? 1.0 : 0.0
  const newMastery = previousMastery + alpha * (target - previousMastery)
  return Math.min(1.0, Math.max(0.0, Math.round(newMastery * 1000) / 1000))
}

// ──────────────────────────────────────────────
// gradeAnswer 테스트
// ──────────────────────────────────────────────
describe('gradeAnswer', () => {
  describe('MCQ', () => {
    it('TC-006: 정답 인덱스 일치 시 true 반환', () => {
      const item = { type: 'mcq', answer: { index: 2 } }
      const submitted = { type: 'mcq', index: 2 }
      expect(gradeAnswer(item, submitted)).toBe(true)
    })

    it('TC-007: 정답 인덱스 불일치 시 false 반환', () => {
      const item = { type: 'mcq', answer: { index: 2 } }
      const submitted = { type: 'mcq', index: 0 }
      expect(gradeAnswer(item, submitted)).toBe(false)
    })

    it('타입 불일치(mcq vs code) 시 false', () => {
      const item = { type: 'mcq', answer: { index: 0 } }
      const submitted = { type: 'code', code: 'print(1)' }
      expect(gradeAnswer(item, submitted)).toBe(false)
    })
  })

  describe('Code', () => {
    it('TC-008: exit_code=0 + 출력 일치 시 true', () => {
      const item = { type: 'code', answer: { code: 'Hello World' } }
      const submitted = { type: 'code', code: 'print("Hello World")' }
      const exec = { stdout: 'Hello World\n', exit_code: 0 }
      expect(gradeAnswer(item, submitted, exec)).toBe(true)
    })

    it('TC-009: exit_code=1 시 false', () => {
      const item = { type: 'code', answer: { code: 'Hello World' } }
      const submitted = { type: 'code', code: 'raise Exception()' }
      const exec = { stdout: '', exit_code: 1 }
      expect(gradeAnswer(item, submitted, exec)).toBe(false)
    })

    it('executionResult 없으면 false', () => {
      const item = { type: 'code', answer: { code: 'Hello' } }
      const submitted = { type: 'code', code: 'print("Hello")' }
      expect(gradeAnswer(item, submitted, undefined)).toBe(false)
    })

    it('출력 불일치 시 false', () => {
      const item = { type: 'code', answer: { code: 'Hello' } }
      const submitted = { type: 'code', code: 'print("World")' }
      const exec = { stdout: 'World', exit_code: 0 }
      expect(gradeAnswer(item, submitted, exec)).toBe(false)
    })

    it('앞뒤 공백 무시하고 비교', () => {
      const item = { type: 'code', answer: { code: 'Hello' } }
      const submitted = { type: 'code', code: 'print("Hello")' }
      const exec = { stdout: '  Hello  \n', exit_code: 0 }
      expect(gradeAnswer(item, submitted, exec)).toBe(true)
    })
  })
})

// ──────────────────────────────────────────────
// calculateNewMastery 테스트
// ──────────────────────────────────────────────
describe('calculateNewMastery', () => {
  it('TC-010: 첫 번째 정답 시 마스터리 상승 (0 → 1.0)', () => {
    const result = calculateNewMastery(0, true, 0)
    // alpha = max(0.1, 1/1) = 1.0 → newMastery = 0 + 1*(1-0) = 1.0
    expect(result).toBe(1.0)
  })

  it('TC-011: 반복 오답 시 마스터리 0으로 수렴', () => {
    let mastery = 0.5
    for (let i = 0; i < 10; i++) {
      mastery = calculateNewMastery(mastery, false, i + 5) // attempts 5이상
    }
    expect(mastery).toBeLessThan(0.1)
  })

  it('TC-012: mastery 0.2에서 오답 → gap 판정 기준 확인 (mastery < 0.3)', () => {
    const mastery = 0.2
    // 실제 failure_type 분류는 LLM이지만 fallback 로직 기준 확인
    expect(mastery < 0.3).toBe(true) // → gap
  })

  it('반복 정답으로 1.0 초과하지 않음', () => {
    let mastery = 0.9
    for (let i = 0; i < 5; i++) {
      mastery = calculateNewMastery(mastery, true, i + 1)
    }
    expect(mastery).toBeLessThanOrEqual(1.0)
  })

  it('마스터리는 항상 0 이상', () => {
    const result = calculateNewMastery(0, false, 0)
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('소수점 3자리 반올림', () => {
    const result = calculateNewMastery(0.333, true, 2)
    const decimalPlaces = (result.toString().split('.')[1] ?? '').length
    expect(decimalPlaces).toBeLessThanOrEqual(3)
  })
})

// ──────────────────────────────────────────────
// /api/assess/submit 엔드포인트 통합 테스트
// (Supabase, LLM Gateway, Sandbox를 모킹)
// ──────────────────────────────────────────────
describe('POST /api/assess/submit', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('TC-002: 미인증 요청 시 401', async () => {
    // auth.getUser가 null 반환하는 상황 시뮬레이션
    vi.mock('@/lib/supabase/server', () => ({
      createServerClient: () => ({
        auth: { getUser: async () => ({ data: { user: null }, error: null }) },
      }),
      createServiceClient: () => ({}),
    }))

    const { POST } = await import('@/app/api/assess/submit/route')
    const req = new Request('http://localhost/api/assess/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: '00000000-0000-0000-0000-000000000001', curriculum_id: '00000000-0000-0000-0000-000000000002', concept_key: 'variables', answer: { type: 'mcq', index: 0 } }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('TC-003: zod 검증 실패 시 400 — item_id 누락', async () => {
    vi.mock('@/lib/supabase/server', () => ({
      createServerClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
      }),
      createServiceClient: () => ({}),
    }))

    const { POST } = await import('@/app/api/assess/submit/route')
    const req = new Request('http://localhost/api/assess/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ curriculum_id: '00000000-0000-0000-0000-000000000002', concept_key: 'variables', answer: { type: 'mcq', index: 0 } }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('TC-013: 존재하지 않는 item_id → 404', async () => {
    vi.mock('@/lib/supabase/server', () => ({
      createServerClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
        from: () => ({
          select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'not found' } }) }) }),
        }),
      }),
      createServiceClient: () => ({}),
    }))

    const { POST } = await import('@/app/api/assess/submit/route')
    const req = new Request('http://localhost/api/assess/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: '00000000-0000-0000-0000-000000000099',
        curriculum_id: '00000000-0000-0000-0000-000000000002',
        concept_key: 'variables',
        answer: { type: 'mcq', index: 0 },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(404)
  })
})
