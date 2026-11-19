import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/auth'
import {
  PLAN_CREDITS,
  isPaidBillingPlanId,
  subscriptionPeriodKind
} from '@/lib/billing'
import type { BillingData } from '@/types/api'

export type MonthlyUsage = {
  /** Share of the plan's monthly allowance already spent, 0–100. */
  percent: number
  /** ISO date of the next renewal, or null when the plan will not renew. */
  resetsAt: string | null
}

const USAGE_STALE_MS = 5 * 60 * 1000

/** Monthly usage of a paid, active subscription; null when the account has no monthly allowance. */
export function monthlyUsage(
  billing: Pick<BillingData, 'account' | 'subscription'>
): MonthlyUsage | null {
  const { account, subscription } = billing
  const period = subscriptionPeriodKind(subscription)
  if (
    account.creditsUnlimited ||
    period === 'none' ||
    !isPaidBillingPlanId(account.plan) ||
    !Number.isFinite(account.credits)
  )
    return null
  const remaining = account.credits / PLAN_CREDITS[account.plan]
  return {
    percent: Math.round(Math.min(1, Math.max(0, 1 - remaining)) * 100),
    resetsAt:
      period === 'renews' ? (subscription?.currentPeriodEnd ?? null) : null
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
