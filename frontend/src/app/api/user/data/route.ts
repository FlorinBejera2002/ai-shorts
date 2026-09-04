import { randomUUID } from 'node:crypto'

import { type BillingCheckoutClaim, Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'

import {
  hasRecentAuthentication,
  validateAccountDeletionPayload
} from '@/lib/account-settings'
import { backendFetch } from '@/lib/api'
import { auth } from '@/lib/auth'
import {
  isPaidBillingPlanId,
  normalizeBillingLocale,
  stripeObjectId
} from '@/lib/billing'
import {
  CHECKOUT_CLAIM_LEASE_MS,
  CHECKOUT_EXPIRY_GRACE_MS,
  checkoutClaimHasReplayWindow,
  checkoutClaimRecoveryState,
  checkoutIdempotencyKey
} from '@/lib/billing-checkout-claim'
import { createPrismaClient } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import { RequestBodyTooLargeError, readBoundedJson } from '@/lib/request-body'
import {
  createCheckoutSession,
  findCheckoutSessionForClaim,
  getStripe
} from '@/lib/stripe'

export const runtime = 'nodejs'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store'
}

const EXPORT_HEADERS = {
  ...NO_STORE_HEADERS,
  'Content-Disposition': 'attachment; filename="sneepcut-data-export.json"'
}

const DELETION_FAILURE = {
  billingUnavailable: 'billing_unavailable',
  billingCancellation: 'billing_cancellation_failed',
  mediaCleanup: 'media_cleanup_failed',
  databaseDeletion: 'database_deletion_failed'
} as const

type AccountDeletionFailure =
  (typeof DELETION_FAILURE)[keyof typeof DELETION_FAILURE]
type DatabaseClient = ReturnType<typeof createPrismaClient>

function deletedResponse() {
  return Response.json(
    { deleted: true },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}

function prismaErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null
  }
  return typeof error.code === 'string' ? error.code : null
}

function isMissingStripeResource(error: unknown): boolean {
  return prismaErrorCode(error) === 'resource_missing'
}

async function runSerializableTransaction<T>(
  prisma: DatabaseClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  let lastFailure: unknown = new Error('Transaction could not be completed')
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      })
    } catch (error) {
      lastFailure = error
      if (prismaErrorCode(error) !== 'P2034' || attempt === 2) throw error
    }
  }
  throw lastFailure
}

async function recordDeletionFailure(
  prisma: DatabaseClient,
  userId: string,
  failure: AccountDeletionFailure
) {
  try {
    // Never persist provider/storage error details: they may contain secrets or
    // customer data. A small, fixed vocabulary is sufficient for operations.
    await prisma.accountDeletionRequest.updateMany({
      where: { userId },
      data: { lastFailure: failure }
    })
  } catch {
    // The original operation error remains authoritative. A database outage can
    // also prevent recording its own diagnostic marker.
  }
}

async function accountDeletionFinished(prisma: DatabaseClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true }
  })
  if (user) return false

  const deletionRequest = await prisma.accountDeletionRequest.findUnique({
    where: { userId },
    select: { userId: true }
  })
  return deletionRequest === null
}

async function closePendingCheckout(
  prisma: DatabaseClient,
  userId: string
): Promise<
  | { status: 'closed' }
  | { status: 'pending'; retryAfterSeconds: number }
  | {
      status: 'complete'
      customerId: string | null
      subscriptionId: string | null
      claimToken: string
      generation: number
      sessionId: string
    }
