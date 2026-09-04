import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function loadSourceModule(relativePath, mocks = {}, internalExports = []) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: relativePath,
    reportDiagnostics: true
  })
  assert.deepEqual(
    (transpiled.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
    ),
    []
  )
  const module = { exports: {} }
  runInNewContext(
    `${transpiled.outputText}\nObject.assign(exports, {${internalExports.join(',')}});`,
    {
      exports: module.exports,
      module,
      require: (id) =>
        Object.hasOwn(mocks, id)
          ? mocks[id]
          : id.startsWith('node:')
            ? require(id)
            : {},
      Date,
      TextDecoder,
      TextEncoder,
      process: { env: { STRIPE_SECRET_KEY: 'sk_test_recovery' } }
    }
  )
  return module.exports
}

const timing = loadSourceModule('../src/lib/billing-checkout-claim.ts')
const billing = loadSourceModule('../src/lib/billing.ts')
const USER_ID = 'f892d8d4-b664-4792-a154-68628f08f23d'

function makeClaim(overrides = {}) {
  const now = Date.now()
  return {
    userId: USER_ID,
    token: 'original-token',
    planId: 'creator',
    priceId: 'price_creator_snapshot',
    locale: 'ro',
    customerId: null,
    customerEmail: 'snapshot@example.test',
    successUrl:
      'https://app.example.test/ro/billing?session={CHECKOUT_SESSION_ID}',
    cancelUrl: 'https://app.example.test/ro/billing?canceled=true',
    generation: 7,
    sessionId: null,
    leaseExpiresAt: new Date(now - 60_000),
    checkoutExpiresAt: new Date(now + timing.CHECKOUT_SESSION_LIFETIME_MS),
    createdAt: new Date(now - 3 * 60_000),
    updatedAt: new Date(now - 3 * 60_000),
    ...overrides
  }
}

function providerSession(claim, overrides = {}) {
  return {
    id: 'cs_test_recovered',
    mode: 'subscription',
    client_reference_id: claim.userId,
    metadata: {
      userId: claim.userId,
      planId: claim.planId,
      priceId: claim.priceId,
      checkoutGeneration: String(claim.generation)
    },
    status: 'open',
    customer: claim.customerId,
    subscription: null,
    ...overrides
  }
}

function claimStore(initial, events) {
  let row = structuredClone(initial)
  function matches(where) {
    if (!row) return false
    return Object.entries(where).every(([key, value]) => {
      if (key === 'leaseExpiresAt') {
        return row.leaseExpiresAt.getTime() <= value.lte.getTime()
      }
      return row[key] === value
    })
  }
  return {
    get row() {
      return row
    },
    api: {
      findUnique: async () => (row ? { ...row } : null),
      updateMany: async ({ where, data }) => {
        if (!matches(where)) return { count: 0 }
        events.push(data.sessionId ? 'persist-session' : 'acquire-lease')
        row = { ...row, ...data }
        return { count: 1 }
      },
      deleteMany: async ({ where }) => {
        if (!matches(where)) return { count: 0 }
        events.push('release-claim')
        row = null
        return { count: 1 }
      }
    }
  }
}

function deletionHarness(claim, options = {}) {
  const events = []
  const store = claimStore(claim, events)
  let createParameters
  const stripe = {
    createCheckoutSession: async (parameters) => {
      events.push('create-or-replay')
      createParameters = parameters
      if (options.createError) throw options.createError
      return options.session ?? providerSession(claim)
    },
    findCheckoutSessionForClaim: async () => {
      events.push('lookup-all-statuses')
      if (options.lookupError) throw options.lookupError
      return options.lookupSession ?? null
    },
    getStripe: () => ({
      checkout: {
        sessions: {
          retrieve: async () => {
            events.push('retrieve-session')
            return options.session ?? providerSession(claim)
          },
          expire: async () => events.push('expire-session')
        }
      }
    })
  }
  const route = loadSourceModule(
    '../src/app/api/user/data/route.ts',
    {
      '@/lib/billing': billing,
      '@/lib/billing-checkout-claim': timing,
      '@/lib/stripe': stripe
    },
    ['closePendingCheckout']
  )
  return {
    run: () =>
      route.closePendingCheckout({ billingCheckoutClaim: store.api }, USER_ID),
    store,
    events,
    get createParameters() {
      return createParameters
    }
  }
}

