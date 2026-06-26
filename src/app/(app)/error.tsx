'use client'

import { useEffect } from 'react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <h2 className="text-xl font-semibold text-slate-100">오류가 발생했습니다</h2>
      <p className="mt-2 text-sm text-slate-400">{error.message || '알 수 없는 오류입니다.'}</p>
      <button
        onClick={reset}
        className="mt-6 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
      >
        다시 시도
      </button>
    </div>
  )
}
