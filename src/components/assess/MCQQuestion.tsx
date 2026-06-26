'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, ArrowRight, RotateCcw } from 'lucide-react'
import type { AssessSubmitResponse } from '@/types/api'
import { cn } from '@/lib/utils'

interface Props {
  stem: string
  options: string[]
  correctIndex: number
  rationale: string
  conceptKey: string
  curriculumId: string
  variantId: string
  // 실제 DB item_id — 있으면 API 채점, 없으면 클라이언트 인라인 채점
  itemId?: string
  // 학습뷰 인라인 모드 전용 콜백
  nextUnitId?: string
  onNextUnit?: () => void
  onBackToCurriculum?: () => void
}

const FAILURE_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  gap:          { label: '개념 부재',    desc: '이 개념을 아직 학습하지 않았습니다. 보충 자료를 먼저 공부해 보세요.', color: 'amber' },
  misconception:{ label: '오개념',       desc: '개념을 잘못 이해하고 있습니다. 다른 방식으로 다시 살펴보세요.',         color: 'orange' },
  slip:         { label: '실수',         desc: '알고 있지만 실수했습니다. 한 번 더 도전해 보세요.',                       color: 'blue' },
}

export function MCQQuestion({
  stem,
  options,
  correctIndex,
  rationale,
  conceptKey,
  curriculumId,
  variantId,
  itemId,
  nextUnitId,
  onNextUnit,
  onBackToCurriculum,
}: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<number | null>(null)
  const [result, setResult] = useState<AssessSubmitResponse | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (selected === null) return
    setLoading(true)

    // 인라인 모드: 클라이언트 채점
    if (!itemId) {
      const correct = selected === correctIndex
      setResult({
        correct,
        failure_type: correct ? null : 'gap',
        rationale,
        mastery_updated: { concept_key: conceptKey, previous_mastery: 0, new_mastery: 0 },
        next_action: { type: correct ? 'next_unit' : 'retry' },
      })
      setLoading(false)
      return
    }

    const res = await fetch('/api/assess/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_id: itemId,
        curriculum_id: curriculumId,
        concept_key: conceptKey,
        answer: { type: 'mcq', index: selected },
      }),
    })
    const data: AssessSubmitResponse = await res.json()
    setResult(data)
    setLoading(false)
  }

  function navigateNext() {
    const action = result?.next_action
    if (!action) return

    if (action.type === 'next_unit') {
      if (action.next_unit_id) router.push(`/learn/${action.next_unit_id}`)
      else if (onNextUnit) onNextUnit()
      else if (onBackToCurriculum) onBackToCurriculum()
      else router.push(`/curricula/${curriculumId}`)
    } else if (action.type === 'remediation' && action.remediation_unit_id) {
      router.push(`/learn/${action.remediation_unit_id}`)
    }
  }

  if (result) {
    const failureInfo = result.failure_type ? FAILURE_LABELS[result.failure_type] : null

    return (
      <div className="space-y-4">
        {/* 정오답 배너 */}
        <div className={cn(
          'rounded-xl border p-4',
          result.correct
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : 'border-rose-500/40 bg-rose-500/10'
        )}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className={cn(
              'flex h-5 w-5 items-center justify-center rounded-full',
              result.correct ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
            )}>
              {result.correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            </span>
            <span className={result.correct ? 'text-emerald-400' : 'text-rose-400'}>
              {result.correct ? '정답입니다!' : '오답입니다.'}
            </span>
            {failureInfo && (
              <span className={cn(
                'ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium',
                failureInfo.color === 'amber'  ? 'bg-amber-500/15 text-amber-400' :
                failureInfo.color === 'orange' ? 'bg-orange-500/15 text-orange-400' :
                'bg-blue-500/15 text-blue-400'
              )}>
                {failureInfo.label}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">{result.rationale}</p>
          {failureInfo && (
            <p className="mt-1.5 text-xs text-slate-400">{failureInfo.desc}</p>
          )}
        </div>

        {/* 선택지 정답 표시 */}
        <div className="space-y-2">
          {options.map((opt, i) => (
            <div key={i} className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm',
              i === correctIndex
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                : i === selected && !result.correct
                ? 'border-rose-500/50 bg-rose-500/10 text-rose-300'
                : 'border-white/[0.08] text-slate-400'
            )}>
              <span className="font-medium">{String.fromCharCode(65 + i)}.</span>
              <span className="flex-1">{opt}</span>
              {i === correctIndex && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
              {i === selected && !result.correct && i !== correctIndex && (
                <X className="h-4 w-4 shrink-0 text-rose-400" />
              )}
            </div>
          ))}
        </div>

        {/* 다음 액션 버튼 */}
        {result.correct && (
          <button onClick={navigateNext} className="btn-success w-full py-2.5">
            {result.next_action.next_unit_id || nextUnitId ? '다음 유닛으로' : '커리큘럼으로'}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}

        {!result.correct && result.next_action.type === 'remediation' && (
          <button
            onClick={navigateNext}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-600/25 transition-all hover:bg-amber-500 active:scale-[0.98]"
          >
            보충 학습 하러 가기
            <ArrowRight className="h-4 w-4" />
          </button>
        )}

        {!result.correct && result.next_action.type !== 'remediation' && (
          <button
            onClick={() => { setSelected(null); setResult(null) }}
            className="btn-secondary w-full py-2.5"
          >
            <RotateCcw className="h-4 w-4" />
            다시 시도
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="font-medium text-slate-100 leading-relaxed">{stem}</p>
      <div className="space-y-2">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => setSelected(i)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg border px-4 py-3 text-left text-sm transition-all active:scale-[0.99]',
              selected === i
                ? 'border-indigo-500 bg-indigo-500/15 font-medium text-indigo-200'
                : 'border-white/[0.12] text-slate-300 hover:border-indigo-500/50 hover:text-slate-100'
            )}
          >
            <span className={cn(
              'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
              selected === i ? 'bg-indigo-500 text-white' : 'bg-white/[0.06] text-slate-400'
            )}>
              {String.fromCharCode(65 + i)}
            </span>
            <span>{opt}</span>
          </button>
        ))}
      </div>
      <button
        onClick={handleSubmit}
        disabled={selected === null || loading}
        className="btn-primary w-full py-2.5"
      >
        {loading ? '채점 중...' : '제출'}
      </button>
    </div>
  )
}
