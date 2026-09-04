import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

const route = source('../src/app/api/user/data/route.ts')
const schema = source('../prisma/schema.prisma')
const migration = source(
  '../../backend/alembic/versions/20260903_add_account_deletion_requests.py'
)
const profileRoute = source('../src/app/api/user/profile/route.ts')
const passwordRoute = source('../src/app/api/user/password/route.ts')

test('persists a deletion checkpoint that cannot cascade with the user', () => {
  const model = schema.match(/model AccountDeletionRequest \{[\s\S]*?\n\}/)?.[0]
  assert.ok(model)
  assert.match(model, /userId\s+String\s+@id\s+@map\("user_id"\)\s+@db\.Uuid/)
  assert.match(model, /billingCancellationCompleted\s+Boolean/)
  assert.match(model, /stripeCustomerId\s+String\?/)
  assert.match(model, /lastFailure\s+String\?/)
  assert.doesNotMatch(model, /@relation|\bUser\b/)

  assert.match(migration, /revision = "20260903_0004"/)
  assert.match(migration, /down_revision = "20260903_0003"/)
  assert.match(migration, /"account_deletion_requests"/)
  assert.doesNotMatch(migration, /ForeignKey\("users\.id"/)
  assert.match(migration, /ck_account_deletion_requests_last_failure/)
})

test('checkpoints billing once and keeps local billing state coherent', () => {
  assert.match(route, /accountDeletionRequest\.upsert\(/)
  assert.match(route, /update: \{\}/)
  assert.match(
    route,
    /if \(!deletionRequest\.billingCancellationCompleted\) \{/
  )
  assert.match(route, /isMissingStripeResource\(error\)/)
  assert.match(route, /getStripe\(\)\.customers\.del\(/)
  assert.match(route, /closePendingCheckout\(/)
  assert.match(route, /billingCancellationCompleted: true/)
  assert.match(route, /plan: 'free'/)
  assert.match(route, /stripeSubscriptionStatus:[\s\S]*?'canceled'/)
  assert.match(route, /stripeCancelAtPeriodEnd: false/)
  assert.match(route, /stripeCurrentPeriodEnd: null/)
  assert.match(route, /checkpointIsCurrent/)
})

test('retries media cleanup and deletes account plus checkpoint atomically', () => {
  const billingBranch = route.indexOf(
    'if (!deletionRequest.billingCancellationCompleted)'
  )
  const mediaCleanup = route.indexOf(
    "backendFetch('/api/account/media'",
    billingBranch
  )
  assert.ok(billingBranch >= 0)
  assert.ok(mediaCleanup > billingBranch)
  assert.match(route, /Deliberately run this on every retry/)

  const finalizer = route.match(
    /async function finalizeAccountDeletion[\s\S]*?\n\}/
  )?.[0]
  assert.ok(finalizer)
  assert.match(finalizer, /runSerializableTransaction\(/)
  assert.match(finalizer, /transaction\.user\.deleteMany\(/)
  assert.match(finalizer, /transaction\.accountDeletionRequest\.deleteMany\(/)
  assert.match(finalizer, /billingCancellationCompleted: true/)
  assert.match(finalizer, /billingCheckpointIsCurrent/)
  assert.match(
    finalizer,
    /user\.stripeCustomerId === deletionRequest\.stripeCustomerId/
  )
  assert.match(
    finalizer,
    /user\.stripeSubscriptionId === deletionRequest\.stripeSubscriptionId/
  )
  assert.match(route, /prismaErrorCode\(error\) !== 'P2034'/)
})

test('records only fixed sanitized failure categories and never reports partial success', () => {
  for (const failure of [
    'billing_unavailable',
    'billing_cancellation_failed',
    'media_cleanup_failed',
    'database_deletion_failed'
  ]) {
    assert.match(route, new RegExp(`'${failure}'`))
    assert.match(migration, new RegExp(`'${failure}'`))
  }

  assert.match(route, /data: \{ lastFailure: failure \}/)
  assert.doesNotMatch(route, /lastFailure:\s*(?:error|String\(error\))/)
  assert.match(
    route,
    /Account media could not be removed\. Your database records were not deleted\./
  )
  assert.match(
    route,
    /database deletion did not finish\. Retry safely to complete deletion\./
  )
})

test('requires bounded input and step-up authentication before deletion', () => {
  for (const handler of [route, profileRoute, passwordRoute]) {
    assert.match(handler, /readBoundedJson\(request\)/)
    assert.match(handler, /RequestBodyTooLargeError/)
    assert.doesNotMatch(handler, /await request\.json\(\)/)
  }
  assert.match(route, /await bcrypt\.compare\(/)
  assert.match(
    route,
    /hasRecentAuthentication\(session\.user\.authenticatedAt\)/
  )
  assert.match(route, /code: 'reauthentication_required'/)
  assert.ok(
    route.indexOf('await bcrypt.compare(') <
      route.indexOf('accountDeletionRequest.upsert(')
  )
})
