import { useQuery } from '@tanstack/react-query'
import { extractApiError } from '@/lib/api-error'
import { apiFetch } from '@/lib/auth'
import { useCallback } from 'react'

async function fetchResource<T>(path: string): Promise<T> {
  const response = await apiFetch(path)
  const data = await response.json()
  if (!response.ok) {
    throw new Error(extractApiError(data, 'Unable to load data'))
  }
  return data as T
}

/** Shared query options, so code outside a component can read the same cached resource. */
export function apiResourceQuery<T>(path: string) {
  return {
    queryKey: ['api-resource', path],
    queryFn: () => fetchResource<T>(path)
  }
}

export function useApiResource<T>(path: string) {
  const query = useQuery(apiResourceQuery<T>(path))
  const { refetch } = query
  const reload = useCallback(() => {
    void refetch()
  }, [refetch])

  return {
    data: query.data ?? null,
    error:
      query.error instanceof Error
        ? query.error.message
        : query.error
          ? 'Unable to load data'
          : null,
    reload
  }
}