> {
  let claim = await prisma.billingCheckoutClaim.findUnique({
    where: { userId }
  })
  if (!claim) return { status: 'closed' }

  let checkout: Stripe.Checkout.Session
  if (!claim.sessionId) {
    const now = new Date()
    const recoveryState = checkoutClaimRecoveryState(claim, now)
    if (recoveryState === 'leased') {
      return {
        status: 'pending',
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((claim.leaseExpiresAt.getTime() - now.getTime()) / 1000)
        )
      }
    }
    const token = randomUUID()
    const leaseExpiresAt = new Date(now.getTime() + CHECKOUT_CLAIM_LEASE_MS)
    const acquired = await prisma.billingCheckoutClaim.updateMany({
      where: {
        userId,
        token: claim.token,
        generation: claim.generation,
        sessionId: null,
        leaseExpiresAt: { lte: now }
      },
      data: { token, leaseExpiresAt }
    })
    if (acquired.count !== 1) {
      return { status: 'pending', retryAfterSeconds: 2 }
    }
    claim = { ...claim, token, leaseExpiresAt }

    if (
      recoveryState === 'replayable' &&
      checkoutClaimHasReplayWindow(claim.checkoutExpiresAt)
    ) {
      if (
        !isPaidBillingPlanId(claim.planId) ||
        normalizeBillingLocale(claim.locale) !== claim.locale
      ) {
        throw new Error('Pending checkout snapshot is invalid')
      }
      // Replay exactly the durable operation. If the original response was
      // lost, Stripe returns the original session; if it never received the
      // request, this creates a session that is immediately closed below.
      checkout = await createCheckoutSession({
        userId: claim.userId,
        email: claim.customerEmail,
        customerId: claim.customerId,
        planId: claim.planId,
        locale: normalizeBillingLocale(claim.locale),
        priceId: claim.priceId,
        expiresAt: Math.floor(claim.checkoutExpiresAt.getTime() / 1000),
        successUrl: claim.successUrl,
        cancelUrl: claim.cancelUrl,
        idempotencyKey: checkoutIdempotencyKey(claim.userId, claim.generation),
        checkoutGeneration: claim.generation
      })
    } else {
      const recovered = await findCheckoutSessionForClaim(claim)
      if (!recovered) {
        if (recoveryState === 'expired') {
          // Never infer absence from an expired timestamp alone. A complete,
          // status-unfiltered provider lookup must also prove that no session
          // (including one completed before expiry) exists for this identity.
          const released = await prisma.billingCheckoutClaim.deleteMany({
            where: {
              userId,
              token: claim.token,
              generation: claim.generation,
              sessionId: null
            }
          })
          return released.count === 1
            ? { status: 'closed' }
            : { status: 'pending', retryAfterSeconds: 2 }
        }
        return {
          status: 'pending',
          retryAfterSeconds: Math.max(
            1,
            Math.ceil(
              (claim.checkoutExpiresAt.getTime() +
                CHECKOUT_EXPIRY_GRACE_MS -
                Date.now()) /
                1000
            )
          )
        }
      }
      checkout = recovered
    }
    if (!checkoutMatchesClaim(checkout, claim)) {
      throw new Error('Pending checkout ownership could not be verified')
    }
    const persisted = await prisma.billingCheckoutClaim.updateMany({
      where: {
        userId,
        token: claim.token,
        generation: claim.generation,
        sessionId: null
      },
      data: { sessionId: checkout.id }
    })
    if (persisted.count !== 1) {
      if (checkout.status === 'open') {
        await getStripe().checkout.sessions.expire(checkout.id)
      }
      // Do not claim that all checkouts are closed if another worker changed
      // the durable claim while this provider request was in flight.
      return { status: 'pending', retryAfterSeconds: 2 }
    }
    claim = { ...claim, sessionId: checkout.id }
  } else {
    checkout = await getStripe().checkout.sessions.retrieve(claim.sessionId)
  }

  if (!checkoutMatchesClaim(checkout, claim)) {
    throw new Error('Pending checkout ownership could not be verified')
  }

  if (checkout.status === 'complete') {
    return {
      status: 'complete',
      customerId: stripeObjectId(checkout.customer),
      subscriptionId: stripeObjectId(checkout.subscription),
      claimToken: claim.token,
      generation: claim.generation,
      sessionId: checkout.id
    }
  }
  if (checkout.status === 'open') {
    await getStripe().checkout.sessions.expire(checkout.id)
  }
  const released = await prisma.billingCheckoutClaim.deleteMany({
    where: {
      userId,
      token: claim.token,
      generation: claim.generation,
      sessionId: claim.sessionId
    }
  })
  return released.count === 1
    ? { status: 'closed' }
    : { status: 'pending', retryAfterSeconds: 2 }
}

