import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { ActivityPage } from './types'

export const activityPageSize = 15

/** Loads one page of a user's activity timeline. */
export function useUserActivity(userId: string, page: number) {
  const [data, setData] = useState<ActivityPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ page: String(page), pageSize: String(activityPageSize) })
    try { setData(await api.request<ActivityPage>(`/api/admin/users/${userId}/activity?${params}`)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Activitatea nu a putut fi încărcată') }
    finally { setLoading(false) }
  }, [userId, page])

  useEffect(() => { void load() }, [load])

  return { data, loading, error, reload: load }
}
