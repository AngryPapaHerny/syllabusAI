import { z } from 'zod';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';

const DiagnosticSubmitSchema = z.object({
  curriculum_id: z.string().uuid(),
  responses: z
    .array(
      z.object({
        concept_key: z.string(),
        item_id: z.string().uuid(),
        answer: z.union([
          z.object({ index: z.number().int().min(0).max(3) }),
          z.object({ code: z.string() }),
        ]),
      })
    )
    .min(1)
    .max(20),
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

  const parsed = DiagnosticSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { curriculum_id, responses } = parsed.data;

  // 커리큘럼 존재 확인 (RLS 적용)
  const { data: curriculum, error: curriculumError } = await supabase
    .from('curricula')
    .select('id, level_target')
    .eq('id', curriculum_id)
    .single();

  if (curriculumError || !curriculum) {
    return Response.json({ error: 'Curriculum not found' }, { status: 404 });
  }

  // assessment_items 조회하여 정답 확인
  const itemIds = responses.map((r) => r.item_id);
  const { data: items, error: itemsError } = await supabase
    .from('assessment_items')
    .select('id, concept_key, type, answer')
    .in('id', itemIds);

  if (itemsError) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }

  const itemMap = new Map(
    (items ?? []).map((item) => [item.id, item])
  );

  // 개념별 정답/오답 집계
  const conceptResults = new Map<string, { correct: number; total: number }>();

  for (const response of responses) {
    const item = itemMap.get(response.item_id);
    if (!item) continue;

    const conceptKey = response.concept_key || item.concept_key;
    if (!conceptResults.has(conceptKey)) {
      conceptResults.set(conceptKey, { correct: 0, total: 0 });
    }
    const stats = conceptResults.get(conceptKey)!;
    stats.total++;

    // 채점
    const isCorrect = gradeAnswer(item, response.answer);
    if (isCorrect) stats.correct++;
  }

  // mastery 계산 및 upsert (0.0 ~ 1.0, 정답률 기반)
  const serviceClient = createServiceClient();
  const masteryEntries = Array.from(conceptResults.entries()).map(
    ([concept_key, stats]) => ({
      user_id: user.id,
      concept_key,
      mastery: stats.total > 0 ? stats.correct / stats.total : 0,
      last_seen: new Date().toISOString(),
      attempts: stats.total,
    })
  );

  const { error: masteryError } = await serviceClient
    .from('learner_concept_mastery')
    .upsert(masteryEntries, {
      onConflict: 'user_id,concept_key',
    });

  if (masteryError) {
    console.error('[POST /api/diagnostic/submit] mastery upsert error:', masteryError);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }

  // 학습 시작 유닛 추천 (mastery가 가장 낮은 core 유닛)
  const { data: units } = await supabase
    .from('curriculum_units')
    .select('id, concept_key, title')
    .eq('curriculum_id', curriculum_id)
    .eq('role', 'core')
    .eq('status', 'ready')
    .order('order_idx', { ascending: true });

  let recommendedStartUnit = null;
  if (units && units.length > 0) {
    // mastery가 가장 낮은 유닛 찾기
    const sortedUnits = units.sort((a, b) => {
      const masteryA = conceptResults.get(a.concept_key)?.correct ?? 0;
      const masteryB = conceptResults.get(b.concept_key)?.correct ?? 0;
      return masteryA - masteryB;
    });
    const first = sortedUnits[0];
    recommendedStartUnit = {
      curriculum_unit_id: first.id,
      concept_key: first.concept_key,
      title: first.title,
    };
  }

  // 응답 조립
  const masterySummary = masteryEntries.map((entry) => ({
    concept_key: entry.concept_key,
    mastery: entry.mastery,
    status: (entry.mastery >= 0.7 ? 'proficient' : 'needs_review') as
      | 'proficient'
      | 'needs_review',
  }));

  return Response.json({
    mastery_initialized: masteryEntries.length,
    mastery_summary: masterySummary,
    recommended_start_unit: recommendedStartUnit,
  });
}

function gradeAnswer(
  item: { type: string; answer: { index?: number; code?: string } },
  submittedAnswer: { index?: number; code?: string }
): boolean {
  if (item.type === 'mcq') {
    return item.answer.index === submittedAnswer.index;
  }
  // code 타입: 기대 출력과 비교 (Phase 0 단순 비교)
  if (item.type === 'code' && item.answer.code && submittedAnswer.code) {
    return (
      item.answer.code.trim() === submittedAnswer.code.trim()
    );
  }
  return false;
}