function checkoutMatchesClaim(
  checkout: Stripe.Checkout.Session,
  claim: BillingCheckoutClaim
) {
  const ownsCheckout =
    checkout.mode === 'subscription' &&
    checkout.client_reference_id === claim.userId &&
    checkout.metadata?.userId === claim.userId &&
    checkout.metadata?.checkoutGeneration === String(claim.generation) &&
    checkout.metadata?.planId === claim.planId &&
    checkout.metadata?.priceId === claim.priceId &&
    (!claim.customerId ||
      stripeObjectId(checkout.customer) === claim.customerId)
  return ownsCheckout
}

async function adoptCompletedCheckout(
  prisma: DatabaseClient,
  userId: string,
  customerId: string,
  subscriptionId: string
) {
  return runSerializableTransaction(prisma, async (transaction) => {
    const checkpoint = await transaction.accountDeletionRequest.findUnique({
      where: { userId }
    })
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: {
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripeSubscriptionStatus: true,
        stripeCancelAtPeriodEnd: true,
        stripeCurrentPeriodEnd: true
      }
    })
    if (!checkpoint || !user) {
      throw new Error('Account deletion state changed concurrently')
    }

    if (checkpoint.billingCancellationCompleted) {
      if (checkpoint.stripeCustomerId === customerId) return checkpoint

      const currentMatchesCleanedCheckpoint =
        user.plan === 'free' &&
        user.stripeCustomerId === checkpoint.stripeCustomerId &&
        user.stripeSubscriptionId === checkpoint.stripeSubscriptionId &&
        user.stripeSubscriptionStatus ===
          (checkpoint.stripeSubscriptionId ? 'canceled' : null) &&
        !user.stripeCancelAtPeriodEnd &&
        user.stripeCurrentPeriodEnd === null
      const currentMatchesRecoveredCheckout =
        user.stripeCustomerId === customerId &&
        user.stripeSubscriptionId === subscriptionId
      if (
        !currentMatchesCleanedCheckpoint &&
        !currentMatchesRecoveredCheckout
      ) {
        throw new Error('Billing changed during checkout recovery')
      }

      // The earlier provider customer was already deleted. A newly recovered
      // completed checkout must reopen the durable checkpoint before cleanup
      // can proceed, even when its webhook was suppressed by the marker.
      await transaction.user.update({
        where: { id: userId },
        data: {
          plan: 'free',
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripeSubscriptionStatus: 'incomplete',
          stripeCancelAtPeriodEnd: false,
          stripeCurrentPeriodEnd: null
        }
      })
      return transaction.accountDeletionRequest.update({
        where: { userId },
        data: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          billingCancellationCompleted: false,
          lastFailure: null
        }
      })
    }

    if (
      (checkpoint.stripeCustomerId &&
        checkpoint.stripeCustomerId !== customerId) ||
      (!checkpoint.stripeCustomerId &&
        checkpoint.stripeSubscriptionId &&
        checkpoint.stripeSubscriptionId !== subscriptionId)
    ) {
      // Do not overwrite an earlier, not-yet-canceled provider resource.
      throw new Error('Outstanding billing resources could not be reconciled')
    }
    return transaction.accountDeletionRequest.update({
      where: { userId },
      data: {
        stripeCustomerId: checkpoint.stripeCustomerId ?? customerId,
        stripeSubscriptionId: checkpoint.stripeSubscriptionId ?? subscriptionId
      }
    })
  })
}

