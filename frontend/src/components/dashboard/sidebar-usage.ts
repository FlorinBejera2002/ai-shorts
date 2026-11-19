import { useQuery } from '@tanstack/react-query'
import { billingOverview } from '@/components/billing/billing-overview'
import { apiFetch } from '@/lib/auth'
import type { BillingData } from '@/types/api'

export type MonthlyUsage = {
  /** Share of the plan allowance already spent, 0–100 — the same number the Billing page shows. */
  percent: number
  /** ISO date the allowance resets, or null when no confirmed billing period is known. */
  resetsAt: string | null
}

const USAGE_STALE_MS = 5 * 60 * 1000

/**
 * Monthly usage for the sidebar card, derived from the Billing page's own overview.
 * Only paid access has a monthly allowance; Free and admin accounts show no card (canvas Ab-Free).
 */
export function monthlyUsage(billing: BillingData): MonthlyUsage | null {
  const { usage, period } = billingOverview(
    billing,
    Boolean(billing.account.creditsUnlimited)
  )
  if (!usage?.resets) return null
  return {
    percent: usage.used,
    resetsAt: period && period.kind !== 'lastConfirmed' ? period.date : null
  }
}

/** Reads the authenticated billing overview once per shell and keeps only the usage summary. */
export function useMonthlyUsage() {
  return useQuery({
    queryKey: ['sidebar', 'monthly-usage'],
    queryFn: async ({ signal }) => {
      const response = await apiFetch('/api/stripe/billing', { signal })
      if (!response.ok) throw new Error('Unable to load monthly usage')
      return monthlyUsage((await response.json()) as BillingData)
    },
    staleTime: USAGE_STALE_MS,
    retry: false
  })
}
