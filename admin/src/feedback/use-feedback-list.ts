import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { FeedbackKind, FeedbackList, FeedbackStatusFilter } from './types'

export const feedbackPageSize = 25

export type FeedbackFilters = { query: string; kind: FeedbackKind | 'all'; status: FeedbackStatusFilter; page: number }

function feedbackListPath({ query, kind, status, page }: FeedbackFilters) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(feedbackPageSize), status })
  if (query.trim()) params.set('q', query.trim())
  if (kind !== 'all') params.set('kind', kind)
  return `/api/admin/feedback?${params}`
}

/** Loads one page of user feedback for the filters, debounced while typing. */
export function useFeedbackList(filters: FeedbackFilters) {
  const [data, setData] = useState<FeedbackList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setData(await api.request<FeedbackList>(feedbackListPath(filters))) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Feedbackul nu a putut fi încărcat') }
    finally { setLoading(false) }
  }, [filters])

  useEffect(() => { const timer = setTimeout(() => void load(), 220); return () => clearTimeout(timer) }, [load])

  return { data, loading, error, reload: load }
}