function checkoutHarness(claim, lookupSession = null, lookupError = null) {
  const events = []
  const store = claimStore(claim, events)
  class UniqueConstraintError extends Error {
    code = 'P2002'
  }
  let transactions = 0
  const prisma = {
    billingCheckoutClaim: store.api,
    $transaction: async (operation) => {
      if (transactions++ === 0) throw new UniqueConstraintError()
      return operation({
        user: {
          update: async () => ({
            stripeCheckoutGeneration: claim.generation + 1
          })
        },
        billingCheckoutClaim: store.api
      })
    }
  }
  const route = loadSourceModule(
    '../src/app/api/stripe/checkout/route.ts',
    {
      '@prisma/client': {
        Prisma: { PrismaClientKnownRequestError: UniqueConstraintError }
      },
      '@/lib/billing': billing,
      '@/lib/billing-checkout-claim': timing,
      '@/lib/stripe': {
        findCheckoutSessionForClaim: async () => {
          events.push('lookup-all-statuses')
          if (lookupError) throw lookupError
          return lookupSession
        }
      }
    },
    ['createOrLoadCheckoutClaim', 'abandonCheckout']
  )
  return {
    run: () =>
      route.createOrLoadCheckoutClaim(prisma, claim.userId, {
        planId: 'pro',
        priceId: 'price_new_request',
        locale: 'en',
        customerId: claim.customerId,
        customerEmail: 'new-request@example.test',
        successUrl: 'https://new.example.test/success',
        cancelUrl: 'https://new.example.test/cancel'
      }),
    abandon: () => route.abandonCheckout(prisma, claim),
    store,
    events
  }
}

test('claim identity is stable and recovery obeys the Stripe expiry window', () => {
  assert.equal(
    timing.checkoutIdempotencyKey(USER_ID, 7),
    timing.checkoutIdempotencyKey(USER_ID, 7)
  )
  assert.notEqual(
    timing.checkoutIdempotencyKey(USER_ID, 7),
    timing.checkoutIdempotencyKey(USER_ID, 8)
  )
  assert.match(timing.checkoutIdempotencyKey(USER_ID, 7), /^[a-f0-9]{64}$/)

  const now = new Date('2026-09-03T12:00:00Z')
  const initial = {
    leaseExpiresAt: new Date(now.getTime() + timing.CHECKOUT_CLAIM_LEASE_MS),
    checkoutExpiresAt: new Date(
      now.getTime() + timing.CHECKOUT_SESSION_LIFETIME_MS
    )
  }
  assert.equal(timing.checkoutClaimRecoveryState(initial, now), 'leased')
  const afterCrash = new Date(initial.leaseExpiresAt.getTime() + 1)
  assert.equal(
    timing.checkoutClaimRecoveryState(initial, afterCrash),
    'replayable'
  )
  assert.ok(
    initial.checkoutExpiresAt.getTime() - afterCrash.getTime() > 30 * 60_000
  )
  assert.ok(timing.CHECKOUT_SESSION_LIFETIME_MS < 24 * 60 * 60_000)

  const cutoff = new Date(
    initial.checkoutExpiresAt.getTime() -
      timing.CHECKOUT_REPLAY_MIN_REMAINING_MS
  )
  assert.equal(
    timing.checkoutClaimHasReplayWindow(initial.checkoutExpiresAt, cutoff),
    true
  )
  assert.equal(
    timing.checkoutClaimHasReplayWindow(
      initial.checkoutExpiresAt,
      new Date(cutoff.getTime() + 1)
    ),
    false
  )
  assert.equal(
    timing.checkoutClaimRecoveryState(initial, new Date(cutoff.getTime() + 1)),
    'awaiting-expiry'
  )
  assert.equal(
    timing.checkoutClaimRecoveryState(
      initial,
      new Date(
        initial.checkoutExpiresAt.getTime() + timing.CHECKOUT_EXPIRY_GRACE_MS
      )
    ),
    'expired'
  )
})

