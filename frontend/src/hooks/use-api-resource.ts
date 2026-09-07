'use client'
import { extractApiError } from '@/lib/api-error'
import { apiFetch } from '@/lib/auth'
import { useCallback, useEffect, useState } from 'react'
export function useApiResource<T>(path: string) {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<{
    path: string
    data: T | null
    error: string | null
  }>({ path, data: null, error: null })
  const reload = useCallback(() => setVersion((value) => value + 1), [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: version explicitly requests a fresh server read.
  useEffect(() => {
    const controller = new AbortController()
    setState({ path, data: null, error: null })
    void apiFetch(path, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok)
          throw new Error(extractApiError(data, 'Unable to load data'))
        if (!controller.signal.aborted)
          setState({ path, data: data as T, error: null })
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            path,
            data: null,
            error:
              error instanceof Error ? error.message : 'Unable to load data'
          })
      })
    return () => controller.abort()
  }, [path, version])
  return {
    data: state.path === path ? state.data : null,
    error: state.path === path ? state.error : null,
    reload
  }
}
