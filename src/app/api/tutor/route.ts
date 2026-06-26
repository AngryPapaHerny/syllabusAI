import { z } from 'zod';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { streamWithContext } from '@/lib/llm/gateway';
import { tutorSystemPrompt } from '@/lib/llm/prompts';
import type { CoreMessage } from 'ai';

const TutorRequestSchema = z.object({
  curriculum_id: z.string().uuid(),
  concept_key: z.string(),
  unit_variant_id: z.string().uuid().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(2000),
      })
    )
    .min(1)
    .max(20),
  context: z
    .object({
      current_section: z.enum(['P', 'C', 'S', 'M', 'A']).optional(),
      user_code: z.string().max(5000).optional(),
      error_message: z.string().max(500).optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  // 인증 확인
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 요청 검증
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = TutorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { concept_key, unit_variant_id, messages, context } = parsed.data;

  // 현재 마스터리 조회
  const { data: mastery } = await supabase
    .from('learner_concept_mastery')
    .select('mastery')
    .eq('user_id', user.id)
    .eq('concept_key', concept_key)
    .single();

  const currentMastery = mastery?.mastery ?? 0;

  // unit_variant 콘텐츠 조회 (선택적)
  let content: { P?: string; C?: string; S?: string; M?: string } | null = null;
  if (unit_variant_id) {
    const { data: variant } = await supabase
      .from('unit_variants')
      .select('content')
      .eq('id', unit_variant_id)
      .single();
    if (variant?.content) {
      content = variant.content as { P?: string; C?: string; S?: string; M?: string };
    }
  }

  // 시스템 프롬프트 구성
  const systemPrompt = tutorSystemPrompt(
    concept_key,
    currentMastery,
    content,
    context?.current_section,
    context?.user_code,
    context?.error_message
  );

  // 스트리밍 응답
  let result;
  try {
    result = streamWithContext({
      tier: 'high',
      system: systemPrompt,
      messages: messages as CoreMessage[],
    });
  } catch (err) {
    console.error('[POST /api/tutor] LLM stream error:', err);
    return Response.json(
      { error: 'LLM service unavailable' },
      { status: 503 }
    );
  }

  // 완료 후 gen_jobs에 비용 기록 (background)
  const serviceClient = createServiceClient();
  const defaultProvider = process.env.DEFAULT_LLM_PROVIDER ?? 'google';
  result.usage.then(async (usage) => {
    if (!usage) return;
    const totalTokens = usage.totalTokens;
    // 단가: anthropic $3/1M, google $0.1/1M
    const costPer1M = defaultProvider === 'anthropic' ? 3.0 : 0.1;
    const cost = (totalTokens / 1_000_000) * costPer1M;
    await serviceClient.from('gen_jobs').insert({
      type: 'tutor_session',
      payload: {
        user_id: user.id,
        concept_key,
        owner_id: user.id,
      },
      status: 'done',
      provider: defaultProvider,
      model: defaultProvider === 'anthropic' ? 'claude-sonnet-4-6' : 'gemini-2.0-flash',
      tokens: totalTokens,
      cost,
      finished_at: new Date().toISOString(),
    });
  }).catch((err) => {
    console.error('[POST /api/tutor] usage logging error:', err);
  });

  return result.toDataStreamResponse();
}
