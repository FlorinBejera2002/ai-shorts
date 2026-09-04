import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import {
  type BillingLocale,
  type PaidBillingPlanId,
  canStartPlanCheckout,
  isPaidBillingPlanId,
  isTerminalSubscriptionStatus,
  normalizeBillingLocale,
  normalizeBillingPlan,
  readBoundedRequestText,
  validateCheckoutPayload
} from '@/lib/billing'
import {
  CHECKOUT_CLAIM_LEASE_MS,
  CHECKOUT_SESSION_LIFETIME_MS,
  checkoutClaimHasReplayWindow,
  checkoutClaimRecoveryState,
  checkoutIdempotencyKey
} from '@/lib/billing-checkout-claim'
import { createPrismaClient } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import {
  createBillingPortalSession,
  createCheckoutSession,
  findCheckoutSessionForClaim,
  findExistingCustomerSubscription,
  getBillingCheckoutUrls,
  getStripe,
  loadConfiguredMonthlyPrice
} from '@/lib/stripe'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 1024
type DatabaseClient = ReturnType<typeof createPrismaClient>

type CheckoutClaim = {
  userId: string
  token: string
  planId: string
  priceId: string
  locale: string
  customerId: string | null
  customerEmail: string
  successUrl: string
  cancelUrl: string
  generation: number
  sessionId: string | null
  leaseExpiresAt: Date
  checkoutExpiresAt: Date
  createdAt: Date
}

type CheckoutSnapshot = {
  planId: PaidBillingPlanId
  priceId: string
  locale: BillingLocale
  customerId: string | null
  customerEmail: string
  successUrl: string
  cancelUrl: string
}

type ClaimedCheckout = {
  claim: CheckoutClaim
  owned: boolean
}

class CheckoutClaimChangedError extends Error {}

function noStoreJson(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' }
  })
}

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
}

async function createOrLoadCheckoutClaim(
  prisma: DatabaseClient,
  userId: string,
  snapshot: CheckoutSnapshot
): Promise<ClaimedCheckout | null> {
  const token = randomUUID()
  const leaseExpiresAt = new Date(Date.now() + CHECKOUT_CLAIM_LEASE_MS)
  const checkoutExpiresAt = new Date(Date.now() + CHECKOUT_SESSION_LIFETIME_MS)

  try {
    const claim = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { stripeCheckoutGeneration: { increment: 1 } },
        select: { stripeCheckoutGeneration: true }
      })
      return tx.billingCheckoutClaim.create({
        data: {
          userId,
          token,
          ...snapshot,
          generation: user.stripeCheckoutGeneration,
          leaseExpiresAt,
          checkoutExpiresAt
        }
      })
    })
    return { claim, owned: true }
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
  }

  const existing = await prisma.billingCheckoutClaim.findUnique({
    where: { userId }
  })
  if (!existing) return null
  // A persisted provider session is always reconciled with Stripe, even when
  // our local expiry has passed. It may have completed just before expiry.
  if (existing.sessionId) {
    return { claim: existing, owned: false }
  }
  const recoveryState = checkoutClaimRecoveryState(existing)
  if (recoveryState === 'leased') {
    return { claim: existing, owned: false }
  }

  // A provider request can time out after Stripe accepted it. Reclaim the
  // same generation so its server-generated idempotency key is reused.
  const reclaimed = await prisma.billingCheckoutClaim.updateMany({
    where: {
      userId,
      token: existing.token,
      generation: existing.generation,
      sessionId: null,
      leaseExpiresAt: { lte: new Date() }
    },
    // Do not mutate any provider parameter within a generation. Stripe
    // requires byte-for-byte equivalent parameters for idempotent replay.
    data: {
      token,
      leaseExpiresAt: new Date(Date.now() + CHECKOUT_CLAIM_LEASE_MS)
    }
  })
  if (reclaimed.count !== 1) return null
  const claim = await prisma.billingCheckoutClaim.findUnique({
    where: { userId }
  })
  if (!claim || claim.token !== token) return null

  if (recoveryState !== 'replayable') {
    const checkout = await findCheckoutSessionForClaim(claim)
    if (checkout) {
      const persisted = await prisma.billingCheckoutClaim.updateMany({
        where: {
          userId,
          token: claim.token,
          generation: claim.generation,
          sessionId: null
        },
        data: { sessionId: checkout.id }
      })
      return persisted.count === 1
        ? { claim: { ...claim, sessionId: checkout.id }, owned: false }
        : null
    }
    if (recoveryState === 'expired') {
      // Expiry alone is not sufficient: a completed session remains payable
      // history. Only a complete provider lookup proving this generation does
      // not exist permits rotation after the expiry/grace deadline.
      return rotateCheckoutClaim(prisma, claim, snapshot)
    }
    return { claim, owned: false }
  }

  return { claim, owned: true }
}

