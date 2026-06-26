import { z } from 'zod';
import { generateWithSchema } from '@/lib/llm/gateway';
import { calibratorPrompt } from '@/lib/llm/prompts';

const ConceptSchema = z.object({
  concept_key: z.string(),
  title: z.string(),
  order_idx: z.number().int().min(1),
  role: z.enum(['core', 'optional', 'remediation']),
  estimated_minutes: z.number().int().min(5).max(120),
});

const CalibratorOutputSchema = z.object({
  concepts: z.array(ConceptSchema).min(3).max(18),
});

export type CalibratorOutput = z.infer<typeof CalibratorOutputSchema>;
export type ConceptItem = z.infer<typeof ConceptSchema>;

export async function runCalibrator(
  goalText: string,
  levelTarget: string,
  timeBudgetHoursPerWeek: number,
  jobId?: string
): Promise<CalibratorOutput> {
  const { system, user } = calibratorPrompt(
    goalText,
    levelTarget,
    timeBudgetHoursPerWeek
  );

  const result = await generateWithSchema(CalibratorOutputSchema, user, {
    tier: 'high',
    jobId,
    system,
  });

  return result.object;
}
