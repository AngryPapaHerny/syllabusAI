'use client'

import { useState, useCallback } from 'react'
import type { GetCurriculumResponse, CreateCurriculumRequest, CreateCurriculumResponse } from '@/types/api'

export function useCurriculum(curriculumId?: string) {
  const [data, setData] = useState<GetCurriculumResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCurriculum = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/curricula/${id}`)
      if (!res.ok) {
        const err = await res.json()
        setError(err.error ?? 'Failed to fetch curriculum')
        return null
      }
      const json: GetCurriculumResponse = await res.json()
      setData(json)
      return json
    } catch {
      setError('Network error')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const createCurriculum = useCallback(async (body: CreateCurriculumRequest) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/curricula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error ?? 'Failed to create curriculum')
        return null
      }
      const json: CreateCurriculumResponse = await res.json()
      return json
    } catch {
      setError('Network error')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { data, loading, error, fetchCurriculum, createCurriculum }
}
