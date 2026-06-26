import { z } from 'zod';
import { generateWithSchema } from '@/lib/llm/gateway';
import { writerPrompt } from '@/lib/llm/prompts';
import type { UnitVariantContent } from '@/types/database';

const AssessmentSchema = z.object({
  type: z.enum(['mcq', 'code']),
  stem: z.string().min(10),
  options: z.array(z.string()).length(4).nullable(),
  answer: z.object({
    index: z.number().int().min(0).max(3).optional(),
    code: z.string().optional(),
  }),
  rationale: z.string().min(10),
});

export const PCSMASchema = z.object({
  P: z.string().min(20),
  C: z.string().min(30),
  S: z.string().min(10),
  M: z.string().min(20),
  A: AssessmentSchema,
});

export type PCSMAContent = z.infer<typeof PCSMASchema>;

export async function runWriter(
  conceptKey: string,
  level: string,
  goalText: string,
  jobId?: string
): Promise<UnitVariantContent> {
  const { system, user } = writerPrompt(conceptKey, level, goalText);

  const result = await generateWithSchema(PCSMASchema, user, {
    tier: 'high',
    jobId,
    system,
  });

  return result.object as UnitVariantContent;
}