test('deletion never releases an unknown session while its owner lease is active', async () => {
  const harness = deletionHarness(
    makeClaim({ leaseExpiresAt: new Date(Date.now() + 60_000) })
  )
  const result = await harness.run()
  assert.equal(result.status, 'pending')
  assert.ok(result.retryAfterSeconds > 0)
  assert.ok(harness.store.row)
  assert.deepEqual(harness.events, [])
})

test('deletion recovers a lost response using the exact durable request then expires it', async () => {
  const claim = makeClaim()
  const harness = deletionHarness(claim)
  assert.equal((await harness.run()).status, 'closed')
  assert.deepEqual(harness.events, [
    'acquire-lease',
    'create-or-replay',
    'persist-session',
    'expire-session',
    'release-claim'
  ])
  assert.equal(harness.createParameters.email, claim.customerEmail)
  assert.equal(harness.createParameters.priceId, claim.priceId)
  assert.equal(harness.createParameters.successUrl, claim.successUrl)
  assert.equal(harness.createParameters.cancelUrl, claim.cancelUrl)
  assert.equal(
    harness.createParameters.expiresAt,
    Math.floor(claim.checkoutExpiresAt.getTime() / 1000)
  )
  assert.equal(
    harness.createParameters.idempotencyKey,
    timing.checkoutIdempotencyKey(claim.userId, claim.generation)
  )
  assert.equal(harness.store.row, null)
})

test('a repeated provider timeout retains the claim and its immutable snapshot', async () => {
  const claim = makeClaim()
  const harness = deletionHarness(claim, { createError: new Error('timeout') })
  await assert.rejects(harness.run(), /timeout/)
  assert.ok(harness.store.row)
  assert.equal(harness.store.row.sessionId, null)
  assert.equal(harness.store.row.generation, claim.generation)
  assert.equal(
    harness.store.row.checkoutExpiresAt.getTime(),
    claim.checkoutExpiresAt.getTime()
  )
  assert.deepEqual(harness.events, ['acquire-lease', 'create-or-replay'])
})

test('after the replay cutoff, deletion looks up provider state and does not create or release an unknown session', async () => {
  const harness = deletionHarness(
    makeClaim({ checkoutExpiresAt: new Date(Date.now() + 20 * 60_000) })
  )
  assert.equal((await harness.run()).status, 'pending')
  assert.ok(harness.store.row)
  assert.deepEqual(harness.events, ['acquire-lease', 'lookup-all-statuses'])
})

test('an expired unknown claim can still represent a completed paid checkout', async () => {
  const claim = makeClaim({
    checkoutExpiresAt: new Date(Date.now() - 10 * 60_000)
  })
  const complete = providerSession(claim, {
    status: 'complete',
    customer: 'cus_paid',
    subscription: 'sub_paid'
  })
  const harness = deletionHarness(claim, { lookupSession: complete })
  const result = await harness.run()
  assert.equal(result.status, 'complete')
  assert.equal(result.customerId, 'cus_paid')
  assert.equal(result.subscriptionId, 'sub_paid')
  assert.equal(harness.store.row.sessionId, complete.id)
  assert.deepEqual(harness.events, [
    'acquire-lease',
    'lookup-all-statuses',
    'persist-session'
  ])
})

test('only an expired deadline plus a complete provider lookup proving absence releases an unknown claim', async () => {
  const claim = makeClaim({
    checkoutExpiresAt: new Date(Date.now() - 10 * 60_000)
  })
  const harness = deletionHarness(claim)
  assert.equal((await harness.run()).status, 'closed')
  assert.deepEqual(harness.events, [
    'acquire-lease',
    'lookup-all-statuses',
    'release-claim'
  ])

  const unavailable = deletionHarness(claim, {
    lookupError: new Error('provider unavailable')
  })
  await assert.rejects(unavailable.run(), /provider unavailable/)
  assert.ok(unavailable.store.row)
  assert.deepEqual(unavailable.events, ['acquire-lease', 'lookup-all-statuses'])
})