async function markBillingCancellationCompleted(
  prisma: DatabaseClient,
  userId: string,
  expectedBilling: {
    stripeCustomerId: string | null
    stripeSubscriptionId: string | null
  }
): Promise<'completed' | 'already-deleted'> {
  return runSerializableTransaction(prisma, async (transaction) => {
    const deletionRequest = await transaction.accountDeletionRequest.findUnique(
      {
        where: { userId },
        select: {
          billingCancellationCompleted: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true
        }
      }
    )
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true
      }
    })

    if (!deletionRequest && !user) return 'already-deleted'
    if (!deletionRequest || !user) {
      throw new Error('Account deletion state is inconsistent')
    }
    if (
      deletionRequest.stripeCustomerId !== expectedBilling.stripeCustomerId ||
      deletionRequest.stripeSubscriptionId !==
        expectedBilling.stripeSubscriptionId
    ) {
      // The caller only canceled its own provider snapshot. A concurrent
      // adoption/reopen must never be certified by that earlier operation,
      // including when the earlier snapshot contained no provider IDs.
      throw new Error('Billing checkpoint changed after provider cleanup')
    }
    if (
      deletionRequest.stripeCustomerId !== user.stripeCustomerId &&
      user.stripeCustomerId !== null
    ) {
      throw new Error('Billing state changed during account deletion')
    }
    if (
      !deletionRequest.stripeCustomerId &&
      deletionRequest.stripeSubscriptionId !== user.stripeSubscriptionId &&
      user.stripeSubscriptionId !== null
    ) {
      throw new Error('Billing state changed during account deletion')
    }

    const updatedUser = await transaction.user.updateMany({
      where: {
        id: userId,
        ...(deletionRequest.stripeCustomerId
          ? {
              OR: [
                { stripeCustomerId: deletionRequest.stripeCustomerId },
                { stripeCustomerId: null, stripeSubscriptionId: null }
              ]
            }
          : {
              stripeCustomerId: null,
              OR: [
                { stripeSubscriptionId: deletionRequest.stripeSubscriptionId },
                { stripeSubscriptionId: null }
              ]
            })
      },
      data: {
        plan: 'free',
        // Retain deleted provider identifiers as tombstones until the local
        // account is removed. No new billing work is allowed past the marker.
        stripeCustomerId: deletionRequest.stripeCustomerId,
        // Keep the canceled subscription ID as a tombstone. The webhook path
        // uses it to reject stale out-of-order subscription events.
        stripeSubscriptionId: deletionRequest.stripeSubscriptionId,
        stripeSubscriptionStatus: deletionRequest.stripeSubscriptionId
          ? 'canceled'
          : null,
        stripeCancelAtPeriodEnd: false,
        stripeCurrentPeriodEnd: null
      }
    })
    if (deletionRequest.billingCancellationCompleted) {
      if (updatedUser.count !== 1) {
        throw new Error('Billing state changed during account deletion')
      }
      return 'completed'
    }
    const updatedRequest = await transaction.accountDeletionRequest.updateMany({
      where: {
        userId,
        stripeCustomerId: expectedBilling.stripeCustomerId,
        stripeSubscriptionId: expectedBilling.stripeSubscriptionId,
        billingCancellationCompleted: false
      },
      data: {
        billingCancellationCompleted: true,
        lastFailure: null
      }
    })

    if (updatedUser.count !== 1 || updatedRequest.count !== 1) {
      throw new Error('Account deletion state changed concurrently')
    }
    return 'completed'
  })
}

