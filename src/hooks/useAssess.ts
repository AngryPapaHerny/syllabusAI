'use client'

import { useState, useCallback } from 'react'
import type { AssessSubmitRequest, AssessSubmitResponse } from '@/types/api'

export function useAssess() {
  const [result, setResult] = useState<AssessSubmitResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitAnswer = useCallback(async (body: AssessSubmitRequest) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/assess/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error ?? 'Failed to submit answer')
        return null
      }
      const json: AssessSubmitResponse = await res.json()
      setResult(json)
      return json
    } catch {
      setError('Network error')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { result, loading, error, submitAnswer, reset }
}