async function rotateCheckoutClaim(
  prisma: DatabaseClient,
  previous: CheckoutClaim,
  snapshot: CheckoutSnapshot
): Promise<ClaimedCheckout | null> {
  const token = randomUUID()
  try {
    const claim = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: previous.userId },
        data: { stripeCheckoutGeneration: { increment: 1 } },
        select: { stripeCheckoutGeneration: true }
      })
      const updated = await tx.billingCheckoutClaim.updateMany({
        where: {
          userId: previous.userId,
          token: previous.token,
          generation: previous.generation,
          sessionId: previous.sessionId
        },
        data: {
          token,
          ...snapshot,
          generation: user.stripeCheckoutGeneration,
          sessionId: null,
          createdAt: new Date(),
          leaseExpiresAt: new Date(Date.now() + CHECKOUT_CLAIM_LEASE_MS),
          checkoutExpiresAt: new Date(Date.now() + CHECKOUT_SESSION_LIFETIME_MS)
        }
      })
      if (updated.count !== 1) throw new CheckoutClaimChangedError()
      const next = await tx.billingCheckoutClaim.findUnique({
        where: { userId: previous.userId }
      })
      if (!next) throw new CheckoutClaimChangedError()
      return next
    })
    return { claim, owned: true }
  } catch (error) {
    if (error instanceof CheckoutClaimChangedError) return null
    throw error
  }
}

async function deletionIsPending(prisma: DatabaseClient, userId: string) {
  return Boolean(
    await prisma.accountDeletionRequest.findUnique({
      where: { userId },
      select: { userId: true }
    })
  )
}

