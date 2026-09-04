import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const checkoutRoute = source('../src/app/api/stripe/checkout/route.ts')
const portalRoute = source('../src/app/api/stripe/portal/route.ts')
const billingRoute = source('../src/app/api/stripe/billing/route.ts')
const webhookRoute = source('../src/app/api/webhooks/stripe/route.ts')
const billingPage = source('../src/app/[locale]/dashboard/billing/page.tsx')
const publicPricingPage = source('../src/app/[locale]/pricing/page.tsx')
const englishMessages = source('../messages/en.json')
const romanianMessages = source('../messages/ro.json')
const prismaSchema = source('../prisma/schema.prisma')
const stripeLibrary = source('../src/lib/stripe.ts')
const checkoutClaimLibrary = source('../src/lib/billing-checkout-claim.ts')
const accountDataRoute = source('../src/app/api/user/data/route.ts')
const orderingMigration = source(
  '../../backend/alembic/versions/20260903_order_stripe_subscription_state.py'
)
const checkoutClaimMigration = source(
  '../../backend/alembic/versions/20260903_add_billing_checkout_claims.py'
)

test('checkout and portal routes authenticate, rate-limit, and bind input', () => {
  for (const route of [checkoutRoute, portalRoute]) {
    assert.match(route, /await auth\(\)/)
    assert.match(route, /await rateLimit\(/)
    assert.match(route, /readBoundedRequestText\(/)
    assert.match(route, /Cache-Control': 'private, no-store'/)
  }

  assert.match(checkoutRoute, /validateCheckoutPayload\(payload\)/)
  assert.match(checkoutRoute, /findExistingCustomerSubscription\(/)
  assert.match(checkoutRoute, /checkoutIdempotencyKey\(/)
  assert.match(checkoutRoute, /billingCheckoutClaim\.create/)
  assert.match(checkoutRoute, /stripeCheckoutGeneration: \{ increment: 1 \}/)
  assert.match(checkoutRoute, /accountDeletionRequest\.findUnique/)
  assert.match(checkoutRoute, /checkout\.sessions\.expire/)
  assert.match(checkoutRoute, /checkoutExpiresAt/)
  assert.match(checkoutRoute, /leaseExpiresAt/)
  assert.match(checkoutRoute, /customerEmail: user\.email/)
  assert.match(checkoutRoute, /successUrl: claimed\.claim\.successUrl/)
  assert.match(checkoutRoute, /expiresAt: Math\.floor\(/)
  assert.doesNotMatch(
    checkoutClaimLibrary.match(
      /function checkoutIdempotencyKey[\s\S]*?\n\}/
    )?.[0] ?? '',
    /planId|priceId|stripeSubscriptionId|stripeStateEventCreated/
  )
  assert.match(checkoutRoute, /checkoutClaimHasReplayWindow\(/)
  assert.match(checkoutRoute, /findCheckoutSessionForClaim\(claim\)/)
  assert.match(checkoutRoute, /if \(!claim\.sessionId\) return false/)
  assert.match(accountDataRoute, /checkoutClaimRecoveryState\(claim, now\)/)
  assert.match(accountDataRoute, /findCheckoutSessionForClaim\(claim\)/)
  assert.match(accountDataRoute, /checkout_reconciliation_pending/)
  assert.doesNotMatch(checkoutRoute, /payload\.priceId/)
  assert.doesNotMatch(
    checkoutRoute,
    /request\.headers\.get\('idempotency-key'\)/
  )

  assert.match(portalRoute, /validatePortalPayload\(payload\)/)
  assert.match(portalRoute, /user\.stripeCustomerId/)
  assert.match(portalRoute, /accountDeletionRequest\.findUnique/)
  assert.doesNotMatch(portalRoute, /payload\.customer/)
  assert.doesNotMatch(portalRoute, /payload\.return/)
})

test('billing state and checkout callback remain account-bound', () => {
  assert.match(billingRoute, /where: \{ id: session\.user\.id \}/)
  assert.match(billingRoute, /expectedCustomerId: user\.stripeCustomerId/)
  assert.match(
    billingRoute,
    /expectedSubscriptionId: user\.stripeSubscriptionId/
  )
  assert.match(billingRoute, /providerAvailable = false/)

  assert.match(billingPage, /verifyCheckoutSession\(/)
  assert.match(billingPage, /query\.checkout_session_id/)
  assert.doesNotMatch(billingPage, /query\.success/)
})

test('webhook uses a transactional event and invoice-credit ledger', () => {
  assert.match(webhookRoute, /constructEvent\(/)
  assert.match(webhookRoute, /readBoundedRequestText\(/)
  assert.match(webhookRoute, /prisma\.\$transaction/)
  assert.match(webhookRoute, /tx\.stripeEvent\.create/)
  assert.match(webhookRoute, /creditGrantId: creditGrantId\(event\)/)
  assert.match(webhookRoute, /`invoice:\$\{invoice\.id\}`/)
  assert.match(webhookRoute, /credits: \{ increment: PLAN_CREDITS\[planId\] \}/)
  assert.match(
    webhookRoute,
    /shouldGrantSubscriptionCredits\(invoice\.billing_reason\)/
  )
  assert.match(webhookRoute, /stripeSubscriptionId: subscription\.id/)
  assert.doesNotMatch(webhookRoute, /stripeSubscriptionId: null/)
  assert.match(webhookRoute, /subscriptionStateVersion\(/)
  assert.match(webhookRoute, /pg_advisory_xact_lock/)
  assert.match(webhookRoute, /subscriptions\.list\(/)
  assert.match(webhookRoute, /reconcileCurrentSubscription\(/)
  assert.match(webhookRoute, /chooseAuthoritativeSubscription\(/)
  assert.doesNotMatch(webhookRoute, /orderedSubscriptionStateWhere/)
  assert.match(webhookRoute, /billingCheckoutClaim\.deleteMany/)
  assert.match(
    webhookRoute,
    /await handleSubscriptionChanged\([\s\S]*event\.created/
  )

  const paidInvoiceHandler = webhookRoute.match(
    /async function handleInvoicePaid[\s\S]*?\n\}/
  )?.[0]
  assert.ok(paidInvoiceHandler)
  assert.doesNotMatch(paidInvoiceHandler, /isTerminalSubscriptionStatus/)

  const failedInvoiceHandler = webhookRoute.match(
    /async function handleInvoiceFailed[\s\S]*?\n\}/
  )?.[0]
  assert.ok(failedInvoiceHandler)
  assert.match(
    failedInvoiceHandler,
    /subscriptionId !== user\.stripeSubscriptionId/
  )
  assert.doesNotMatch(failedInvoiceHandler, /tx\.user\.update/)

  assert.match(prismaSchema, /model StripeEvent/)
  assert.match(
    prismaSchema,
    /creditGrantId\s+String\?\s+@unique\(map: "uq_stripe_events_credit_grant_id"\)/
  )
  assert.match(
    prismaSchema,
    /stripeCustomerId\s+String\?\s+@unique\(map: "uq_users_stripe_customer_id"\)/
  )
  assert.match(
    prismaSchema,
    /stripeSubscriptionId\s+String\?\s+@unique\(map: "uq_users_stripe_subscription_id"\)/
  )
  assert.match(prismaSchema, /stripeStateEventCreated\s+BigInt/)
  assert.match(prismaSchema, /stripeStateEventPriority\s+Int/)
  assert.match(prismaSchema, /stripeCheckoutGeneration\s+Int/)
  assert.match(prismaSchema, /stripeStateGeneration\s+Int/)
  assert.match(prismaSchema, /model BillingCheckoutClaim/)
  assert.match(prismaSchema, /priceId\s+String/)
  assert.match(prismaSchema, /customerEmail\s+String/)
  assert.match(prismaSchema, /successUrl\s+String/)
  assert.match(prismaSchema, /checkoutExpiresAt\s+DateTime/)
  assert.match(orderingMigration, /revision = "20260903_0005"/)
  assert.match(orderingMigration, /down_revision = "20260903_0004"/)
  assert.match(checkoutClaimMigration, /revision = "20260903_0007"/)
  assert.match(checkoutClaimMigration, /down_revision = "20260903_0006"/)
  assert.match(checkoutClaimMigration, /billing_checkout_claims/)
  assert.match(accountDataRoute, /closePendingCheckout\(/)
  assert.match(accountDataRoute, /getStripe\(\)\.customers\.del\(/)
})

test('displayed and charged plan prices are verified against Stripe', () => {
  assert.match(billingPage, /await loadBillingPlanCatalog\(\)/)
  assert.doesNotMatch(billingPage, /price: '\$(?:19|49|149)'/)
  assert.match(publicPricingPage, /await loadBillingPlanCatalog\(\)/)
  assert.match(publicPricingPage, /export const dynamic = 'force-dynamic'/)
  assert.doesNotMatch(englishMessages, /"price": "\$(?:19|49|149)"/)
  assert.doesNotMatch(romanianMessages, /"price": "\$(?:19|49|149)"/)
  assert.match(publicPricingPage, /INITIAL_FREE_CREDITS/)
  assert.match(stripeLibrary, /getStripe\(\)\.prices\.retrieve\(priceId\)/)
  assert.match(stripeLibrary, /price\.recurring\?\.interval !== 'month'/)
  assert.match(stripeLibrary, /price\.recurring\.interval_count !== 1/)
  assert.match(stripeLibrary, /expires_at: expiresAt/)
  assert.doesNotMatch(
    stripeLibrary.match(
      /export async function createCheckoutSession[\s\S]*?\n\}/
    )?.[0] ?? '',
    /Date\.now\(\)/
  )
})
