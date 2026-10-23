import { useEffect, useReducer } from 'react'
import { api } from '../api'

type QueryState<T> = { data: T | null; loading: boolean; error: string }
type QueryAction<T> = { type: 'loading' } | { type: 'loaded'; data: T } | { type: 'failed'; error: string }

function queryReducer<T>(state: QueryState<T>, action: QueryAction<T>): QueryState<T> {
  switch (action.type) {
    case 'loading': return { data: null, loading: true, error: '' }
    case 'loaded': return { data: action.data, loading: false, error: '' }
    case 'failed': return { data: null, loading: false, error: action.error }
    default: return state
  }
}

export function useBillingQuery<T>(path: string, revision: number, delay = 0) {
  const [state, dispatch] = useReducer(queryReducer<T>, { data: null, loading: true, error: '' })

  useEffect(() => {
    const controller = new AbortController()
    dispatch({ type: 'loading' })
    const timer = setTimeout(async () => {
      try {
        const data = await api.request<T>(path, { signal: controller.signal })
        if (!controller.signal.aborted) dispatch({ type: 'loaded', data })
      } catch (error) {
        if (!controller.signal.aborted) {
          dispatch({ type: 'failed', error: error instanceof Error ? error.message : 'Datele de facturare nu au putut fi încărcate.' })
        }
      }
    }, delay)
    return () => { clearTimeout(timer); controller.abort() }
  }, [path, revision, delay])

  return state
}
