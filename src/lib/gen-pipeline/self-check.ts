import { z } from 'zod';
import { generateWithSchema } from '@/lib/llm/gateway';
import { selfCheckPrompt } from '@/lib/llm/prompts';
import type { UnitVariantContent } from '@/types/database';

const SelfCheckResultSchema = z.object({
  problem_clear: z.boolean(),
  concept_accurate: z.boolean(),
  code_valid: z.boolean(),
  motivation_genuine: z.boolean(),
  assessment_wellformed: z.boolean(),
  quality_score: z.number().min(0).max(1),
  issues: z.array(z.string()),
});

export type SelfCheckResult = z.infer<typeof SelfCheckResultSchema>;

// 3B 모델(Ollama)은 code_valid/assessment_wellformed 판단이 부정확하므로 quality_score만 체크
const QUALITY_THRESHOLD = 0.4;

export async function runSelfCheck(
  content: UnitVariantContent,
  conceptKey: string,
  jobId?: string
): Promise<SelfCheckResult> {
  const { system, user } = selfCheckPrompt(
    content as unknown as Record<string, unknown>,
    conceptKey
  );

  const result = await generateWithSchema(SelfCheckResultSchema, user, {
    tier: 'low', // 검증은 경량 모델 사용
    jobId,
    system,
  });

  return result.object;
}

export function isSelfCheckPassed(result: SelfCheckResult): boolean {
  return result.quality_score >= QUALITY_THRESHOLD;
}