test('provider lookup consumes all statuses and detects duplicate claim identities', async () => {
  const claim = makeClaim()
  const complete = providerSession(claim, { status: 'complete' })
  let listParameters
  function moduleFor(sessions) {
    return loadSourceModule('../src/lib/stripe.ts', {
      '@/lib/billing': billing,
      stripe: class {
        checkout = {
          sessions: {
            list: (parameters) => {
              listParameters = parameters
              return (async function* () {
                for (const session of sessions) yield session
              })()
            }
          }
        }
      }
    })
  }
  const provider = moduleFor([
    providerSession(claim, { metadata: { userId: 'another-user' } }),
    complete
  ])
  assert.equal(
    (await provider.findCheckoutSessionForClaim(claim)).id,
    complete.id
  )
  assert.equal(listParameters.status, undefined)
  assert.ok(listParameters.created.gte < claim.createdAt.getTime() / 1000)
  assert.ok(
    listParameters.created.lte > claim.checkoutExpiresAt.getTime() / 1000
  )

  const duplicate = moduleFor([
    complete,
    { ...complete, id: 'cs_test_duplicate' }
  ])
  await assert.rejects(
    duplicate.findCheckoutSessionForClaim(claim),
    /Multiple provider sessions/
  )
})

test('checkout reclaim preserves the original provider snapshot despite a new request', async () => {
  const claim = makeClaim()
  const harness = checkoutHarness(claim)
  const result = await harness.run()
  assert.equal(result.owned, true)
  assert.equal(result.claim.generation, claim.generation)
  assert.equal(result.claim.planId, claim.planId)
  assert.equal(result.claim.priceId, claim.priceId)
  assert.equal(result.claim.customerEmail, claim.customerEmail)
  assert.equal(
    result.claim.checkoutExpiresAt.getTime(),
    claim.checkoutExpiresAt.getTime()
  )
  assert.deepEqual(harness.events, ['acquire-lease'])
})

test('checkout recovery never rotates past a completed session or an unresolved provider lookup', async () => {
  const claim = makeClaim({
    checkoutExpiresAt: new Date(Date.now() - 10 * 60_000)
  })
  const complete = providerSession(claim, {
    status: 'complete',
    customer: 'cus_paid',
    subscription: 'sub_paid'
  })
  const harness = checkoutHarness(claim, complete)
  const result = await harness.run()
  assert.equal(result.owned, false)
  assert.equal(result.claim.sessionId, complete.id)
  assert.equal(result.claim.generation, claim.generation)
  assert.deepEqual(harness.events, [
    'acquire-lease',
    'lookup-all-statuses',
    'persist-session'
  ])

  const unavailable = checkoutHarness(
    claim,
    null,
    new Error('provider unavailable')
  )
  await assert.rejects(unavailable.run(), /provider unavailable/)
  assert.equal(unavailable.store.row.generation, claim.generation)
  assert.ok(unavailable.store.row)
})

test('checkout rotation requires both expiry and provider-confirmed absence', async () => {
  const awaiting = checkoutHarness(
    makeClaim({ checkoutExpiresAt: new Date(Date.now() + 20 * 60_000) })
  )
  const unresolved = await awaiting.run()
  assert.equal(unresolved.owned, false)
  assert.equal(unresolved.claim.generation, 7)

  const expired = checkoutHarness(
    makeClaim({ checkoutExpiresAt: new Date(Date.now() - 10 * 60_000) })
  )
  const rotated = await expired.run()
  assert.equal(rotated.owned, true)
  assert.equal(rotated.claim.generation, 8)
  assert.equal(rotated.claim.planId, 'pro')
  assert.ok(
    timing.checkoutClaimHasReplayWindow(rotated.claim.checkoutExpiresAt)
  )
})

test('checkout abandonment does not erase an unknown in-flight provider identity', async () => {
  const harness = checkoutHarness(makeClaim())
  assert.equal(await harness.abandon(), false)
  assert.ok(harness.store.row)
  assert.deepEqual(harness.events, [])
})

