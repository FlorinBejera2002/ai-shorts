import { createHash } from 'node:crypto'

export const CHECKOUT_CLAIM_LEASE_MS = 2 * 60 * 1000
export const CHECKOUT_SESSION_LIFETIME_MS = 2 * 60 * 60 * 1000
export const CHECKOUT_REPLAY_MIN_REMAINING_MS = 35 * 60 * 1000
export const CHECKOUT_EXPIRY_GRACE_MS = 2 * 60 * 1000

export type CheckoutClaimRecoveryState =
  | 'leased'
  | 'replayable'
  | 'awaiting-expiry'
  | 'expired'

type CheckoutClaimTiming = {
  leaseExpiresAt: Date
  checkoutExpiresAt: Date
}

/**
 * One generation is one provider operation. Every retry must therefore use
 * the same key even if the user's locally cached billing state changes while
 * the provider response is unknown.
 */
export function checkoutIdempotencyKey(userId: string, generation: number) {
  return createHash('sha256')
    .update(`sneepcut-checkout-v3\0${userId}\0${generation}`)
    .digest('hex')
}

/**
 * Classify an unpersisted provider request without guessing whether Stripe
 * received it. A replay is allowed only with enough time left to satisfy
 * Stripe's 30-minute minimum Checkout expiry (plus network margin). Once that
 * window closes, callers must look up the provider operation. Even an expired
 * deadline is not permission to release the claim: the session may have
 * completed before that deadline.
 */
export function checkoutClaimRecoveryState(
  claim: CheckoutClaimTiming,
  now = new Date()
): CheckoutClaimRecoveryState {
  const nowMs = now.getTime()
  if (claim.leaseExpiresAt.getTime() > nowMs) return 'leased'

  if (nowMs >= claim.checkoutExpiresAt.getTime() + CHECKOUT_EXPIRY_GRACE_MS) {
    return 'expired'
  }

  if (checkoutClaimHasReplayWindow(claim.checkoutExpiresAt, now)) {
    return 'replayable'
  }

  return 'awaiting-expiry'
}

export function checkoutClaimHasReplayWindow(
  checkoutExpiresAt: Date,
  now = new Date()
) {
  return (
    checkoutExpiresAt.getTime() - now.getTime() >=
    CHECKOUT_REPLAY_MIN_REMAINING_MS
  )
}
