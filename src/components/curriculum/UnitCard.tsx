import Link from 'next/link'
import { Check, Loader2, AlertCircle, ArrowRight } from 'lucide-react'
import type { CurriculumUnit } from '@/types/database'
import { cn } from '@/lib/utils'

interface Props {
  unit: CurriculumUnit
}

const roleLabel: Record<string, string> = {
  core: '핵심',
  optional: '선택',
  remediation: '보충',
}

const roleBadgeStyle: Record<string, string> = {
  core:        'bg-indigo-500/15 text-indigo-400',
  optional:    'bg-white/[0.06] text-slate-400',
  remediation: 'bg-amber-500/15 text-amber-400',
}

export function UnitCard({ unit }: Props) {
  const isReady = unit.status === 'ready'
  const isPending = unit.status === 'pending'

  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-xl border bg-[#1E293B] p-4 transition-all',
        isReady
          ? 'border-white/[0.08] hover:border-indigo-500/40 hover:shadow-lg hover:shadow-black/20'
          : 'border-white/[0.04] opacity-60'
      )}
    >
      <div className="flex items-center gap-3">
        {/* 상태/순서 인디케이터 */}
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold',
            isReady ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20' : 'bg-white/[0.06] text-slate-500'
          )}
        >
          {isReady ? <Check className="h-4 w-4" /> : unit.order_idx + 1}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-100">{unit.title}</span>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              roleBadgeStyle[unit.role] ?? 'bg-white/[0.06] text-slate-400'
            )}>
              {roleLabel[unit.role] ?? unit.role}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-xs text-slate-500">{unit.concept_key}</div>
        </div>
      </div>

      <div className="shrink-0">
        {isReady ? (
          <Link
            href={`/learn/${unit.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-500 active:scale-[0.98]"
          >
            학습하기
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : isPending ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            생성 중
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-rose-400">
            <AlertCircle className="h-3.5 w-3.5" />
            실패
          </span>
        )}
      </div>
    </div>
  )
}
