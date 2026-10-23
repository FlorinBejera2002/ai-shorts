import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, authClient } from '@/lib/auth'
import { CHECKOUT_CONFIRMATION_INTERVAL_MS, shouldConfirmCheckout } from '@/lib/billing'
import { extractApiError } from '@/lib/api-error'
import type { BillingData } from '@/types/api'

type BillingResourceData = BillingData & { confirmationAttempts: number }

async function reconcileBilling() {
  const response = await apiFetch('/api/stripe/reconcile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(20000)
  })
  if (!response.ok) throw new Error('Unable to refresh billing status')
}

/** Checkout is only a hint to reconcile; access always comes from the authenticated API. */
export function useBillingResource(path: string) {
  const confirmation = useRef({ path, attempts: 0 })
  const refreshing = useRef(false)
  const [recovering, setRecovering] = useState(false)
  const [recoveryFailed, setRecoveryFailed] = useState(false)
  const queryClient = useQueryClient()
  const returnParams = new URL(path, 'https://sneepcut.invalid').searchParams
  const hasCheckoutReturn = returnParams.has('checkout_session_id')
  const hasPortalReturn = returnParams.get('portal_return') === 'true'
  const query = useQuery({
    queryKey: ['api-resource', path],
    queryFn: async (): Promise<BillingResourceData> => {
      if (confirmation.current.path !== path) confirmation.current = { path, attempts: 0 }
      const current = confirmation.current
      if ((hasCheckoutReturn || (hasPortalReturn && current.attempts === 0)) && !refreshing.current) {
        // A temporary reconciliation failure must not hide the saved billing overview.
        // A subscription may activate before its invoice credit callback arrives.
        await reconcileBilling().catch(() => undefined)
      }
      current.attempts += 1
      const response = await apiFetch(path, { signal: AbortSignal.timeout(20000) })
      const data = await response.json()
      if (!response.ok) throw new Error(extractApiError(data, 'Unable to load billing'))
      const billing = data as BillingData
      const user = authClient.getSnapshot().user
      if (user && (user.plan !== billing.account.plan || user.credits !== billing.account.credits)) {
        // Refresh from the server; never derive entitlements from the redirect or UI selection.
        await authClient.refresh().catch(() => undefined)
      }
      return { ...billing, confirmationAttempts: current.attempts }
    },
    refetchInterval: (current) => hasCheckoutReturn && current.state.data &&
      shouldConfirmCheckout(current.state.data.checkoutVerification, confirmation.current.attempts)
      ? CHECKOUT_CONFIRMATION_INTERVAL_MS : false,
    refetchIntervalInBackground: false
  })

  async function reload() {
    if (refreshing.current) return
    refreshing.current = true
    setRecovering(true)
    setRecoveryFailed(false)
    try {
      let unavailable = false
      await reconcileBilling().catch(() => { unavailable = true })
      await query.refetch({ throwOnError: true })
      await queryClient.invalidateQueries({ queryKey: ['public', 'stripe-plans'] })
      setRecoveryFailed(unavailable)
    } catch {
      setRecoveryFailed(true)
    } finally {
      refreshing.current = false
      setRecovering(false)
    }
  }

  return {
    data: query.data ?? null,
    error: query.error instanceof Error ? query.error.message : null,
    reload,
    recovering,
    recoveryFailed,
    confirmationDelayed: Boolean(query.data && hasCheckoutReturn &&
      (query.isError || !shouldConfirmCheckout(query.data.checkoutVerification, query.data.confirmationAttempts)) &&
      (query.data.checkoutVerification?.status === 'pending' || query.data.checkoutVerification?.status === 'unavailable'))
  }
}
