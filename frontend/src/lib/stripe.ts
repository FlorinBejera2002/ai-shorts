import Stripe from 'stripe'

import {
  type BillingInvoice,
  type BillingLocale,
  type BillingProviderState,
  type CheckoutVerification,
  PAID_BILLING_PLAN_IDS,
  type PaidBillingPlanId,
  billingPath,
  getConfiguredPlanPrice,
  getPlanForPrice,
  isCheckoutSessionId,
  isTerminalSubscriptionStatus,
  safeHttpsUrl,
  stripeObjectId,
  subscriptionPeriodEnd
} from '@/lib/billing'

let stripeClient: Stripe | null = null

export type BillingPlanPrice = {
  amount: number
  currency: string
}

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim()
  if (!secretKey) {
    throw new Error('Stripe is not configured')
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2026-06-24.dahlia',
      maxNetworkRetries: 2,
      timeout: 10_000
    })
  }

  return stripeClient
}

function getApplicationOrigin(): string {
  const configuredUrl =
    process.env.NEXTAUTH_URL?.trim() || process.env.APP_URL?.trim()
  if (!configuredUrl) {
    throw new Error('Application URL is not configured')
  }

  let url: URL
  try {
    url = new URL(configuredUrl)
  } catch {
    throw new Error('Application URL is invalid')
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error('Application URL is invalid')
  }

  return url.origin
}

export function getBillingCheckoutUrls(locale: BillingLocale) {
  const returnPath = billingPath(locale)
  const applicationOrigin = getApplicationOrigin()
  return {
    successUrl: `${applicationOrigin}${returnPath}?checkout_session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${applicationOrigin}${returnPath}?canceled=true`
  }
}

function customerMatches(
  actualCustomer: string | Stripe.Customer | Stripe.DeletedCustomer,
  expectedCustomerId: string
): boolean {
  return stripeObjectId(actualCustomer) === expectedCustomerId
}

function mapInvoice(invoice: Stripe.Invoice): BillingInvoice {
  return {
    id: invoice.id,
    number: invoice.number ?? invoice.id,
    status: invoice.status ?? 'unknown',
    createdAt: new Date(invoice.created * 1000).toISOString(),
    amount: invoice.amount_paid > 0 ? invoice.amount_paid : invoice.total,
    currency: /^[a-z]{3}$/i.test(invoice.currency) ? invoice.currency : 'usd',
    hostedUrl: safeHttpsUrl(invoice.hosted_invoice_url),
    pdfUrl: safeHttpsUrl(invoice.invoice_pdf)
  }
}

export async function loadConfiguredMonthlyPrice(
  planId: PaidBillingPlanId
): Promise<{ id: string; price: BillingPlanPrice }> {
  const priceId = getConfiguredPlanPrice(planId)
  if (!priceId || getPlanForPrice(priceId) !== planId) {
    throw new Error('Billing plan is not configured')
  }

  const price = await getStripe().prices.retrieve(priceId)
  if (
    price.id !== priceId ||
    !price.active ||
    price.type !== 'recurring' ||
    price.recurring?.interval !== 'month' ||
    price.recurring.interval_count !== 1 ||
    !Number.isSafeInteger(price.unit_amount) ||
    (price.unit_amount ?? -1) < 0 ||
    !/^[a-z]{3}$/i.test(price.currency)
  ) {
    throw new Error('Billing plan price is invalid')
  }

  return {
    id: priceId,
    price: {
      amount: price.unit_amount as number,
      currency: price.currency.toUpperCase()
    }
  }
}

export async function loadBillingPlanCatalog(): Promise<
  Record<PaidBillingPlanId, BillingPlanPrice>
> {
  const entries = await Promise.all(
    PAID_BILLING_PLAN_IDS.map(async (planId) => {
      const configured = await loadConfiguredMonthlyPrice(planId)
      return [planId, configured.price] as const
    })
  )
  return Object.fromEntries(entries) as Record<
    PaidBillingPlanId,
    BillingPlanPrice
  >
}

export async function findExistingCustomerSubscription(
  customerId: string
): Promise<Stripe.Subscription | null> {
  const subscriptions = await getStripe().subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100
  })

  return (
    subscriptions.data.find(
      (subscription) => !isTerminalSubscriptionStatus(subscription.status)
    ) ?? null
  )
}

