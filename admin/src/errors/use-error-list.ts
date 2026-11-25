import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { ErrorList, ErrorSource, ErrorState } from './types'

export const errorPageSize = 25

export type ErrorFilters = { query: string; source: ErrorSource | 'all'; state: ErrorState; page: number }

function errorListPath({ query, source, state, page }: ErrorFilters) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(errorPageSize), state })
  if (query.trim()) params.set('q', query.trim())
  if (source !== 'all') params.set('source', source)
  return `/api/admin/errors?${params}`
}

/** Loads one page of error groups for the filters, debounced while typing. */
export function useErrorList(filters: ErrorFilters) {
  const [data, setData] = useState<ErrorList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setData(await api.request<ErrorList>(errorListPath(filters))) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Erorile nu au putut fi încărcate') }
    finally { setLoading(false) }
  }, [filters])

  useEffect(() => { const timer = setTimeout(() => void load(), 220); return () => clearTimeout(timer) }, [load])

  return { data, loading, error, reload: load }
}
