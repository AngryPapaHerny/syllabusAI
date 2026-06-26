import { ArrowRight } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { DiagnosticQuiz } from '@/components/diagnostic/DiagnosticQuiz'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function DiagnosticPage({
  searchParams,
}: {
  searchParams: Promise<{ curriculum_id?: string }>
}) {
  const params = await searchParams
  const curriculumId = params.curriculum_id

  if (!curriculumId) {
    redirect('/dashboard')
  }

  const supabase = createServerClient()

  const { data: curriculum } = await supabase
    .from('curricula')
    .select('id, goal_text, level_target, curriculum_units(concept_key, status)')
    .eq('id', curriculumId)
    .single()

  if (!curriculum) {
    redirect('/dashboard')
  }

  const readyConceptKeys: string[] = (
    curriculum.curriculum_units as { concept_key: string; status: string }[]
  )
    ?.filter((u) => u.status === 'ready')
    .map((u) => u.concept_key) ?? []

  const { data: items } = await supabase
    .from('assessment_items')
    .select('*')
    .in('concept_key', readyConceptKeys.slice(0, 10))
    .eq('type', 'mcq')
    .limit(10)

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up">
      <div className="mb-8">
        <p className="mb-1 text-xs font-medium uppercase tracking-wider text-indigo-400">
          사전 진단
        </p>
        <h1 className="text-2xl font-bold text-slate-100">현재 수준을 파악해요</h1>
        <p className="mt-2 text-slate-400">
          {curriculum.goal_text} 관련 기초 지식을 확인하는 진단입니다.{' '}
          <span className="text-slate-500">({items?.length ?? 0}문항 · 약 2분)</span>
        </p>
      </div>

      {items && items.length > 0 ? (
        <DiagnosticQuiz items={items} curriculumId={curriculumId} />
      ) : (
        <div className="surface space-y-4 p-10 text-center">
          <p className="text-slate-400">아직 진단 문항이 준비되지 않았습니다.</p>
          <a href={`/curricula/${curriculumId}`} className="btn-primary">
            커리큘럼 바로 시작
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      )}
    </div>
  )
}