export async function createCheckoutSession({
  userId,
  email,
  customerId,
  planId,
  locale,
  idempotencyKey,
  checkoutGeneration,
  priceId,
  expiresAt,
  successUrl,
  cancelUrl
}: {
  userId: string
  email: string
  customerId: string | null
  planId: PaidBillingPlanId
  locale: BillingLocale
  idempotencyKey: string
  checkoutGeneration: number
  priceId: string
  expiresAt: number
  successUrl: string
  cancelUrl: string
}) {
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId,
    metadata: {
      userId,
      planId,
      priceId,
      locale,
      checkoutGeneration: String(checkoutGeneration)
    },
    subscription_data: {
      metadata: {
        userId,
        planId,
        priceId,
        locale,
        checkoutGeneration: String(checkoutGeneration)
      }
    },
    // Stripe requires Checkout expirations to be at least 30 minutes away.
    // A bounded session makes abandoned claims safely recoverable.
    expires_at: expiresAt
  }

  if (customerId) {
    params.customer = customerId
  } else {
    params.customer_email = email
  }

  return getStripe().checkout.sessions.create(params, { idempotencyKey })
}

export async function findCheckoutSessionForClaim(claim: {
  userId: string
  generation: number
  customerId: string | null
  createdAt: Date
  checkoutExpiresAt: Date
}): Promise<Stripe.Checkout.Session | null> {
  let match: Stripe.Checkout.Session | null = null
  // Do not filter by status: a session with an expired local deadline may
  // have completed just before it, leaving an active paid subscription.
  const sessions = getStripe().checkout.sessions.list({
    ...(claim.customerId ? { customer: claim.customerId } : {}),
    created: {
      gte: Math.max(0, Math.floor(claim.createdAt.getTime() / 1000) - 5 * 60),
      lte: Math.ceil(claim.checkoutExpiresAt.getTime() / 1000) + 5 * 60
    },
    limit: 100
  })
  for await (const session of sessions) {
    if (
      session.mode !== 'subscription' ||
      session.client_reference_id !== claim.userId ||
      session.metadata?.userId !== claim.userId ||
      session.metadata?.checkoutGeneration !== String(claim.generation)
    ) {
      continue
    }
    if (match && match.id !== session.id) {
      throw new Error('Multiple provider sessions exist for one checkout claim')
    }
    match = session
  }
  return match
}

export async function createBillingPortalSession(
  customerId: string,
  locale: BillingLocale
) {
  return getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${getApplicationOrigin()}${billingPath(locale)}`
  })
}

export async function loadBillingProviderState({
  customerId,
  subscriptionId
}: {
  customerId: string
  subscriptionId: string | null
}): Promise<BillingProviderState> {
  const stripe = getStripe()
  const [invoiceList, subscription] = await Promise.all([
    stripe.invoices.list({ customer: customerId, limit: 12 }),
    subscriptionId
      ? stripe.subscriptions.retrieve(subscriptionId)
      : findExistingCustomerSubscription(customerId)
  ])

  if (subscription && !customerMatches(subscription.customer, customerId)) {
    throw new Error('Subscription customer mismatch')
  }

  const periodEnd = subscription
    ? subscriptionPeriodEnd(subscription.items.data)
    : null

  return {
    subscription: subscription
      ? {
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          currentPeriodEnd: periodEnd?.toISOString() ?? null
        }
      : null,
    invoices: invoiceList.data.map(mapInvoice)
  }
}

export async function verifyCheckoutSession({
  checkoutSessionId,
  userId,
  expectedCustomerId,
  expectedSubscriptionId
}: {
  checkoutSessionId: string
  userId: string
  expectedCustomerId?: string | null
  expectedSubscriptionId?: string | null
}): Promise<CheckoutVerification> {
  if (!isCheckoutSessionId(checkoutSessionId)) {
    return { status: 'invalid', planId: null }
  }

  const checkout =
    await getStripe().checkout.sessions.retrieve(checkoutSessionId)
  const planId = getPlanForPrice(checkout.metadata?.priceId)
  const customerId = stripeObjectId(checkout.customer)
  const subscriptionId = stripeObjectId(checkout.subscription)
  const ownsCheckout =
    checkout.mode === 'subscription' &&
    checkout.metadata?.userId === userId &&
    (!checkout.client_reference_id ||
      checkout.client_reference_id === userId) &&
    planId !== null &&
    checkout.metadata?.planId === planId &&
    customerId !== null &&
    subscriptionId !== null &&
    (!expectedCustomerId || expectedCustomerId === customerId) &&
    (!expectedSubscriptionId || expectedSubscriptionId === subscriptionId)

  if (!ownsCheckout || !planId || checkout.status === 'expired') {
    return { status: 'invalid', planId: null }
  }

  const paymentConfirmed =
    checkout.payment_status === 'paid' ||
    checkout.payment_status === 'no_payment_required'

  return checkout.status === 'complete' && paymentConfirmed
    ? { status: 'complete', planId }
    : { status: 'pending', planId }
}
