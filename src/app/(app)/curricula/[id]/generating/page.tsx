'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Sparkles, ArrowRight, AlertTriangle } from 'lucide-react'
import type { GetCurriculumResponse } from '@/types/api'

const MAX_POLLS = 72 // 6분 (5초 × 72)

export default function GeneratingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [data, setData] = useState<GetCurriculumResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let stopped = false
    let pollCount = 0

    async function poll() {
      if (pollCount >= MAX_POLLS) {
        setError('생성 시간이 너무 오래 걸리고 있습니다. 잠시 후 다시 시도해 주세요.')
        return
      }
      pollCount++

      try {
        const res = await fetch(`/api/curricula/${id}`)
        if (!res.ok) {
          setError('커리큘럼 정보를 불러오는 데 실패했습니다.')
          return
        }
        const json: GetCurriculumResponse = await res.json()
        setData(json)

        if (json.curriculum.status === 'active') {
          const diagRes = await fetch(`/api/curricula/${id}/has-diagnostic`)
          if (diagRes.ok) {
            const { has_items } = await diagRes.json()
            router.push(
              has_items
                ? `/diagnostic?curriculum_id=${id}`
                : `/curricula/${id}`
            )
          } else {
            router.push(`/curricula/${id}`)
          }
          return
        }
      } catch {
        // 네트워크 오류 — 계속 폴링
      }

      if (!stopped) {
        setTimeout(poll, 5000)
      }
    }

    poll()
    return () => { stopped = true }
  }, [id, router])

  const progress = data?.progress

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in-up">
      {/* 진행률 원형 */}
      <div className="relative h-28 w-28">
        <div className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-indigo-600/20 blur-2xl" />
        <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
          <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
          <circle
            cx="50" cy="50" r="44"
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8"
          />
          <circle
            cx="50" cy="50" r="44"
            fill="none" stroke="url(#progressGradient)" strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={`${2 * Math.PI * 44 * (1 - (progress?.percent ?? 0) / 100)}`}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xl font-bold tabular-nums text-slate-100">
          {progress?.percent ?? 0}%
        </div>
      </div>

      <h2 className="mt-6 flex items-center gap-2 text-xl font-semibold text-slate-100">
        <Sparkles className="h-5 w-5 text-indigo-400" />
        커리큘럼 생성 중
      </h2>
      <p className="mt-2 text-slate-400">
        AI가 학습 콘텐츠를 만들고 있습니다. 잠시 기다려 주세요.
      </p>

      {progress && (
        <p className="mt-3 text-sm tabular-nums text-slate-500">
          {progress.ready_units} / {progress.total_units} 유닛 준비됨
        </p>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-rose-500/30 bg-rose-500/[0.08] px-5 py-3">
          <p className="flex items-center justify-center gap-2 text-sm text-rose-400">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </p>
          <button
            onClick={() => router.push(`/curricula/${id}`)}
            className="btn-primary mt-3 py-1.5"
          >
            커리큘럼으로 이동
          </button>
        </div>
      )}

      {/* 준비된 유닛 미리 보기 */}
      {data && data.units.some((u) => u.status === 'ready') && (
        <div className="mt-10 w-full max-w-md space-y-2 text-left">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">준비된 유닛</p>
          {data.units
            .filter((u) => u.status === 'ready')
            .map((unit) => (
              <a
                key={unit.id}
                href={`/learn/${unit.id}`}
                className="surface-interactive group flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="font-medium text-slate-200">{unit.title}</span>
                <span className="flex items-center gap-1 text-indigo-400">
                  학습 시작
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </a>
            ))}
        </div>
      )}
    </div>
  )
}
