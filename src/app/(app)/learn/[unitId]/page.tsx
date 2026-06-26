import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { PCSMARenderer } from '@/components/learn/PCSMARenderer'
import type { UnitVariantContent } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function LearnPage({
  params,
}: {
  params: Promise<{ unitId: string }>
}) {
  const { unitId } = await params
  const supabase = createServerClient()

  // curriculum_unit + unit_variant 조회
  const { data: unit } = await supabase
    .from('curriculum_units')
    .select('id, concept_key, title, order_idx, curriculum_id, status')
    .eq('id', unitId)
    .single()

  if (!unit || unit.status !== 'ready') notFound()

  const [variantResult, nextUnitResult] = await Promise.all([
    supabase
      .from('unit_variants')
      .select('id, content')
      .eq('concept_key', unit.concept_key)
      .eq('status', 'verified')
      .order('quality_score', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('curriculum_units')
      .select('id, title')
      .eq('curriculum_id', unit.curriculum_id)
      .gt('order_idx', unit.order_idx)
      .eq('status', 'ready')
      .order('order_idx', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  if (!variantResult.data) notFound()

  const content = variantResult.data.content as UnitVariantContent
  const nextUnit = nextUnitResult.data

  return (
    <div className="mx-auto max-w-3xl space-y-5 animate-fade-in-up">
      <div className="flex items-center gap-1.5 text-sm text-slate-400">
        <Link
          href={`/curricula/${unit.curriculum_id}`}
          className="transition-colors hover:text-slate-200"
        >
          커리큘럼
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
        <span className="font-medium text-slate-100">{unit.title}</span>
      </div>

      <PCSMARenderer
        content={content}
        unitId={unitId}
        variantId={variantResult.data.id}
        conceptKey={unit.concept_key}
        curriculumId={unit.curriculum_id}
        nextUnitId={nextUnit?.id}
        nextUnitTitle={nextUnit?.title}
      />
    </div>
  )
}
