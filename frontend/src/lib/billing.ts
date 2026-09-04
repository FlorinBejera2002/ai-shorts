export const BILLING_PLAN_IDS = ['free', 'creator', 'pro', 'agency'] as const

export const PAID_BILLING_PLAN_IDS = ['creator', 'pro', 'agency'] as const
export const BILLING_LOCALES = ['en', 'ro'] as const

export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number]
export type PaidBillingPlanId = (typeof PAID_BILLING_PLAN_IDS)[number]
export type BillingLocale = (typeof BILLING_LOCALES)[number]

export const INITIAL_FREE_CREDITS = 100

export const PLAN_CREDITS: Record<PaidBillingPlanId, number> = {
  creator: 300,
  pro: 1000,
  agency: 999999
}

const PLAN_RANK: Record<BillingPlanId, number> = {
  free: 0,
  creator: 1,
  pro: 2,
  agency: 3
}

const PLAN_PRICE_ENV: Record<PaidBillingPlanId, string> = {
  creator: 'STRIPE_PRICE_CREATOR',
  pro: 'STRIPE_PRICE_PRO',
  agency: 'STRIPE_PRICE_AGENCY'
}

const CREDIT_PACK_ENV = [
  ['STRIPE_PRICE_CREDITS_100', 100],
  ['STRIPE_PRICE_CREDITS_500', 500],
  ['STRIPE_PRICE_CREDITS_1000', 1000]
] as const

type BillingEnvironment = Record<string, string | undefined>

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

export type BillingProviderState = {
  subscription: BillingSubscription | null
  invoices: BillingInvoice[]
}

export type CheckoutVerification =
  | { status: 'complete'; planId: PaidBillingPlanId }
  | { status: 'pending'; planId: PaidBillingPlanId }
  | { status: 'invalid'; planId: null }

export type SubscriptionStateVersion = {
  created: bigint
  priority: number
}

type ProviderSubscriptionCandidate = {
  id: string
  status: string
  metadata: { checkoutGeneration?: string | null }
}

export function parseBillingGeneration(raw: string | null | undefined): number {
  if (!raw || !/^\d{1,9}$/.test(raw)) return 0
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

export function chooseAuthoritativeSubscription<
  T extends ProviderSubscriptionCandidate
>(managedNewestFirst: readonly T[], eventSubscriptionId: string): T | null {
  const nonterminal = managedNewestFirst.filter(
    (subscription) => !isTerminalSubscriptionStatus(subscription.status)
  )
  if (nonterminal.length > 0) {
    return nonterminal.reduce((current, candidate) =>
      parseBillingGeneration(candidate.metadata.checkoutGeneration) >
      parseBillingGeneration(current.metadata.checkoutGeneration)
        ? candidate
        : current
    )
  }
  return (
    managedNewestFirst.find(
      (subscription) => subscription.id === eventSubscriptionId
    ) ?? null
  )
}

export function subscriptionStateVersion(
  status: unknown,
  eventCreated: unknown
): SubscriptionStateVersion {
  const parsedCreated =
    typeof eventCreated === 'number' && Number.isFinite(eventCreated)
      ? Math.max(0, Math.trunc(eventCreated))
      : 0
  const priority = isTerminalSubscriptionStatus(status)
    ? 100
    : status === 'past_due' || status === 'unpaid' || status === 'paused'
      ? 80
      : status === 'active' || status === 'trialing'
        ? 60
        : 40
  return { created: BigInt(parsedCreated), priority }
}

export function shouldApplySubscriptionState(
  current: SubscriptionStateVersion,
  incoming: SubscriptionStateVersion
) {
  return (
    incoming.created > current.created ||
    (incoming.created === current.created &&
      incoming.priority > current.priority)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[]
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key))
}

function configuredValue(
  environment: BillingEnvironment,
  key: string
): string | null {
  const value = environment[key]?.trim()
  return value ? value : null
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

export function getConfiguredPlanPrice(
  planId: PaidBillingPlanId,
  environment: BillingEnvironment = process.env
): string | null {
  const priceId = configuredValue(environment, PLAN_PRICE_ENV[planId])
  if (!priceId) return null

  const configuredMatches = PAID_BILLING_PLAN_IDS.filter(
    (candidate) =>
      configuredValue(environment, PLAN_PRICE_ENV[candidate]) === priceId
  )

  return configuredMatches.length === 1 ? priceId : null
}

export function getPlanForPrice(
  priceId: unknown,
  environment: BillingEnvironment = process.env
): PaidBillingPlanId | null {
  if (typeof priceId !== 'string' || !priceId.trim()) return null

  const matches = PAID_BILLING_PLAN_IDS.filter(
    (planId) => configuredValue(environment, PLAN_PRICE_ENV[planId]) === priceId
  )

  return matches.length === 1 ? (matches[0] ?? null) : null
}

export function getCreditsForPackPrice(
  priceId: unknown,
  environment: BillingEnvironment = process.env
): number | null {
  if (typeof priceId !== 'string' || !priceId.trim()) return null

  const matches = CREDIT_PACK_ENV.filter(
    ([key]) => configuredValue(environment, key) === priceId
  )

  return matches.length === 1 ? (matches[0]?.[1] ?? null) : null
}

export function isCheckoutSessionId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 255 &&
    /^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(value)
  )
}

export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  )
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

export function shouldGrantSubscriptionCredits(
  billingReason: unknown
): boolean {
  return (
    billingReason === 'subscription_create' ||
    billingReason === 'subscription_cycle'
  )
}

export function isTerminalSubscriptionStatus(status: unknown): boolean {
  return status === 'canceled' || status === 'incomplete_expired'
}

export function hasCompleteBillingPlanConfiguration(
  environment: BillingEnvironment = process.env
): boolean {
  const prices = PAID_BILLING_PLAN_IDS.map((planId) =>
    getConfiguredPlanPrice(planId, environment)
  )

  return (
    prices.every((price): price is string => price !== null) &&
    new Set(prices).size === PAID_BILLING_PLAN_IDS.length
  )
}

export async function readBoundedRequestText(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; text: string } | { ok: false }> {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return { ok: false }
    }
  }

  if (!request.body) return { ok: true, text: '' }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    totalBytes += value.byteLength
    if (totalBytes > maxBytes) {
      try {
        await reader.cancel()
      } catch {
        // The byte limit has already been enforced; cancellation is best-effort.
      }
      return { ok: false }
    }
    chunks.push(value)
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  return { ok: true, text: new TextDecoder().decode(body) }
}

export function stripeObjectId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (isRecord(value) && typeof value.id === 'string' && value.id.trim()) {
    return value.id
  }
  return null
}

export function subscriptionPeriodEnd(
  items: Array<{ current_period_end?: unknown }>
): Date | null {
  const validTimestamps = items
    .map((item) => item.current_period_end)
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value > 0
    )

  if (validTimestamps.length === 0) return null
  return new Date(Math.max(...validTimestamps) * 1000)
}

export function billingPath(locale: BillingLocale): string {
  return locale === 'ro' ? '/ro/dashboard/billing' : '/dashboard/billing'
}