async function finalizeAccountDeletion(
  prisma: DatabaseClient,
  userId: string
): Promise<'deleted' | 'already-deleted'> {
  return runSerializableTransaction(prisma, async (transaction) => {
    const deletionRequest = await transaction.accountDeletionRequest.findUnique(
      {
        where: { userId },
        select: {
          billingCancellationCompleted: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true
        }
      }
    )
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripeSubscriptionStatus: true,
        stripeCancelAtPeriodEnd: true,
        stripeCurrentPeriodEnd: true
      }
    })

    if (!deletionRequest && !user) return 'already-deleted'
    if (
      !deletionRequest ||
      !user ||
      !deletionRequest.billingCancellationCompleted
    ) {
      throw new Error('Account deletion prerequisites are incomplete')
    }

    const expectedSubscriptionStatus = deletionRequest.stripeSubscriptionId
      ? 'canceled'
      : null
    const billingCheckpointIsCurrent =
      user.plan === 'free' &&
      user.stripeCustomerId === deletionRequest.stripeCustomerId &&
      user.stripeSubscriptionId === deletionRequest.stripeSubscriptionId &&
      user.stripeSubscriptionStatus === expectedSubscriptionStatus &&
      !user.stripeCancelAtPeriodEnd &&
      user.stripeCurrentPeriodEnd === null
    if (!billingCheckpointIsCurrent) {
      throw new Error('Billing state changed during account deletion')
    }

    const unresolvedCheckout =
      await transaction.billingCheckoutClaim.findUnique({
        where: { userId },
        select: { userId: true }
      })
    if (unresolvedCheckout) {
      throw new Error('A billing checkout still requires reconciliation')
    }

    const deletedUser = await transaction.user.deleteMany({
      where: { id: userId }
    })
    const deletedRequest = await transaction.accountDeletionRequest.deleteMany({
      where: { userId, billingCancellationCompleted: true }
    })

    if (deletedUser.count !== 1 || deletedRequest.count !== 1) {
      // Throwing rolls back either delete if a concurrent request changed one
      // side between the reads and writes.
      throw new Error('Account deletion state changed concurrently')
    }
    return 'deleted'
  })
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json(
      { error: 'Authentication required' },
      { status: 401, headers: NO_STORE_HEADERS }
    )
  }

  const prisma = createPrismaClient()
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      provider: true,
      emailVerified: true,
      credits: true,
      plan: true,
      createdAt: true,
      updatedAt: true,
      jobs: {
        select: {
          id: true,
          sourceType: true,
          sourceUrl: true,
          sourceVideoUrl: true,
          status: true,
          progress: true,
          progressMessage: true,
          numClipsRequested: true,
          aspectRatio: true,
          language: true,
          subtitleStyle: true,
          includeBrand: true,
          userInstructions: true,
          transcriptSegments: true,
          creditsCharged: true,
          errorMessage: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'desc' }
      },
      clips: {
        select: {
          id: true,
          jobId: true,
          title: true,
          hookText: true,
          viralScore: true,
          scoreReason: true,
          startTime: true,
          endTime: true,
          duration: true,
          segments: true,
          fileUrl: true,
          thumbnailUrl: true,
          fileSize: true,
          resolution: true,
          aspectRatio: true,
          hasSubtitles: true,
          transcriptText: true,
          captionTiktok: true,
          captionInstagram: true,
          captionYoutube: true,
          suggestedHashtags: true,
          publishedTo: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      },
      scheduledPosts: {
        select: {
          id: true,
          clipId: true,
          title: true,
          caption: true,
          notes: true,
          platforms: true,
          status: true,
          scheduledAt: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { scheduledAt: 'asc' }
      },
      brandKit: {
        select: {
          logoPath: true,
          logoUrl: true,
          primaryColor: true,
          secondaryColor: true,
          fontFamily: true,
          subtitleFont: true,
          subtitleColor: true,
          subtitleBgColor: true,
          subtitleBgOpacity: true,
          subtitlePosition: true,
          watermarkPosition: true,
          watermarkOpacity: true,
          hidePlatformBadge: true,
          createdAt: true,
          updatedAt: true
        }
      },
      chatMessages: {
        select: {
          id: true,
          clipId: true,
          context: true,
          role: true,
          content: true,
          actions: true,
          createdAt: true
        },
        orderBy: { createdAt: 'asc' }
      }
    }
  })

  if (!user) {
    return Response.json(
      { error: 'User not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    )
  }

  const { chatMessages: assistantMessages, ...accountData } = user
  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
      format: 'Sneepcut GDPR data export',
      data: { ...accountData, assistantMessages }
    },
    { headers: EXPORT_HEADERS }
  )
}

