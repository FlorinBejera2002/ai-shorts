import { useQuery } from '@tanstack/react-query'
import { extractApiError } from '@/lib/api-error'
import { apiFetch } from '@/lib/auth'

async function fetchResource<T>(path: string): Promise<T> {
  const response = await apiFetch(path)
  const data = await response.json()
  if (!response.ok) {
    throw new Error(extractApiError(data, 'Unable to load data'))
  }
  return data as T
}

export function useApiResource<T>(path: string) {
  const query = useQuery({
    queryKey: ['api-resource', path],
    queryFn: () => fetchResource<T>(path)
  })
  const reload = () => {
    void query.refetch()
  }

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