test('a late checkout POST preserves the session reclaimed by a newer lease, including before its ID is persisted', async () => {
  for (const newerSessionId of ['cs_test_shared', null]) {
    let row = null
    const expiredSessions = []
    const prisma = {
      user: {
        findUnique: async () => ({
          email: 'customer@example.test',
          plan: 'free',
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          stripeSubscriptionStatus: null
        }),
        update: async () => ({ stripeCheckoutGeneration: 7 })
      },
      accountDeletionRequest: { findUnique: async () => null },
      billingCheckoutClaim: {
        create: async ({ data }) => {
          row = { ...makeClaim(), ...data }
          return { ...row }
        },
        findUnique: async () => (row ? { ...row } : null),
        updateMany: async ({ where, data }) => {
          if (
            !row ||
            row.token !== where.token ||
            row.generation !== where.generation ||
            row.sessionId !== where.sessionId
          ) {
            return { count: 0 }
          }
          row = { ...row, ...data }
          return { count: 1 }
        }
      }
    }
    prisma.$transaction = async (operation) => operation(prisma)
    const route = loadSourceModule('../src/app/api/stripe/checkout/route.ts', {
      'next/server': {
        NextResponse: {
          json: (body, options = {}) => ({
            body,
            status: options.status ?? 200
          })
        }
      },
      '@/lib/auth': { auth: async () => ({ user: { id: USER_ID } }) },
      '@/lib/billing': billing,
      '@/lib/billing-checkout-claim': timing,
      '@/lib/db': { createPrismaClient: () => prisma },
      '@/lib/rate-limit': {
        rateLimit: async () => ({ limited: false }),
        rateLimitKey: () => 'test'
      },
      '@/lib/stripe': {
        loadConfiguredMonthlyPrice: async () => ({
          id: 'price_creator_snapshot'
        }),
        getBillingCheckoutUrls: () => ({
          successUrl: 'https://app.example.test/success',
          cancelUrl: 'https://app.example.test/cancel'
        }),
        createCheckoutSession: async () => {
          const response = providerSession(row, {
            id: 'cs_test_shared',
            url: 'https://checkout.stripe.com/shared'
          })
          // While A waits for Stripe, B reclaims the expired lease using the
          // same durable key. A's response then arrives after B owns it.
          row = {
            ...row,
            token: 'newer-owner-token',
            sessionId: newerSessionId
          }
          return response
        },
        getStripe: () => ({
          checkout: {
            sessions: { expire: async (id) => expiredSessions.push(id) }
          }
        })
      }
    })
    const result = await route.POST(
      new Request('https://app.example.test/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'creator', locale: 'en' })
      })
    )
    assert.equal(result.status, 409)
    assert.equal(result.body.error, 'checkout_in_progress')
    assert.equal(row.token, 'newer-owner-token')
    assert.equal(row.sessionId, newerSessionId)
    assert.deepEqual(expiredSessions, [])
  }
})

test('a recovered completed checkout reopens a finished cancellation checkpoint atomically', async () => {
  let checkpoint = {
    userId: USER_ID,
    stripeCustomerId: 'cus_old_deleted',
    stripeSubscriptionId: 'sub_old_canceled',
    billingCancellationCompleted: true
  }
  let user = {
    plan: 'free',
    stripeCustomerId: checkpoint.stripeCustomerId,
    stripeSubscriptionId: checkpoint.stripeSubscriptionId,
    stripeSubscriptionStatus: 'canceled',
    stripeCancelAtPeriodEnd: false,
    stripeCurrentPeriodEnd: null
  }
  const route = loadSourceModule(
    '../src/app/api/user/data/route.ts',
    {
      '@prisma/client': {
        Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } }
      }
    },
    ['adoptCompletedCheckout', 'finalizeAccountDeletion']
  )
  const transaction = {
    accountDeletionRequest: {
      findUnique: async () => ({ ...checkpoint }),
      update: async ({ data }) => (checkpoint = { ...checkpoint, ...data })
    },
    user: {
      findUnique: async () => ({ ...user }),
      update: async ({ data }) => (user = { ...user, ...data })
    }
  }
  const prisma = { $transaction: async (operation) => operation(transaction) }
  const recovered = await route.adoptCompletedCheckout(
    prisma,
    USER_ID,
    'cus_new_paid',
    'sub_new_paid'
  )
  assert.equal(recovered.billingCancellationCompleted, false)
  assert.equal(recovered.stripeCustomerId, 'cus_new_paid')
  assert.equal(user.stripeCustomerId, 'cus_new_paid')
  assert.equal(user.stripeSubscriptionId, 'sub_new_paid')
  assert.equal(user.plan, 'free')

  checkpoint = {
    ...checkpoint,
    stripeCustomerId: 'cus_uncanceled',
    billingCancellationCompleted: false
  }
  await assert.rejects(
    route.adoptCompletedCheckout(prisma, USER_ID, 'cus_another', 'sub_another'),
    /Outstanding billing resources/
  )
})

