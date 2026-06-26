import Link from 'next/link'
import { Library, Brain, Target, Plus, Sparkles, ArrowRight, ChevronRight } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 로컬 개발 환경에서 user가 없을 수 있음
  const userId = user?.id ?? 'demo-user'

  const { data: curricula } = await supabase
    .from('curricula')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: masteries } = await supabase
    .from('learner_concept_mastery')
    .select('mastery, concept_key')
    .eq('user_id', userId)

  const avgMastery =
    masteries && masteries.length > 0
      ? Math.round(
          (masteries.reduce((s, m) => s + m.mastery, 0) / masteries.length) * 100
        )
      : null

  const stats = [
    { label: '커리큘럼', value: curricula?.length ?? 0, icon: Library, accent: false },
    { label: '학습한 개념', value: masteries?.length ?? 0, icon: Brain, accent: false },
    {
      label: '평균 마스터리',
      value: avgMastery !== null ? `${avgMastery}%` : '-',
      icon: Target,
      accent: true,
    },
  ]

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">대시보드</h1>
          <p className="mt-1 text-sm text-slate-400">학습 현황을 한눈에 확인하세요.</p>
        </div>
        <Link href="/onboarding" className="btn-primary">
          <Plus className="h-4 w-4" />
          새 커리큘럼
        </Link>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div
              key={s.label}
              className={
                s.accent
                  ? 'rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/[0.12] to-violet-500/[0.06] p-5'
                  : 'surface p-5'
              }
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm ${s.accent ? 'text-indigo-300' : 'text-slate-400'}`}>
                  {s.label}
                </span>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    s.accent ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/[0.05] text-slate-400'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <div
                className={`mt-3 text-3xl font-bold tabular-nums ${
                  s.accent ? 'text-indigo-300' : 'text-slate-100'
                }`}
              >
                {s.value}
              </div>
            </div>
          )
        })}
      </div>

      {/* 커리큘럼 목록 */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-100">내 커리큘럼</h2>
        {curricula && curricula.length > 0 ? (
          <div className="space-y-3">
            {curricula.map((c) => (
              <Link
                key={c.id}
                href={
                  c.status === 'generating'
                    ? `/curricula/${c.id}/generating`
                    : `/curricula/${c.id}`
                }
                className="surface-interactive group flex items-center justify-between p-4"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-100">{c.goal_text}</div>
                  <div className="mt-1 text-sm text-slate-400">
                    {c.level_target} · {c.time_budget_hours_per_week}시간/주 · {formatDate(c.created_at)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 pl-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      c.status === 'active'
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : c.status === 'generating'
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-white/[0.05] text-slate-400'
                    }`}
                  >
                    {c.status === 'active' ? '활성' : c.status === 'generating' ? '생성 중' : '보관됨'}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-600 transition-colors group-hover:text-indigo-400" />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="surface flex flex-col items-center border-dashed border-indigo-500/20 bg-indigo-500/[0.04] p-12 text-center">
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
      </section>
    </div>
  )
}
