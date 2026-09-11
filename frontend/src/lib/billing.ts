export const BILLING_PLAN_IDS = ['free', 'creator', 'pro', 'agency'] as const

export const PAID_BILLING_PLAN_IDS = ['creator', 'pro', 'agency'] as const
export const BILLING_LOCALES = ['en', 'ro'] as const

export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number]
export type PaidBillingPlanId = (typeof PAID_BILLING_PLAN_IDS)[number]
export type BillingLocale = (typeof BILLING_LOCALES)[number]

export const INITIAL_FREE_CREDITS = 100
export const CREDITS_PER_CLIP = 10

export const PLAN_CREDITS: Record<PaidBillingPlanId, number> = {
  creator: 300,
  pro: 1000,
  agency: 999999
}

export function estimateAvailableClips(credits: number): number {
  if (!Number.isFinite(credits) || credits <= 0) return 0
  return Math.floor(credits / CREDITS_PER_CLIP)
}

const PLAN_RANK: Record<BillingPlanId, number> = {
  free: 0,
  creator: 1,
  pro: 2,
  agency: 3
}

type ValidationSuccess<T> = { success: true; data: T }
type ValidationFailure = { success: false; error: string }
export type BillingValidationResult<T> =
  | ValidationSuccess<T>
  | ValidationFailure

export type BillingInvoice = {
  id: string
  number: string
  status: string
  createdAt: string
  amount: number
  currency: string
  hostedUrl: string | null
  pdfUrl: string | null
}

export type BillingSubscription = {
  status: string
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
}

export type CheckoutVerification =
  | { status: 'complete'; planId: PaidBillingPlanId }
  | { status: 'pending'; planId: PaidBillingPlanId }
  | { status: 'invalid'; planId: null }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key))
}

export function isBillingPlanId(value: unknown): value is BillingPlanId {
  return (
    typeof value === 'string' &&
    BILLING_PLAN_IDS.includes(value as BillingPlanId)
  )
}

export function isPaidBillingPlanId(
  value: unknown
): value is PaidBillingPlanId {
  return (
    typeof value === 'string' &&
    PAID_BILLING_PLAN_IDS.includes(value as PaidBillingPlanId)
  )
}

export function normalizeBillingPlan(value: unknown): BillingPlanId {
  return isBillingPlanId(value) ? value : 'free'
}

export function normalizeBillingLocale(value: unknown): BillingLocale {
  return typeof value === 'string' &&
    BILLING_LOCALES.includes(value as BillingLocale)
    ? (value as BillingLocale)
    : 'en'
}

export function validateCheckoutPayload(
  payload: unknown
): BillingValidationResult<{
  planId: PaidBillingPlanId
  locale: BillingLocale
}> {
  if (!isRecord(payload) || !hasOnlyKeys(payload, ['planId', 'locale'])) {
    return { success: false, error: 'invalid_body' }
  }

  if (!isPaidBillingPlanId(payload.planId)) {
    return { success: false, error: 'invalid_plan' }
  }

  if (
    payload.locale !== undefined &&
    (typeof payload.locale !== 'string' ||
      !BILLING_LOCALES.includes(payload.locale as BillingLocale))
  ) {
    return { success: false, error: 'invalid_locale' }
  }

  return {
    success: true,
    data: {
      planId: payload.planId,
      locale: normalizeBillingLocale(payload.locale)
    }
  }
}

export function validatePortalPayload(
  payload: unknown
): BillingValidationResult<{ locale: BillingLocale }> {
  if (!isRecord(payload) || !hasOnlyKeys(payload, ['locale'])) {
    return { success: false, error: 'invalid_body' }
  }

  if (
    payload.locale !== undefined &&
    (typeof payload.locale !== 'string' ||
      !BILLING_LOCALES.includes(payload.locale as BillingLocale))
  ) {
    return { success: false, error: 'invalid_locale' }
  }

  return {
    success: true,
    data: { locale: normalizeBillingLocale(payload.locale) }
  }
}

export function canStartPlanCheckout(
  currentPlan: BillingPlanId,
  targetPlan: PaidBillingPlanId
): boolean {
  return PLAN_RANK[targetPlan] > PLAN_RANK[currentPlan]
}

export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null

  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export function isTerminalSubscriptionStatus(status: unknown): boolean {
  return status === 'canceled' || status === 'incomplete_expired'
}