async function abandonCheckout(prisma: DatabaseClient, claim: CheckoutClaim) {
  // A missing ID includes requests Stripe accepted whose response was lost.
  // Leave their durable identity for the deletion saga to reconcile.
  if (!claim.sessionId) return false
  if (claim.sessionId) {
    try {
      const checkout = await getStripe().checkout.sessions.retrieve(
        claim.sessionId
      )
      if (checkout.status === 'open') {
        await getStripe().checkout.sessions.expire(claim.sessionId)
      } else if (checkout.status === 'complete') {
        return false
      }
    } catch {
      // Keep the durable claim if provider state is unknown. A later retry can
      // reconcile it without risking a second subscription.
      return false
    }
  }
  await prisma.billingCheckoutClaim.deleteMany({
    where: { userId: claim.userId, token: claim.token }
  })
  return true
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return noStoreJson({ error: 'unauthorized' }, 401)
  }

  const limit = await rateLimit({
    key: rateLimitKey(request, `billing-checkout:${session.user.id}`),
    limit: 10,
    windowMs: 60 * 60 * 1000
  })
  if (limit.limited) return rateLimitedResponse(limit.resetAt)

  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return noStoreJson({ error: 'content_type_required' }, 415)
  }

  const body = await readBoundedRequestText(request, MAX_BODY_BYTES)
  if (!body.ok) {
    return noStoreJson({ error: 'request_too_large' }, 413)
  }

  let payload: unknown
  try {
    payload = JSON.parse(body.text)
  } catch {
    return noStoreJson({ error: 'invalid_json' }, 400)
  }

  const parsed = validateCheckoutPayload(payload)
  if (!parsed.success) {
    return noStoreJson({ error: parsed.error }, 400)
  }

  const prisma = createPrismaClient()
  const [user, deletionRequest] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripeSubscriptionStatus: true
      }
    }),
    prisma.accountDeletionRequest.findUnique({
      where: { userId: session.user.id },
      select: { userId: true }
    })
  ])
  if (!user) return noStoreJson({ error: 'account_not_found' }, 404)
  if (deletionRequest) {
    return noStoreJson({ error: 'account_deletion_in_progress' }, 409)
  }

  if (
    user.stripeSubscriptionId &&
    !isTerminalSubscriptionStatus(user.stripeSubscriptionStatus)
  ) {
    if (!user.stripeCustomerId) {
      return noStoreJson({ error: 'billing_state_invalid' }, 409)
    }

    try {
      const portal = await createBillingPortalSession(
        user.stripeCustomerId,
        parsed.data.locale
      )
      return noStoreJson({ url: portal.url, kind: 'portal' })
    } catch {
      return noStoreJson({ error: 'billing_provider_unavailable' }, 502)
    }
  }

  if (user.stripeCustomerId) {
    try {
      const existingSubscription = await findExistingCustomerSubscription(
        user.stripeCustomerId
      )
      if (existingSubscription) {
        const portal = await createBillingPortalSession(
          user.stripeCustomerId,
          parsed.data.locale
        )
        return noStoreJson({ url: portal.url, kind: 'portal' })
      }
    } catch {
      // Fail closed if Stripe cannot confirm that creating another
      // subscription is safe for this customer.
      return noStoreJson({ error: 'billing_provider_unavailable' }, 502)
    }
  }

  const currentPlan = isTerminalSubscriptionStatus(
    user.stripeSubscriptionStatus
  )
    ? 'free'
    : normalizeBillingPlan(user.plan)
  if (!canStartPlanCheckout(currentPlan, parsed.data.planId)) {
    return noStoreJson({ error: 'plan_change_requires_portal' }, 409)
  }

  let priceId: string
  try {
    priceId = (await loadConfiguredMonthlyPrice(parsed.data.planId)).id
  } catch {
    return noStoreJson({ error: 'billing_provider_unavailable' }, 502)
  }

  const requestedSnapshot: CheckoutSnapshot = {
    planId: parsed.data.planId,
    priceId,
    locale: parsed.data.locale,
    customerId: user.stripeCustomerId,
    customerEmail: user.email,
    ...getBillingCheckoutUrls(parsed.data.locale)
  }

  let claimed: ClaimedCheckout | null
  try {
    claimed = await createOrLoadCheckoutClaim(
      prisma,
      session.user.id,
      requestedSnapshot
    )
  } catch {
    return noStoreJson({ error: 'billing_provider_unavailable' }, 502)
  }
  if (!claimed) {
    return noStoreJson({ error: 'checkout_in_progress' }, 409)
  }

  if (!claimed.owned) {
    if (!claimed.claim.sessionId) {
      return noStoreJson({ error: 'checkout_in_progress' }, 409)
    }

    try {
      const checkout = await getStripe().checkout.sessions.retrieve(
        claimed.claim.sessionId
      )
      const ownsCheckout =
        checkout.mode === 'subscription' &&
        checkout.client_reference_id === session.user.id &&
        checkout.metadata?.userId === session.user.id &&
        checkout.metadata?.checkoutGeneration ===
          String(claimed.claim.generation)
      if (!ownsCheckout) {
        return noStoreJson({ error: 'billing_state_invalid' }, 409)
      }

      if (checkout.status === 'open' && checkout.url) {
        if (checkout.metadata?.planId !== parsed.data.planId) {
          await getStripe().checkout.sessions.expire(checkout.id)
          claimed = await rotateCheckoutClaim(
            prisma,
            claimed.claim,
            requestedSnapshot
          )
          if (!claimed) {
            return noStoreJson({ error: 'checkout_in_progress' }, 409)
          }
        } else {
          if (await deletionIsPending(prisma, session.user.id)) {
            await abandonCheckout(prisma, claimed.claim)
            return noStoreJson({ error: 'account_deletion_in_progress' }, 409)
          }
          return noStoreJson({ url: checkout.url, kind: 'checkout' })
        }
      } else if (checkout.status === 'complete') {
        return noStoreJson({ error: 'checkout_processing' }, 409)
      } else {
        claimed = await rotateCheckoutClaim(
          prisma,
          claimed.claim,
          requestedSnapshot
        )
        if (!claimed) {
          return noStoreJson({ error: 'checkout_in_progress' }, 409)
        }
      }
    } catch {
      return noStoreJson({ error: 'billing_provider_unavailable' }, 502)
    }
  }

  if (await deletionIsPending(prisma, session.user.id)) {
    await abandonCheckout(prisma, claimed.claim)
    return noStoreJson({ error: 'account_deletion_in_progress' }, 409)
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!checkoutClaimHasReplayWindow(claimed.claim.checkoutExpiresAt)) {
      return noStoreJson({ error: 'checkout_in_progress' }, 409)
    }
    if (
      !isPaidBillingPlanId(claimed.claim.planId) ||
      normalizeBillingLocale(claimed.claim.locale) !== claimed.claim.locale
    ) {
      return noStoreJson({ error: 'billing_state_invalid' }, 409)
    }

    try {
      const checkout = await createCheckoutSession({
        userId: session.user.id,
        email: claimed.claim.customerEmail,
        customerId: claimed.claim.customerId,
        planId: claimed.claim.planId,
        locale: claimed.claim.locale,
        priceId: claimed.claim.priceId,
        expiresAt: Math.floor(claimed.claim.checkoutExpiresAt.getTime() / 1000),
        successUrl: claimed.claim.successUrl,
        cancelUrl: claimed.claim.cancelUrl,
        idempotencyKey: checkoutIdempotencyKey(
          claimed.claim.userId,
          claimed.claim.generation
        ),
        checkoutGeneration: claimed.claim.generation
      })

      const persisted = await prisma.billingCheckoutClaim.updateMany({
        where: {
          userId: session.user.id,
          token: claimed.claim.token,
          generation: claimed.claim.generation,
          sessionId: null
        },
        data: { sessionId: checkout.id }
      })
      if (persisted.count !== 1) {
        try {
          const currentClaim = await prisma.billingCheckoutClaim.findUnique({
            where: { userId: claimed.claim.userId }
          })
          const resourceStillOwned =
            currentClaim &&
            (currentClaim.generation === claimed.claim.generation ||
              currentClaim.sessionId === checkout.id)
          // A newer lease can recover the same idempotent provider session.
          // Losing our token does not make that shared operation an orphan,
          // even before the newer owner has persisted its session ID.
          if (!resourceStillOwned && checkout.status === 'open') {
            await getStripe().checkout.sessions.expire(checkout.id)
          }
        } catch {
          // The response remains blocked when we cannot prove the unclaimed
          // provider resource was closed.
        }
        return noStoreJson({ error: 'checkout_in_progress' }, 409)
      }

      const persistedClaim = { ...claimed.claim, sessionId: checkout.id }
      if (checkout.status === 'complete') {
        return noStoreJson({ error: 'checkout_processing' }, 409)
      }
      if (checkout.status !== 'open' || !checkout.url) {
        claimed = await rotateCheckoutClaim(
          prisma,
          persistedClaim,
          requestedSnapshot
        )
        if (!claimed) {
          return noStoreJson({ error: 'checkout_in_progress' }, 409)
        }
        continue
      }

      if (claimed.claim.planId !== parsed.data.planId) {
        await getStripe().checkout.sessions.expire(checkout.id)
        claimed = await rotateCheckoutClaim(
          prisma,
          persistedClaim,
          requestedSnapshot
        )
        if (!claimed) {
          return noStoreJson({ error: 'checkout_in_progress' }, 409)
        }
        continue
      }

      if (await deletionIsPending(prisma, session.user.id)) {
        await abandonCheckout(prisma, persistedClaim)
        return noStoreJson({ error: 'account_deletion_in_progress' }, 409)
      }

      return noStoreJson({ url: checkout.url, kind: 'checkout' })
    } catch {
      return noStoreJson({ error: 'billing_provider_unavailable' }, 502)
    }
  }

  return noStoreJson({ error: 'checkout_in_progress' }, 409)
}
