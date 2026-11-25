import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/components/auth/use-auth'
import { billingOverview } from '@/components/billing/billing-overview'
import { apiFetch } from '@/lib/auth'
import { accountCreditsKey, type AccountCredits } from '@/lib/account-credits'
import { billingUsage, INITIAL_FREE_CREDITS, normalizeBillingPlan, PLAN_CREDITS } from '@/lib/billing'
import type { BillingData } from '@/types/api'

export type MonthlyUsage = { percent: number; resetsAt: string | null }

/** Uses the same allowance and rounding as Billing; this is balance, not a spending ledger. */
export function creditUsage(account: AccountCredits) {
  const plan = normalizeBillingPlan(account.plan)
  return {
    credits: Math.max(0, account.credits),
    unlimited: Boolean(account.creditsUnlimited),
    plan,
    allowance: plan === 'free' ? INITIAL_FREE_CREDITS : PLAN_CREDITS[plan],
    remaining: billingUsage(account.credits, plan).remaining
  }
}

/** Only confirmed billing dates for the same effective plan can accompany a fresh balance. */
export function creditPeriod(account: AccountCredits, billing: BillingData | undefined) {
  if (account.creditsUnlimited || account.plan === 'free' || !billing || billing.account.plan !== account.plan) return null
  const { period } = billingOverview(billing, false)
  if (!period || period.kind === 'lastConfirmed' || !Number.isFinite(Date.parse(period.date))) return null
  return period
}

export function useCreditUsage() {
  const { user, status } = useAuth()
  const enabled = status === 'authenticated' && Boolean(user)
  const balance = useQuery({
    queryKey: accountCreditsKey(user?.id),
    enabled,
    queryFn: async ({ signal }): Promise<AccountCredits> => {
      const response = await apiFetch('/api/user/credits', { signal })
      if (!response.ok) throw new Error('Unable to load credits')
      const account = await response.json() as AccountCredits
      if (!Number.isFinite(account.credits) || typeof account.plan !== 'string') throw new Error('Invalid credit balance')
      return account
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    retry: false
  })
  const billing = useQuery({
    queryKey: ['account-billing-period', user?.id, balance.data?.plan],
    enabled: enabled && Boolean(balance.data) && !balance.data?.creditsUnlimited && balance.data?.plan !== 'free',
    queryFn: async ({ signal }): Promise<BillingData> => {
      const response = await apiFetch('/api/stripe/billing', { signal })
      if (!response.ok) throw new Error('Unable to load billing period')
      return response.json()
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: false
  })
  return {
    authenticated: enabled,
    usage: balance.data ? creditUsage(balance.data) : null,
    period: balance.data ? creditPeriod(balance.data, billing.data) : null,
    error: balance.isError,
    refreshing: balance.isFetching,
    refresh: () => { void balance.refetch(); void billing.refetch() }
  }
}

/** Creation's existing meters show spent allowance; the circle shows the remaining share. */
export function useMonthlyUsage(): { data: MonthlyUsage | null } {
  const { usage, period } = useCreditUsage()
  if (!usage || usage.unlimited || usage.plan === 'free') return { data: null }
  return { data: {
    percent: 100 - usage.remaining,
    resetsAt: period?.kind === 'renews' ? period.date : null
  } }
}
