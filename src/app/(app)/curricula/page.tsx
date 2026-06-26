import Link from 'next/link'
import { Plus, Sparkles, ArrowRight } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function CurriculaPage() {
  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: curricula } = await supabase
    .from('curricula')
    .select('*')
    .eq('owner_id', user!.id)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">내 커리큘럼</h1>
        <Link href="/onboarding" className="btn-primary">
          <Plus className="h-4 w-4" />
          새로 만들기
        </Link>
      </div>

      {curricula && curricula.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {curricula.map((c) => (
            <Link
              key={c.id}
              href={
                c.status === 'generating'
                  ? `/curricula/${c.id}/generating`
                  : `/curricula/${c.id}`
              }
              className="surface-interactive group p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-slate-100 group-hover:text-indigo-300 transition-colors line-clamp-2">
                  {c.goal_text}
                </h3>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    c.status === 'active'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : c.status === 'generating'
                      ? 'bg-amber-500/15 text-amber-400'
                      : 'bg-white/[0.05] text-slate-400'
                  }`}
                >
                  {c.status === 'active' ? '활성' : c.status === 'generating' ? '생성 중' : '보관됨'}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-400">
                {c.level_target} · {c.time_budget_hours_per_week}시간/주
              </p>
              <p className="mt-1 text-xs text-slate-500">{formatDate(c.created_at)}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="surface flex flex-col items-center border-dashed border-indigo-500/20 bg-indigo-500/[0.04] p-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
            <Sparkles className="h-7 w-7" />
          </div>
          <p className="font-medium text-slate-200">아직 커리큘럼이 없습니다</p>
          <p className="mt-1.5 text-sm text-slate-400">AI가 나만의 학습 경로를 만들어 드립니다.</p>
          <Link href="/onboarding" className="btn-primary mt-5">
            첫 커리큘럼 만들기
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