export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json(
      { error: 'Authentication required' },
      { status: 401, headers: NO_STORE_HEADERS }
    )
  }

  const prisma = createPrismaClient()
  const limit = await rateLimit({
    key: rateLimitKey(request, `delete-account:${session.user.id}`),
    limit: 5,
    windowMs: 60 * 60 * 1000
  })
  if (limit.limited) return rateLimitedResponse(limit.resetAt)

  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    return Response.json(
      { error: 'Content-Type must be application/json' },
      { status: 415, headers: NO_STORE_HEADERS }
    )
  }

  let payload: unknown
  try {
    payload = await readBoundedJson(request)
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json(
        { error: 'Request body is too large' },
        { status: 413, headers: NO_STORE_HEADERS }
      )
    }
    return Response.json(
      { error: 'Request body must be valid JSON' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      passwordHash: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true
    }
  })
  if (!user) {
    if (await accountDeletionFinished(prisma, session.user.id)) {
      return deletedResponse()
    }
    return Response.json(
      { error: 'Account deletion state requires support assistance' },
      { status: 409, headers: NO_STORE_HEADERS }
    )
  }

  const validation = validateAccountDeletionPayload(
    payload,
    user.email,
    Boolean(user.passwordHash)
  )
  if (!validation.success) {
    return Response.json(
      {
        error: 'Account confirmation did not match',
        issues: validation.issues
      },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  if (user.passwordHash) {
    const passwordMatches = await bcrypt.compare(
      validation.data.currentPassword ?? '',
      user.passwordHash
    )
    if (!passwordMatches) {
      return Response.json(
        {
          error: 'Current password is incorrect',
          issues: [
            {
              field: 'currentPassword',
              message: 'Current password is incorrect'
            }
          ]
        },
        { status: 403, headers: NO_STORE_HEADERS }
      )
    }
  } else if (!hasRecentAuthentication(session.user.authenticatedAt)) {
    return Response.json(
      {
        error: 'Sign in with your provider again before deleting your account',
        code: 'reauthentication_required'
      },
      { status: 403, headers: NO_STORE_HEADERS }
    )
  }

  let deletionRequest
  try {
    deletionRequest = await prisma.accountDeletionRequest.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        stripeCustomerId: user.stripeCustomerId,
        stripeSubscriptionId: user.stripeSubscriptionId
      },
      // Preserve the original subscription snapshot and completed steps on
      // retries. This is the durable checkpoint for the saga.
      update: {}
    })
  } catch {
    return Response.json(
      {
        error:
          'Account deletion could not be started. No account data was deleted.'
      },
      { status: 503, headers: NO_STORE_HEADERS }
    )
  }

  // A retry can observe a subscription that completed while the original
  // deletion request was being established. Adopt it only while no earlier
  // subscription snapshot or completed cancellation checkpoint exists.
  const canAdoptCurrentBilling =
    !deletionRequest.billingCancellationCompleted &&
    ((deletionRequest.stripeCustomerId === null && user.stripeCustomerId) ||
      (deletionRequest.stripeSubscriptionId === null &&
        user.stripeSubscriptionId))
  if (canAdoptCurrentBilling) {
    await prisma.accountDeletionRequest.updateMany({
      where: {
        userId: session.user.id,
        stripeCustomerId: deletionRequest.stripeCustomerId,
        stripeSubscriptionId: deletionRequest.stripeSubscriptionId,
        billingCancellationCompleted: false
      },
      data: {
        ...(deletionRequest.stripeCustomerId === null && user.stripeCustomerId
          ? { stripeCustomerId: user.stripeCustomerId }
          : {}),
        ...(deletionRequest.stripeSubscriptionId === null &&
        user.stripeSubscriptionId
          ? { stripeSubscriptionId: user.stripeSubscriptionId }
          : {})
      }
    })
    deletionRequest = await prisma.accountDeletionRequest.findUniqueOrThrow({
      where: { userId: session.user.id }
    })
  }

  let reconciledCheckoutClaim: {
    token: string
    generation: number
    sessionId: string
  } | null = null
  try {
    const pendingCheckout = await closePendingCheckout(prisma, session.user.id)
    if (pendingCheckout.status === 'pending') {
      return Response.json(
        {
          error:
            'A billing checkout is still being reconciled. Retry account deletion after the indicated waiting period; no account data was deleted.',
          code: 'checkout_reconciliation_pending',
          retryAfterSeconds: pendingCheckout.retryAfterSeconds
        },
        {
          status: 409,
          headers: {
            ...NO_STORE_HEADERS,
            'Retry-After': String(pendingCheckout.retryAfterSeconds)
          }
        }
      )
    }
    if (pendingCheckout.status === 'complete') {
      if (!pendingCheckout.customerId || !pendingCheckout.subscriptionId) {
        return Response.json(
          {
            error:
              'A completed billing checkout could not be reconciled safely. Retry after billing finishes updating.'
          },
          { status: 409, headers: NO_STORE_HEADERS }
        )
      }
      deletionRequest = await adoptCompletedCheckout(
        prisma,
        session.user.id,
        pendingCheckout.customerId,
        pendingCheckout.subscriptionId
      )
      reconciledCheckoutClaim = {
        token: pendingCheckout.claimToken,
        generation: pendingCheckout.generation,
        sessionId: pendingCheckout.sessionId
      }
    }
  } catch {
    await recordDeletionFailure(
      prisma,
      session.user.id,
      DELETION_FAILURE.billingUnavailable
    )
    return Response.json(
      {
        error:
          'An outstanding billing checkout could not be closed. Your account was not deleted.'
      },
      { status: 502, headers: NO_STORE_HEADERS }
    )
  }

  if (deletionRequest.billingCancellationCompleted) {
    try {
      await markBillingCancellationCompleted(prisma, session.user.id, {
        stripeCustomerId: deletionRequest.stripeCustomerId,
        stripeSubscriptionId: deletionRequest.stripeSubscriptionId
      })
    } catch {
      // A different provider customer is handled below by reopening the
      // durable cleanup checkpoint. Other state mismatches fail closed.
    }
    const currentBillingState = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        stripeSubscriptionStatus: true,
        stripeCancelAtPeriodEnd: true,
        stripeCurrentPeriodEnd: true
      }
    })
    if (!currentBillingState) {
      if (await accountDeletionFinished(prisma, session.user.id)) {
        return deletedResponse()
      }
      return Response.json(
        { error: 'Account deletion state requires support assistance' },
        { status: 409, headers: NO_STORE_HEADERS }
      )
    }

    const expectedSubscriptionStatus =
      deletionRequest.stripeSubscriptionId === null ? null : 'canceled'
    const checkpointIsCurrent =
      currentBillingState.plan === 'free' &&
      currentBillingState.stripeCustomerId ===
        deletionRequest.stripeCustomerId &&
      currentBillingState.stripeSubscriptionId ===
        deletionRequest.stripeSubscriptionId &&
      currentBillingState.stripeSubscriptionStatus ===
        expectedSubscriptionStatus &&
      !currentBillingState.stripeCancelAtPeriodEnd &&
      currentBillingState.stripeCurrentPeriodEnd === null

    if (!checkpointIsCurrent) {
      const hasNewProviderBilling =
        (currentBillingState.stripeCustomerId !== null &&
          currentBillingState.stripeCustomerId !==
            deletionRequest.stripeCustomerId) ||
        (currentBillingState.stripeCustomerId === null &&
          deletionRequest.stripeCustomerId === null &&
          currentBillingState.stripeSubscriptionId !== null &&
          currentBillingState.stripeSubscriptionId !==
            deletionRequest.stripeSubscriptionId)
      if (hasNewProviderBilling) {
        const reopened = await prisma.accountDeletionRequest.updateMany({
          where: {
            userId: session.user.id,
            stripeCustomerId: deletionRequest.stripeCustomerId,
            stripeSubscriptionId: deletionRequest.stripeSubscriptionId,
            billingCancellationCompleted: true
          },
          data: {
            stripeCustomerId: currentBillingState.stripeCustomerId,
            stripeSubscriptionId: currentBillingState.stripeSubscriptionId,
            billingCancellationCompleted: false,
            lastFailure: null
          }
        })
        if (reopened.count === 1) {
          deletionRequest =
            await prisma.accountDeletionRequest.findUniqueOrThrow({
              where: { userId: session.user.id }
            })
        } else {
          return Response.json(
            { error: 'Billing changed concurrently; retry account deletion.' },
            { status: 409, headers: NO_STORE_HEADERS }
          )
        }
      } else {
        await recordDeletionFailure(
          prisma,
          session.user.id,
          DELETION_FAILURE.billingCancellation
        )
        return Response.json(
          {
            error:
              'Billing changed while account deletion was pending. Your account was not deleted.'
          },
          { status: 409, headers: NO_STORE_HEADERS }
        )
      }
    }
  }

  if (!deletionRequest.billingCancellationCompleted) {
    if (
      (deletionRequest.stripeCustomerId ||
        deletionRequest.stripeSubscriptionId) &&
      !process.env.STRIPE_SECRET_KEY
    ) {
      await recordDeletionFailure(
        prisma,
        session.user.id,
        DELETION_FAILURE.billingUnavailable
      )
      return Response.json(
        {
          error:
            'Billing is temporarily unavailable. Your account was not deleted so the subscription cannot be left active.'
        },
        { status: 503, headers: NO_STORE_HEADERS }
      )
    }

    if (deletionRequest.stripeCustomerId) {
      try {
        // Customer deletion is the provider-level terminal operation: Stripe
        // cancels every active subscription for that customer and prevents an
        // unlinked or delayed-webhook subscription from surviving the account.
        await getStripe().customers.del(deletionRequest.stripeCustomerId)
      } catch (error) {
        if (!isMissingStripeResource(error)) {
          await recordDeletionFailure(
            prisma,
            session.user.id,
            DELETION_FAILURE.billingCancellation
          )
          return Response.json(
            {
              error:
                'The billing customer could not be deleted. Your account was not deleted.'
            },
            { status: 502, headers: NO_STORE_HEADERS }
          )
        }
      }
    } else if (deletionRequest.stripeSubscriptionId) {
      // Legacy fallback for an inconsistent record that has a subscription but
      // no customer identifier.
      try {
        await getStripe().subscriptions.cancel(
          deletionRequest.stripeSubscriptionId
        )
      } catch (error) {
        if (!isMissingStripeResource(error)) {
          await recordDeletionFailure(
            prisma,
            session.user.id,
            DELETION_FAILURE.billingCancellation
          )
          return Response.json(
            {
              error:
                'The active subscription could not be canceled. Your account was not deleted.'
            },
            { status: 502, headers: NO_STORE_HEADERS }
          )
        }
      }
    }

    try {
      const billingResult = await markBillingCancellationCompleted(
        prisma,
        session.user.id,
        {
          stripeCustomerId: deletionRequest.stripeCustomerId,
          stripeSubscriptionId: deletionRequest.stripeSubscriptionId
        }
      )
      if (billingResult === 'already-deleted') return deletedResponse()
    } catch {
      if (await accountDeletionFinished(prisma, session.user.id)) {
        return deletedResponse()
      }
      await recordDeletionFailure(
        prisma,
        session.user.id,
        DELETION_FAILURE.databaseDeletion
      )
      return Response.json(
        {
          error:
            'Billing was canceled, but account deletion could not continue. Retry safely to finish deleting the account.'
        },
        { status: 503, headers: NO_STORE_HEADERS }
      )
    }
  }

  if (reconciledCheckoutClaim) {
    try {
      await prisma.billingCheckoutClaim.deleteMany({
        where: { userId: session.user.id, ...reconciledCheckoutClaim }
      })
    } catch {
      await recordDeletionFailure(
        prisma,
        session.user.id,
        DELETION_FAILURE.databaseDeletion
      )
      return Response.json(
        {
          error:
            'Billing cleanup could not be checkpointed. Retry account deletion.'
        },
        { status: 503, headers: NO_STORE_HEADERS }
      )
    }
  }

  let mediaResponse: Response
  try {
    // Deliberately run this on every retry. The backend cleanup is idempotent,
    // so a partial storage failure never gets checkpointed as complete.
    mediaResponse = await backendFetch('/api/account/media', {
      method: 'DELETE'
    })
  } catch {
    if (await accountDeletionFinished(prisma, session.user.id)) {
      return deletedResponse()
    }
    await recordDeletionFailure(
      prisma,
      session.user.id,
      DELETION_FAILURE.mediaCleanup
    )
    return Response.json(
      {
        error:
          'Account media could not be removed. Your database records were not deleted.'
      },
      { status: 502, headers: NO_STORE_HEADERS }
    )
  }
  if (!mediaResponse.ok) {
    if (await accountDeletionFinished(prisma, session.user.id)) {
      return deletedResponse()
    }
    await recordDeletionFailure(
      prisma,
      session.user.id,
      DELETION_FAILURE.mediaCleanup
    )
    return Response.json(
      {
        error:
          'Account media could not be removed. Your database records were not deleted.'
      },
      { status: 502, headers: NO_STORE_HEADERS }
    )
  }

  try {
    await finalizeAccountDeletion(prisma, session.user.id)
  } catch {
    if (await accountDeletionFinished(prisma, session.user.id)) {
      return deletedResponse()
    }
    await recordDeletionFailure(
      prisma,
      session.user.id,
      DELETION_FAILURE.databaseDeletion
    )
    return Response.json(
      {
        error:
          'Account media was removed, but database deletion did not finish. Retry safely to complete deletion.'
      },
      { status: 503, headers: NO_STORE_HEADERS }
    )
  }

  return deletedResponse()
}
