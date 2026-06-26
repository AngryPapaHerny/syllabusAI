import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(dateString))
}

export function estimateCost(
  usage: { promptTokens: number; completionTokens: number },
  provider: string,
  tier: 'high' | 'low'
): number {
  // 근사 비용 계산 (USD per 1M tokens)
  const rates: Record<string, Record<'high' | 'low', { input: number; output: number }>> = {
    anthropic: {
      high: { input: 15, output: 75 },   // claude-opus
      low: { input: 0.25, output: 1.25 }, // claude-haiku
    },
    openai: {
      high: { input: 5, output: 15 },   // gpt-4o
      low: { input: 0.15, output: 0.6 }, // gpt-4o-mini
    },
    google: {
      high: { input: 0.35, output: 1.05 }, // gemini-flash
      low: { input: 0.075, output: 0.3 },  // gemini-flash-lite
    },
  }

  const rate = rates[provider]?.[tier] ?? rates.anthropic.high
  return (
    (usage.promptTokens * rate.input + usage.completionTokens * rate.output) /
    1_000_000
  )
}