test('final account deletion refuses to cascade an unresolved checkout claim', async () => {
  const checkpoint = {
    userId: USER_ID,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    billingCancellationCompleted: true
  }
  let deleted = false
  const route = loadSourceModule(
    '../src/app/api/user/data/route.ts',
    {
      '@prisma/client': {
        Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } }
      }
    },
    ['finalizeAccountDeletion']
  )
  const transaction = {
    accountDeletionRequest: { findUnique: async () => checkpoint },
    user: {
      findUnique: async () => ({
        id: USER_ID,
        plan: 'free',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: null,
        stripeCancelAtPeriodEnd: false,
        stripeCurrentPeriodEnd: null
      }),
      deleteMany: async () => {
        deleted = true
        return { count: 1 }
      }
    },
    billingCheckoutClaim: { findUnique: async () => ({ userId: USER_ID }) }
  }
  await assert.rejects(
    route.finalizeAccountDeletion(
      { $transaction: async (operation) => operation(transaction) },
      USER_ID
    ),
    /still requires reconciliation/
  )
  assert.equal(deleted, false)
})

test('a stale deletion request cannot certify provider IDs adopted by another request', async () => {
  // D1 reads an empty snapshot and therefore performs no Stripe cancellation.
  const canceledSnapshot = {
    stripeCustomerId: null,
    stripeSubscriptionId: null
  }
  // Before D1 checkpoints, D2 discovers a completed checkout and adopts its
  // customer. D2 has not yet deleted that provider customer.
  const checkpoint = {
    userId: USER_ID,
    stripeCustomerId: 'cus_new_still_active',
    stripeSubscriptionId: 'sub_new_still_active',
    billingCancellationCompleted: false
  }
  let userWrites = 0
  let checkpointWrites = 0
  const route = loadSourceModule(
    '../src/app/api/user/data/route.ts',
    {
      '@prisma/client': {
        Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' } }
      }
    },
    ['markBillingCancellationCompleted']
  )
  const transaction = {
    accountDeletionRequest: {
      findUnique: async () => ({ ...checkpoint }),
      updateMany: async () => {
        checkpointWrites += 1
        return { count: 1 }
      }
    },
    user: {
      findUnique: async () => ({
        id: USER_ID,
        stripeCustomerId: checkpoint.stripeCustomerId,
        stripeSubscriptionId: checkpoint.stripeSubscriptionId
      }),
      updateMany: async () => {
        userWrites += 1
        return { count: 1 }
      }
    }
  }
  await assert.rejects(
    route.markBillingCancellationCompleted(
      { $transaction: async (operation) => operation(transaction) },
      USER_ID,
      canceledSnapshot
    ),
    /Billing checkpoint changed after provider cleanup/
  )
  assert.equal(userWrites, 0)
  assert.equal(checkpointWrites, 0)
  assert.equal(checkpoint.billingCancellationCompleted, false)

  // The same guard binds a non-null customer too: an older cleanup cannot
  // certify a newly adopted subscription on the checkpoint.
  await assert.rejects(
    route.markBillingCancellationCompleted(
      { $transaction: async (operation) => operation(transaction) },
      USER_ID,
      {
        stripeCustomerId: checkpoint.stripeCustomerId,
        stripeSubscriptionId: 'sub_previously_canceled'
      }
    ),
    /Billing checkpoint changed after provider cleanup/
  )
  assert.equal(userWrites, 0)
  assert.equal(checkpointWrites, 0)
})
