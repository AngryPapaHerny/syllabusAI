'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react'
import type { AssessmentItem } from '@/types/database'
import type { DiagnosticSubmitResponse } from '@/types/api'
import { cn } from '@/lib/utils'

interface Props {
  items: AssessmentItem[]
  curriculumId: string
}

export function DiagnosticQuiz({ items, curriculumId }: Props) {
  const router = useRouter()
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<Record<string, { index?: number }>>({})
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DiagnosticSubmitResponse | null>(null)

  const item = items[current]
  const isLast = current === items.length - 1
  const selectedIndex = answers[item.id]?.index

  function selectAnswer(index: number) {
    setAnswers((prev) => ({ ...prev, [item.id]: { index } }))
  }

  async function handleNext() {
    if (isLast) {
      await handleSubmit()
    } else {
      setCurrent((c) => c + 1)
    }
  }

  async function handleSubmit() {
    setLoading(true)
    const responses = items
      .filter((it) => answers[it.id] !== undefined)
      .map((it) => ({
        concept_key: it.concept_key,
        item_id: it.id,
        answer: answers[it.id],
      }))

    const res = await fetch('/api/diagnostic/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ curriculum_id: curriculumId, responses }),
    })

    if (res.ok) {
      const data: DiagnosticSubmitResponse = await res.json()
      setResult(data)
    } else {
      router.push(`/curricula/${curriculumId}`)
    }
  }

  // 결과 화면
  if (result) {
    const proficient = result.mastery_summary.filter((m) => m.status === 'proficient').length
    const total = result.mastery_summary.length

    return (
      <div className="space-y-6 animate-fade-in-up">
        <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/[0.12] to-violet-500/[0.06] p-6 text-center">
          <div className="text-4xl font-bold tabular-nums text-indigo-300">
            {proficient} / {total}
          </div>
          <p className="mt-2 text-sm text-slate-400">개념을 이미 알고 있습니다</p>
        </div>

        <div className="space-y-2">
          {result.mastery_summary.map((m) => (
            <div
              key={m.concept_key}
              className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-[#1E293B] px-4 py-3"
            >
              <span className="font-mono text-sm text-slate-300">{m.concept_key.replace(/_/g, ' ')}</span>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  m.status === 'proficient'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-amber-500/15 text-amber-400'
                )}
              >
                {m.status === 'proficient' ? '숙달' : '학습 필요'}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={() => {
            if (result.recommended_start_unit) {
              router.push(`/learn/${result.recommended_start_unit.curriculum_unit_id}`)
            } else {
              router.push(`/curricula/${curriculumId}`)
            }
          }}
          className="btn-primary w-full py-3"
        >
          {result.recommended_start_unit
            ? `'${result.recommended_start_unit.title}' 부터 시작하기`
            : '커리큘럼으로 이동'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* 진행 바 */}
      <div className="space-y-2">
        <div className="flex gap-1.5">
          {items.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                i < current
                  ? 'bg-indigo-500'
                  : i === current
                  ? 'bg-indigo-300'
                  : 'bg-white/[0.1]'
              )}
            />
          ))}
        </div>
        <p className="text-xs tabular-nums text-slate-500">
          {current + 1} / {items.length} 문항
        </p>
      </div>

      {/* 문항 카드 */}
      <div className="surface p-6">
        <p className="font-medium leading-relaxed text-slate-100">{item.stem}</p>
        <div className="mt-5 space-y-2">
          {item.options?.map((opt, i) => (
            <button
              key={i}
              onClick={() => selectAnswer(i)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg border px-4 py-3 text-left text-sm transition-all active:scale-[0.99]',
                selectedIndex === i
                  ? 'border-indigo-500 bg-indigo-500/15 font-medium text-indigo-200'
                  : 'border-white/[0.12] text-slate-300 hover:border-indigo-500/50 hover:text-slate-100'
              )}
            >
              <span className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
                selectedIndex === i ? 'bg-indigo-500 text-white' : 'bg-white/[0.06] text-slate-400'
              )}>
                {String.fromCharCode(65 + i)}
              </span>
              <span>{opt}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 네비게이션 */}
      <div className="flex justify-between">
        <button
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={current === 0}
          className="btn-secondary disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
          이전
        </button>
        <button
          onClick={handleNext}
          disabled={selectedIndex === undefined || loading}
          className="btn-primary px-6"
        >
          {loading ? '제출 중...' : isLast ? '진단 완료' : '다음'}
          {!loading && !isLast && <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
