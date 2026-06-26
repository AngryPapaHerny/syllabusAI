import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { UnitCard } from '@/components/curriculum/UnitCard'
import { ProgressBar } from '@/components/curriculum/ProgressBar'

export const dynamic = 'force-dynamic'

export default async function CurriculumDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: curriculum } = await supabase
    .from('curricula')
    .select('*')
    .eq('id', id)
    .single()

  if (!curriculum) notFound()

  // 생성 중이면 폴링 페이지로 리다이렉트
  if (curriculum.status === 'generating') {
    redirect(`/curricula/${id}/generating`)
  }

  const { data: units } = await supabase
    .from('curriculum_units')
    .select('*')
    .eq('curriculum_id', id)
    .order('order_idx')

  const totalUnits = units?.length ?? 0
  const readyUnits = units?.filter((u) => u.status === 'ready').length ?? 0

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{curriculum.goal_text}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {curriculum.level_target} · {curriculum.time_budget_hours_per_week}시간/주
          </p>
        </div>
        <Link href="/onboarding" className="btn-secondary shrink-0 px-3 py-2 text-sm">
          <Plus className="h-4 w-4" />
          새로 만들기
        </Link>
      </div>

      <ProgressBar
        value={readyUnits}
        max={totalUnits}
        label={`${readyUnits} / ${totalUnits} 유닛 준비됨`}
      />

      <div className="space-y-3">
        {units?.map((unit) => <UnitCard key={unit.id} unit={unit} />)}
      </div>
    </div>
  )
}
