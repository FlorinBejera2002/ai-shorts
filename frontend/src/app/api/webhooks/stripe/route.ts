import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'

import {
  PLAN_CREDITS,
  type PaidBillingPlanId,
  chooseAuthoritativeSubscription,
  getCreditsForPackPrice,
  getPlanForPrice,
  hasCompleteBillingPlanConfiguration,
  isPaidBillingPlanId,
  isTerminalSubscriptionStatus,
  isUuid,
  parseBillingGeneration,
  readBoundedRequestText,
  shouldGrantSubscriptionCredits,
  stripeObjectId,
  subscriptionPeriodEnd,
  subscriptionStateVersion
} from '@/lib/billing'
import { createPrismaClient } from '@/lib/db'
import { getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'

const MAX_WEBHOOK_BYTES = 1024 * 1024

type BillingUser = {
  id: string
  plan: string
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  stripeSubscriptionStatus: string | null
}

type BillingIdentifiers = {
  metadataUserId: string | null
  customerId: string | null
  subscriptionId: string | null
  allowSubscriptionReplacement?: boolean
}

function isSubscriptionLifecycleEvent(
  event: Stripe.Event
): event is Stripe.Event & {
  data: { object: Stripe.Subscription }
} {
  return (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  )
}

async function lockBillingCustomer(
  tx: Prisma.TransactionClient,
  customerId: string
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${customerId}, 8675309))::text AS billing_lock`
  )
}

async function reconcileCurrentSubscription(
  eventSubscription: Stripe.Subscription
): Promise<Stripe.Subscription> {
  const customerId = stripeObjectId(eventSubscription.customer)
  const metadataUserId = eventSubscription.metadata.userId
  if (!customerId || !isUuid(metadataUserId)) return eventSubscription

  const subscriptions = await getStripe().subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100
  })
  const managed = subscriptions.data.filter(
    (subscription) =>
      subscription.metadata.userId === metadataUserId &&
      subscriptionPlan(subscription) !== null
  )
  // Stripe lists newest objects first. Generation is the stronger ordering
  // signal for server-created Sneepcut checkouts, while list order handles
  // legacy generation-zero replacements.
  return (
    chooseAuthoritativeSubscription(managed, eventSubscription.id) ??
    eventSubscription
  )
}

function subscriptionPriceId(subscription: Stripe.Subscription): string | null {
  return stripeObjectId(subscription.items.data[0]?.price)
}

function subscriptionPlan(
  subscription: Stripe.Subscription
): PaidBillingPlanId | null {
  const pricePlan = getPlanForPrice(subscriptionPriceId(subscription))
  if (pricePlan) return pricePlan

  return isUuid(subscription.metadata.userId) &&
    isPaidBillingPlanId(subscription.metadata.planId)
    ? subscription.metadata.planId
    : null
}

function invoiceMetadata(invoice: Stripe.Invoice): Stripe.Metadata | null {
  return invoice.parent?.subscription_details?.metadata ?? null
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parentSubscription =
    invoice.parent?.subscription_details?.subscription ?? null
  if (parentSubscription) return stripeObjectId(parentSubscription)

  for (const line of invoice.lines.data) {
    const subscriptionId = stripeObjectId(line.subscription)
    if (subscriptionId) return subscriptionId
  }

  return null
}

function invoicePlan(invoice: Stripe.Invoice): PaidBillingPlanId | null {
  const metadata = invoiceMetadata(invoice)
  const linePlans = new Set<PaidBillingPlanId>()
  for (const line of invoice.lines.data) {
    const priceId = stripeObjectId(line.pricing?.price_details?.price)
    const planId = getPlanForPrice(priceId)
    if (planId) linePlans.add(planId)
  }

  if (linePlans.size === 1) return Array.from(linePlans)[0] ?? null
  if (linePlans.size > 1) return null

  // Subscription metadata is server-authored at checkout and remains stable
  // when a Stripe Price is retired. It is only a fallback when no current
  // allowlisted line price can be resolved.
  return isUuid(metadata?.userId) && isPaidBillingPlanId(metadata?.planId)
    ? metadata.planId
    : null
}

async function findBillingUser(
  tx: Prisma.TransactionClient,
  identifiers: BillingIdentifiers
): Promise<BillingUser | null> {
  const linkedPredicates: Prisma.UserWhereInput[] = []
  if (identifiers.customerId) {
    linkedPredicates.push({ stripeCustomerId: identifiers.customerId })
  }
  if (identifiers.subscriptionId) {
    linkedPredicates.push({
      stripeSubscriptionId: identifiers.subscriptionId
    })
  }

  const linkedUsers =
    linkedPredicates.length > 0
      ? await tx.user.findMany({
          where: { OR: linkedPredicates },
          select: {
            id: true,
            plan: true,
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            stripeSubscriptionStatus: true
          },
          take: 2
        })
      : []
  const linkedIds = new Set(linkedUsers.map((user) => user.id))
  if (linkedIds.size > 1) return null

  const metadataUserId = isUuid(identifiers.metadataUserId)
    ? identifiers.metadataUserId
    : null
  const linkedUser = linkedUsers[0] ?? null
  if (linkedUser && metadataUserId && linkedUser.id !== metadataUserId) {
    return null
  }
  const user = linkedUser
    ? linkedUser
    : metadataUserId
      ? await tx.user.findUnique({
          where: { id: metadataUserId },
          select: {
            id: true,
            plan: true,
            stripeCustomerId: true,
            stripeSubscriptionId: true,
            stripeSubscriptionStatus: true
          }
        })
      : null
  if (!user) return null

  if (
    identifiers.customerId &&
    user.stripeCustomerId &&
    identifiers.customerId !== user.stripeCustomerId
  ) {
    return null
  }
  if (
    identifiers.subscriptionId &&
    user.stripeSubscriptionId &&
    identifiers.subscriptionId !== user.stripeSubscriptionId &&
    !identifiers.allowSubscriptionReplacement &&
    !isTerminalSubscriptionStatus(user.stripeSubscriptionStatus)
  ) {
    return null
  }

  return user
}

async function handleCheckoutCompleted(
  tx: Prisma.TransactionClient,
  checkout: Stripe.Checkout.Session
) {
  const user = await findBillingUser(tx, {
    metadataUserId: checkout.metadata?.userId ?? null,
    customerId: stripeObjectId(checkout.customer),
    subscriptionId: stripeObjectId(checkout.subscription)
  })
  if (!user) return
  const deletionRequest = await tx.accountDeletionRequest.findUnique({
    where: { userId: user.id },
    select: { userId: true }
  })
  if (deletionRequest) return

  const customerId = stripeObjectId(checkout.customer)
  if (checkout.mode === 'payment') {
    if (checkout.payment_status !== 'paid') return
    const credits = getCreditsForPackPrice(checkout.metadata?.priceId)
    if (!credits) return
    await tx.user.update({
      where: { id: user.id },
      data: {
        credits: { increment: credits },
        ...(customerId ? { stripeCustomerId: customerId } : {})
      }
    })
    return
  }

  const planId = getPlanForPrice(checkout.metadata?.priceId)
  const subscriptionId = stripeObjectId(checkout.subscription)
  if (
    !planId ||
    checkout.metadata?.planId !== planId ||
    !customerId ||
    !subscriptionId
  ) {
    return
  }

  // Checkout confirms the association, not lifecycle state. If another
  // subscription is already linked, its subscription webhook is the only
  // event allowed to replace that link.
  if (
    user.stripeSubscriptionId &&
    user.stripeSubscriptionId !== subscriptionId
  ) {
    return
  }

  const establishesPendingSubscription =
    user.stripeSubscriptionId !== subscriptionId ||
    !user.stripeSubscriptionStatus ||
    user.stripeSubscriptionStatus === 'incomplete'
  await tx.user.update({
    where: { id: user.id },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      ...(establishesPendingSubscription
        ? { stripeSubscriptionStatus: 'incomplete' }
        : {})
    }
  })
  await tx.billingCheckoutClaim.deleteMany({
    where: {
      userId: user.id,
      generation: parseBillingGeneration(checkout.metadata?.checkoutGeneration)
    }
  })
}

async function handleSubscriptionChanged(
  tx: Prisma.TransactionClient,
  subscription: Stripe.Subscription,
  eventCreated: number
) {
  const customerId = stripeObjectId(subscription.customer)
  const planId = subscriptionPlan(subscription)
  const user = await findBillingUser(tx, {
    metadataUserId: subscription.metadata.userId ?? null,
    customerId,
    subscriptionId: subscription.id,
    allowSubscriptionReplacement: true
  })
  if (!user) return
  const deletionRequest = await tx.accountDeletionRequest.findUnique({
    where: { userId: user.id },
    select: { userId: true }
  })
  if (deletionRequest) return

  const periodEnd = subscriptionPeriodEnd(subscription.items.data)
  const grantsAccess =
    subscription.status === 'active' || subscription.status === 'trialing'
  const stateVersion = subscriptionStateVersion(
    subscription.status,
    eventCreated
  )
  const generation = parseBillingGeneration(
    subscription.metadata.checkoutGeneration
  )
  await tx.user.update({
    where: { id: user.id },
    data: {
      plan: grantsAccess && planId ? planId : 'free',
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionStatus: subscription.status,
      stripeCancelAtPeriodEnd: subscription.cancel_at_period_end,
      stripeCurrentPeriodEnd: periodEnd,
      stripeStateEventCreated: stateVersion.created,
      stripeStateEventPriority: stateVersion.priority,
      stripeStateGeneration: generation
    }
  })
}

async function handleInvoicePaid(
  tx: Prisma.TransactionClient,
  invoice: Stripe.Invoice
) {
  if (!shouldGrantSubscriptionCredits(invoice.billing_reason)) return

  const metadata = invoiceMetadata(invoice)
  const customerId = stripeObjectId(invoice.customer)
  const subscriptionId = invoiceSubscriptionId(invoice)
  const user = await findBillingUser(tx, {
    metadataUserId: metadata?.userId ?? null,
    customerId,
    subscriptionId
  })
  if (!user) return

  const planId = invoicePlan(invoice)
  if (!planId) {
    // Do not acknowledge a managed invoice until its credit grant can be
    // resolved; rolling back lets Stripe safely retry after configuration or
    // event-ordering issues are corrected.
    throw new Error('Managed invoice plan could not be resolved')
  }

  await tx.user.update({
    where: { id: user.id },
    data: {
      credits: { increment: PLAN_CREDITS[planId] },
      ...(customerId ? { stripeCustomerId: customerId } : {})
    }
  })
}

async function handleInvoiceFailed(
  tx: Prisma.TransactionClient,
  invoice: Stripe.Invoice
) {
  const metadata = invoiceMetadata(invoice)
  const subscriptionId = invoiceSubscriptionId(invoice)
  const user = await findBillingUser(tx, {
    metadataUserId: metadata?.userId ?? null,
    customerId: stripeObjectId(invoice.customer),
    subscriptionId
  })
  if (!user) return

  if (
    !subscriptionId ||
    subscriptionId !== user.stripeSubscriptionId ||
    isTerminalSubscriptionStatus(user.stripeSubscriptionStatus)
  ) {
    return
  }

  // Invoice events are not the lifecycle authority and can arrive out of
  // order. The corresponding customer.subscription.updated event carries the
  // authoritative current status and is applied through the ordered guard.
}

function creditGrantId(event: Stripe.Event): string | null {
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object
    return shouldGrantSubscriptionCredits(invoice.billing_reason)
      ? `invoice:${invoice.id}`
      : null
  }

  if (event.type === 'checkout.session.completed') {
    const checkout = event.data.object
    return checkout.mode === 'payment' &&
      checkout.payment_status === 'paid' &&
      getCreditsForPackPrice(checkout.metadata?.priceId)
      ? `checkout:${checkout.id}`
      : null
  }

  return null
}

async function processEvent(tx: Prisma.TransactionClient, event: Stripe.Event) {
  await tx.stripeEvent.create({
    data: {
      id: event.id,
      type: event.type,
      creditGrantId: creditGrantId(event)
    }
  })

  if (event.type === 'checkout.session.completed') {
    await handleCheckoutCompleted(tx, event.data.object)
    return
  }
  if (isSubscriptionLifecycleEvent(event)) {
    const customerId = stripeObjectId(event.data.object.customer)
    if (!customerId) return
    // Serialize reconciliation per provider customer. Each waiter retrieves
    // Stripe's current state after obtaining the lock, so stale delivery order
    // and equal-second events cannot overwrite a newer snapshot.
    await lockBillingCustomer(tx, customerId)
    const current = await reconcileCurrentSubscription(event.data.object)
    await handleSubscriptionChanged(tx, current, event.created)
    return
  }
  if (event.type === 'invoice.payment_succeeded') {
    await handleInvoicePaid(tx, event.data.object)
    return
  }
  if (event.type === 'invoice.payment_failed') {
    await handleInvoiceFailed(tx, event.data.object)
  }
}

function isLedgerDuplicate(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (error.code !== 'P2002') return false

  const modelName = String(error.meta?.modelName ?? '')
  const target = String(error.meta?.target ?? '')
  return (
    modelName === 'StripeEvent' ||
    target.includes('stripe_events') ||
    target.includes('credit_grant_id')
  )
}

function requiresPlanConfiguration(event: Stripe.Event): boolean {
  if (event.type === 'checkout.session.completed') {
    return event.data.object.mode === 'subscription'
  }
  return (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted' ||
    event.type === 'invoice.payment_succeeded'
  )
}

export async function POST(request: Request) {
  const requestBody = await readBoundedRequestText(request, MAX_WEBHOOK_BYTES)
  if (!requestBody.ok) {
    return NextResponse.json({ error: 'request_too_large' }, { status: 413 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'webhook_not_configured' },
      { status: 503 }
    )
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
      requestBody.text,
      signature,
      webhookSecret
    )
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  if (
    requiresPlanConfiguration(event) &&
    !hasCompleteBillingPlanConfiguration()
  ) {
    return NextResponse.json(
      { error: 'billing_plans_not_configured' },
      { status: 503 }
    )
  }

  const prisma = createPrismaClient()
  try {
    await prisma.$transaction((tx) => processEvent(tx, event), {
      maxWait: 5_000,
      timeout: 20_000
    })
  } catch (error) {
    if (isLedgerDuplicate(error)) {
      return NextResponse.json({ received: true, duplicate: true })
    }
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true, duplicate: false })
}
