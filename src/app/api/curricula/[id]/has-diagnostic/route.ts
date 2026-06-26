import { createServerClient } from '@/lib/supabase/server';

interface RouteParams {
  params: { id: string };
}

export async function GET(_req: Request, { params }: RouteParams) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = params;

  // 커리큘럼 소유권 확인
  const { data: curriculum } = await supabase
    .from('curricula')
    .select('id')
    .eq('id', id)
    .single();

  if (!curriculum) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // 해당 커리큘럼의 concept_key에 연결된 assessment_items 존재 여부 확인
  const { data: units } = await supabase
    .from('curriculum_units')
    .select('concept_key')
    .eq('curriculum_id', id)
    .eq('status', 'ready');

  const conceptKeys = (units ?? []).map((u) => u.concept_key);

  if (conceptKeys.length === 0) {
    return Response.json({ has_items: false });
  }

  const { count } = await supabase
    .from('assessment_items')
    .select('id', { count: 'exact', head: true })
    .in('concept_key', conceptKeys);

  return Response.json({ has_items: (count ?? 0) > 0 });
}
