import { createServerClient } from '@/lib/supabase/server';

interface RouteParams {
  params: { id: string };
}

export async function GET(_req: Request, { params }: RouteParams) {
  // 인증 확인
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = params;

  // curricula 조회 (RLS: owner_id = auth.uid() 자동 적용)
  const { data: curriculum, error: curriculumError } = await supabase
    .from('curricula')
    .select('*')
    .eq('id', id)
    .single();

  if (curriculumError || !curriculum) {
    return Response.json({ error: 'Curriculum not found' }, { status: 404 });
  }

  // curriculum_units 조회
  const { data: units, error: unitsError } = await supabase
    .from('curriculum_units')
    .select('*')
    .eq('curriculum_id', id)
    .order('order_idx', { ascending: true });

  if (unitsError) {
    console.error('[GET /api/curricula/:id] units error:', unitsError);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }

  const unitsList = units ?? [];

  // ready 상태인 유닛의 variant 조회
  const readyUnits = unitsList.filter((u) => u.status === 'ready');
  const variantMap: Record<string, { id: string; format: string; quality_score: number }> = {};

  if (readyUnits.length > 0) {
    const conceptKeys = readyUnits.map((u) => u.concept_key);
    const { data: variants } = await supabase
      .from('unit_variants')
      .select('id, concept_key, format, quality_score')
      .in('concept_key', conceptKeys)
      .eq('status', 'verified')
      .eq('level', curriculum.level_target);

    if (variants) {
      // concept_key별 최고 quality_score variant 선택
      for (const variant of variants) {
        const existing = variantMap[variant.concept_key];
        if (!existing || variant.quality_score > existing.quality_score) {
          variantMap[variant.concept_key] = {
            id: variant.id,
            format: variant.format,
            quality_score: variant.quality_score,
          };
        }
      }
    }
  }

  // 응답 조립
  const enrichedUnits = unitsList.map((unit) => ({
    id: unit.id,
    concept_key: unit.concept_key,
    title: unit.title,
    order_idx: unit.order_idx,
    role: unit.role,
    status: unit.status,
    ...(unit.status === 'ready' && variantMap[unit.concept_key]
      ? { variant: variantMap[unit.concept_key] }
      : {}),
  }));

  const readyCount = unitsList.filter((u) => u.status === 'ready').length;
  const totalCount = unitsList.length;

  return Response.json({
    curriculum,
    units: enrichedUnits,
    progress: {
      total_units: totalCount,
      ready_units: readyCount,
      percent: totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0,
    },
  });
}
