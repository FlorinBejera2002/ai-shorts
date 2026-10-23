import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import { apiFetch } from '@/lib/auth'
import { hostedBillingDestination } from '@/lib/billing'
import { createBillingActionLock } from '@/lib/billing-action-lock'

const actionLock = createBillingActionLock()

export function useHostedBillingAction(
  kind: 'checkout' | 'portal',
  payload: { locale: string; planId?: string },
  errorLabel: string
) {
  const errorId = useId()
  const busy = useSyncExternalStore(actionLock.subscribe, actionLock.getSnapshot, () => false)
  const [started, setStarted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function restore(event: PageTransitionEvent) {
      if (event.persisted) {
        setStarted(false)
        actionLock.release()
      }
    }
    window.addEventListener('pageshow', restore)
    return () => window.removeEventListener('pageshow', restore)
  }, [])

  async function start(disabled = false) {
    if (disabled || !actionLock.acquire()) return
    setStarted(true)
    setError(null)
    try {
      const response = await apiFetch(`/api/stripe/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000)
      })
      const data: unknown = await response.json().catch(() => null)
      const destination = hostedBillingDestination(data, kind)
      if (!response.ok || !destination) throw new Error('Invalid billing response')
      window.location.assign(destination)
      // Hold the lock through navigation. A browser back-cache restore releases it.
    } catch {
      setError(errorLabel)
      setStarted(false)
      actionLock.release()
    }
  }

  return { start, busy, loading: busy && started, error, errorId }
}
