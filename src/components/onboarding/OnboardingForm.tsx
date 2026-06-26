'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import type { CreateCurriculumRequest } from '@/types/api'

const LEVELS = [
  { value: 'beginner', label: '입문자', desc: '이 주제를 처음 배웁니다.' },
  { value: 'intermediate', label: '중급자', desc: '기초는 알고 있고 더 깊이 배우고 싶습니다.' },
  { value: 'advanced', label: '고급자', desc: '실무 수준으로 마스터하고 싶습니다.' },
] as const

export function OnboardingForm() {
  const router = useRouter()
  const [goalText, setGoalText] = useState('')
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner')
  const [hours, setHours] = useState(5)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const body: CreateCurriculumRequest = {
      goal_text: goalText,
      domain: 'coding',
      level_target: level,
      time_budget_hours_per_week: hours,
    }

    const res = await fetch('/api/curricula', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? '오류가 발생했습니다.')
      setLoading(false)
      return
    }

    const data = await res.json()
    router.push(`/curricula/${data.curriculum.id}/generating`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-slate-300">
          무엇을 배우고 싶으신가요?
        </label>
        <textarea
          value={goalText}
          onChange={(e) => setGoalText(e.target.value)}
          required
          minLength={10}
          maxLength={500}
          rows={3}
          className="input-field mt-1.5 resize-none"
          placeholder="예: React로 풀스택 웹 개발"
        />
        <p className="mt-1 text-xs text-slate-500">{goalText.length}/500</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300">현재 수준</label>
        <div className="mt-2 flex gap-3">
          {LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setLevel(l.value)}
              className={`flex-1 rounded-lg border p-3 text-center transition-all active:scale-[0.98] ${
                level === l.value
                  ? 'border-indigo-500 bg-indigo-500/15 font-medium text-indigo-300 shadow-md shadow-indigo-600/10'
                  : 'border-white/[0.12] text-slate-400 hover:border-indigo-500/50 hover:text-slate-200'
              }`}
            >
              <div className="text-sm font-medium">{l.label}</div>
              <div className="mt-0.5 text-xs opacity-70">{l.desc}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300">
          주당 학습 시간
        </label>
        <div className="mt-2 text-xl font-bold text-indigo-300">{hours}시간 / 주</div>
        <input
          type="range"
          min={1}
          max={20}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="mt-3 w-full"
        />
        <div className="mt-1 flex justify-between text-xs text-slate-500">
          <span>1시간</span>
          <span>20시간</span>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || goalText.length < 10}
        className="btn-primary w-full py-3"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            AI가 커리큘럼을 생성하는 중...
          </>
        ) : (
          <>
            커리큘럼 생성하기
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  )
}
