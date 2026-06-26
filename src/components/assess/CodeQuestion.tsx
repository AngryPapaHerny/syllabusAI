'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, ArrowRight, RotateCcw } from 'lucide-react'
import type { AssessSubmitResponse } from '@/types/api'
import { CodeSandbox } from '@/components/learn/CodeSandbox'
import { cn } from '@/lib/utils'

interface Props {
  stem: string
  expectedAnswer: string
  rationale: string
  conceptKey: string
  curriculumId: string
  variantId: string
  itemId?: string
  nextUnitId?: string
  onNextUnit?: () => void
  onBackToCurriculum?: () => void
}

const FAILURE_LABELS: Record<string, { label: string; desc: string; color: string }> = {
  gap:          { label: '개념 부재',    desc: '이 개념을 아직 학습하지 않았습니다. 보충 자료를 먼저 공부해 보세요.', color: 'amber' },
  misconception:{ label: '오개념',       desc: '개념을 잘못 이해하고 있습니다. 다른 방식으로 다시 살펴보세요.',         color: 'orange' },
  slip:         { label: '실수',         desc: '알고 있지만 실수했습니다. 한 번 더 도전해 보세요.',                       color: 'blue' },
}

export function CodeQuestion({
  stem,
  expectedAnswer,
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
  const [code, setCode] = useState('')
  const [result, setResult] = useState<AssessSubmitResponse | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    if (!code.trim()) return
    setLoading(true)

    // 인라인 모드: 클라이언트 채점 불가 → 항상 정답 처리 (학습뷰 연습)
    if (!itemId) {
      setResult({
        correct: true,
        failure_type: null,
        rationale,
        mastery_updated: { concept_key: conceptKey, previous_mastery: 0, new_mastery: 0 },
        next_action: { type: 'next_unit' },
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
        answer: { type: 'code', code },
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

        {/* 실행 결과 */}
        {result.execution_result && (
          <div className="overflow-hidden rounded-lg border border-white/[0.14]">
            <div className="border-b border-white/[0.08] bg-[#1E293B] px-3 py-1.5 text-xs text-slate-400">실행 결과</div>
            <div className="bg-[#0F172A] p-4 font-mono text-sm">
              {result.execution_result.stdout && (
                <pre className="whitespace-pre-wrap text-emerald-300">{result.execution_result.stdout}</pre>
              )}
              {result.execution_result.stderr && (
                <pre className="whitespace-pre-wrap text-rose-400">{result.execution_result.stderr}</pre>
              )}
            </div>
          </div>
        )}

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
            onClick={() => { setCode(''); setResult(null) }}
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
      <CodeSandbox
        initialCode=""
        language="python"
        onCodeChange={setCode}
      />
      <button
        onClick={handleSubmit}
        disabled={!code.trim() || loading}
        className="btn-primary w-full py-2.5"
      >
        {loading ? '채점 중...' : '제출'}
      </button>
    </div>
  )
}
