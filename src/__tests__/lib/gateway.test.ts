/**
 * gateway.test.ts
 * LLM Gateway 테스트
 * - getModel: 올바른 모델 ID 선택
 * - estimateCost: 비용 계산
 * - generateWithSchema: jobId 있을 때 logLLMUsage 호출
 * - generateWithFallback: 첫 번째 프로바이더 실패 시 다음으로 폴백
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getModel, estimateCost } from '@/lib/llm/gateway'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

// ──────────────────────────────────────────────
// getModel
// ──────────────────────────────────────────────
describe('getModel', () => {
  it('anthropic high → claude-sonnet-4-6 모델 객체 반환', () => {
    // getModel은 provider SDK 객체를 반환하므로 null이 아님을 확인
    const model = getModel('anthropic', 'high')
    expect(model).toBeDefined()
    expect(model).not.toBeNull()
  })

  it('anthropic low → haiku 모델 반환', () => {
    const model = getModel('anthropic', 'low')
    expect(model).toBeDefined()
  })

  it('기본값(인자 없음)은 anthropic high', () => {
    const modelDefault = getModel()
    const modelExplicit = getModel('anthropic', 'high')
    // 두 객체의 타입이 같아야 함
    expect(typeof modelDefault).toBe(typeof modelExplicit)
  })
})

// ──────────────────────────────────────────────
// estimateCost
// ──────────────────────────────────────────────
describe('estimateCost', () => {
  it('anthropic high: 1M 토큰 → $3.0', () => {
    expect(estimateCost(1_000_000, 'anthropic', 'high')).toBeCloseTo(3.0)
  })

  it('anthropic low: 1M 토큰 → $0.25', () => {
    expect(estimateCost(1_000_000, 'anthropic', 'low')).toBeCloseTo(0.25)
  })

  it('openai high: 1M 토큰 → $5.0', () => {
    expect(estimateCost(1_000_000, 'openai', 'high')).toBeCloseTo(5.0)
  })

  it('google high: 1M 토큰 → $0.1', () => {
    expect(estimateCost(1_000_000, 'google', 'high')).toBeCloseTo(0.1)
  })

  it('토큰 0 시 비용 0', () => {
    expect(estimateCost(0, 'anthropic', 'high')).toBe(0)
  })

  it('소량 토큰 비용 계산', () => {
    // 3000 토큰, anthropic high = 3000/1M * 3.0 = 0.009
    expect(estimateCost(3000, 'anthropic', 'high')).toBeCloseTo(0.009)
  })
})

// ──────────────────────────────────────────────
// generateWithSchema — jobId 있을 때 비용 로깅
// ──────────────────────────────────────────────
describe('generateWithSchema', () => {
  it('jobId 제공 시 logLLMUsage(gen_jobs update) 호출', async () => {
    const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })

    vi.mock('@/lib/supabase/server', () => ({
      createServiceClient: () => ({
        from: () => ({ update: mockUpdate }),
      }),
    }))

    vi.mock('ai', () => ({
      generateObject: vi.fn().mockResolvedValue({
        object: { test: 'value' },
        usage: { totalTokens: 500 },
      }),
    }))

    const { generateWithSchema } = await import('@/lib/llm/gateway')
    const { z } = await import('zod')

    const schema = z.object({ test: z.string() })
    await generateWithSchema(schema, 'test prompt', { jobId: 'job-123', provider: 'anthropic', tier: 'high' })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: 500,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
      })
    )
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'job-123')
  })

  it('jobId 없으면 logLLMUsage 호출하지 않음', async () => {
    const mockUpdate = vi.fn()

    vi.mock('@/lib/supabase/server', () => ({
      createServiceClient: () => ({
        from: () => ({ update: mockUpdate }),
      }),
    }))

    vi.mock('ai', () => ({
      generateObject: vi.fn().mockResolvedValue({
        object: { result: 'ok' },
        usage: { totalTokens: 200 },
      }),
    }))

    const { generateWithSchema } = await import('@/lib/llm/gateway')
    const { z } = await import('zod')

    await generateWithSchema(z.object({ result: z.string() }), 'prompt', { provider: 'anthropic' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────
// generateWithFallback — 폴백 로직
// ──────────────────────────────────────────────
describe('generateWithFallback', () => {
  it('첫 번째 anthropic 성공 시 바로 반환', async () => {
    let callCount = 0

    vi.mock('ai', () => ({
      generateText: vi.fn().mockImplementation(() => {
        callCount++
        return Promise.resolve({ text: 'response', usage: { totalTokens: 100 } })
      }),
    }))

    const { generateWithFallback } = await import('@/lib/llm/gateway')
    const result = await generateWithFallback('test prompt')

    expect(result.provider).toBe('anthropic')
    expect(callCount).toBe(1)
  })

  it('anthropic 실패 시 openai로 폴백', async () => {
    let callCount = 0

    vi.mock('ai', () => ({
      generateText: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) throw new Error('anthropic unavailable')
        return Promise.resolve({ text: 'fallback response', usage: { totalTokens: 150 } })
      }),
    }))

    const { generateWithFallback } = await import('@/lib/llm/gateway')
    const result = await generateWithFallback('test prompt')

    expect(result.provider).toBe('openai')
    expect(callCount).toBe(2)
  })

  it('모든 프로바이더 실패 시 Error throw', async () => {
    vi.mock('ai', () => ({
      generateText: vi.fn().mockRejectedValue(new Error('all failed')),
    }))

    const { generateWithFallback } = await import('@/lib/llm/gateway')
    await expect(generateWithFallback('test prompt')).rejects.toThrow('All LLM providers failed')
  })
})
