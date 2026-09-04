import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import type {
  BillingProviderState,
  BillingSubscription,
  CheckoutVerification
} from '@/lib/billing'
import { normalizeBillingPlan } from '@/lib/billing'
import { createPrismaClient } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import { loadBillingProviderState, verifyCheckoutSession } from '@/lib/stripe'

export const runtime = 'nodejs'

function noStoreJson(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' }
  })
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return noStoreJson({ error: 'unauthorized' }, 401)
  }

  const limit = await rateLimit({
    key: rateLimitKey(request, `billing-state:${session.user.id}`),
    limit: 120,
    windowMs: 60 * 60 * 1000
  })
  if (limit.limited) return rateLimitedResponse(limit.resetAt)

  const prisma = createPrismaClient()
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      credits: true,
      plan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      stripeSubscriptionStatus: true,
      stripeCurrentPeriodEnd: true,
      stripeCancelAtPeriodEnd: true
    }
  })
  if (!user) return noStoreJson({ error: 'account_not_found' }, 404)

  const persistedSubscription: BillingSubscription | null =
    user.stripeSubscriptionId
      ? {
          status: user.stripeSubscriptionStatus ?? 'unknown',
          cancelAtPeriodEnd: user.stripeCancelAtPeriodEnd,
          currentPeriodEnd: user.stripeCurrentPeriodEnd?.toISOString() ?? null
        }
      : null

  let providerState: BillingProviderState | null = null
  let providerAvailable = true
  if (user.stripeCustomerId) {
    try {
      providerState = await loadBillingProviderState({
        customerId: user.stripeCustomerId,
        subscriptionId: user.stripeSubscriptionId
      })
    } catch {
      providerAvailable = false
    }
  } else if (user.stripeSubscriptionId) {
    providerAvailable = false
  }

  const checkoutSessionId = new URL(request.url).searchParams.get(
    'checkout_session_id'
  )
  let checkoutVerification:
    | CheckoutVerification
    | { status: 'unavailable' }
    | null = null
  if (checkoutSessionId) {
    try {
      checkoutVerification = await verifyCheckoutSession({
        checkoutSessionId,
        userId: session.user.id,
        expectedCustomerId: user.stripeCustomerId,
        expectedSubscriptionId: user.stripeSubscriptionId
      })
    } catch {
      checkoutVerification = { status: 'unavailable' }
    }
  }

  return noStoreJson({
    account: {
      credits: user.credits,
      plan: normalizeBillingPlan(user.plan),
      hasBillingProfile: Boolean(user.stripeCustomerId)
    },
    subscription: providerState?.subscription ?? persistedSubscription,
    invoices: providerState?.invoices ?? [],
    providerAvailable,
    checkoutVerification
  })
}
