import {
  billingUsage,
  isTerminalSubscriptionStatus,
  needsSubscriptionConfirmation,
  normalizeBillingPlan,
  subscriptionPeriodKind,
  type BillingPlanId,
  type BillingUsage
} from '@/lib/billing'
import type { BillingData } from '@/types/api'

export type BillingTone = 'success' | 'warning' | 'neutral'
export type BillingAccess = 'admin' | 'free' | 'paid'

/** Message keys are relative to the `billing` namespace. */
export type BillingOverview = {
  currentPlan: BillingPlanId
  access: BillingAccess
  hasSubscription: boolean
  needsConfirmation: boolean
  confirmingCheckout: boolean
  status: { key: string; tone: BillingTone } | null
  period: { kind: 'renews' | 'ends' | 'period'; date: string } | null
  usage: (BillingUsage & { resets: boolean }) | null
  canManageBilling: boolean
  canChangePlan: boolean
}

const STATUS_KEYS: Record<string, string> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'pastDue',
  unpaid: 'unpaid',
  incomplete: 'incomplete',
  incomplete_expired: 'incompleteExpired',
  canceled: 'canceled',
  paused: 'paused'
}
const PAYMENT_ISSUES = ['past_due', 'unpaid', 'incomplete']

export function needsPaymentAttention(data: BillingData) {
  return PAYMENT_ISSUES.includes(data.subscription?.status ?? '')
}

function subscriptionStatus(
  data: BillingData,
  access: BillingAccess,
  needsConfirmation: boolean
): BillingOverview['status'] {
  const subscription = data.subscription
  if (access === 'admin') return null
  if (needsConfirmation) return { key: 'coverageUnconfirmed', tone: 'warning' }
  if (!subscription || access === 'free') return null
  if (subscriptionPeriodKind(subscription) === 'ends')
    return { key: 'summaryDesign.cancellationScheduled', tone: 'neutral' }
  const key = `statuses.${STATUS_KEYS[subscription.status] ?? 'unknown'}`
  if (subscription.status === 'active' || subscription.status === 'trialing')
    return { key, tone: 'success' }
  return { key, tone: PAYMENT_ISSUES.includes(subscription.status) ? 'warning' : 'neutral' }
}

/** Everything the overview shows, derived only from the authenticated billing response. */
export function billingOverview(data: BillingData, unlimited: boolean): BillingOverview {
  const currentPlan = normalizeBillingPlan(data.account.plan)
  const access: BillingAccess = unlimited ? 'admin' : currentPlan === 'free' ? 'free' : 'paid'
  const subscription = data.subscription
  const needsConfirmation = needsSubscriptionConfirmation(
    currentPlan,
    subscription,
    data.account.hasBillingProfile,
    unlimited
  )
  // A past-due subscription still renews once Stripe collects the payment (canvas Ab-PastDue).
  const periodKind = subscriptionPeriodKind(subscription)
  const kind = periodKind === 'period' && subscription?.status === 'past_due' ? 'renews' : periodKind
  const confirmingCheckout =
    data.checkoutVerification?.status === 'pending' ||
    data.checkoutVerification?.status === 'unavailable'
  return {
    currentPlan,
    access,
    hasSubscription: Boolean(subscription && !isTerminalSubscriptionStatus(subscription.status)),
    needsConfirmation,
    confirmingCheckout,
    status: subscriptionStatus(data, access, needsConfirmation),
    period:
      kind !== 'none' && subscription?.currentPeriodEnd
        ? { kind, date: subscription.currentPeriodEnd }
        : null,
    usage:
      access === 'admin'
        ? null
        : { ...billingUsage(data.account.credits, currentPlan), resets: access === 'paid' },
    canManageBilling: data.account.hasBillingProfile,
    canChangePlan: access !== 'admin' && !confirmingCheckout && !needsPaymentAttention(data)
  }
}
