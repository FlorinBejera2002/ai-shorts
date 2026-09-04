import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

async function loadTypeScriptModule(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022
    },
    fileName: relativePath,
    reportDiagnostics: true
  })
  const compileErrors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  )
  assert.deepEqual(
    compileErrors,
    [],
    `${relativePath} should transpile cleanly`
  )
  return import(
    `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  )
}

const billing = await loadTypeScriptModule('../src/lib/billing.ts')

const configuredEnvironment = {
  STRIPE_PRICE_CREATOR: 'price_creator',
  STRIPE_PRICE_PRO: 'price_pro',
  STRIPE_PRICE_AGENCY: 'price_agency',
  STRIPE_PRICE_CREDITS_100: 'price_pack_100',
  STRIPE_PRICE_CREDITS_500: 'price_pack_500',
  STRIPE_PRICE_CREDITS_1000: 'price_pack_1000'
}

test('checkout accepts only logical paid plans and supported locales', () => {
  assert.deepEqual(billing.validateCheckoutPayload({ planId: 'pro' }), {
    success: true,
    data: { planId: 'pro', locale: 'en' }
  })
  assert.deepEqual(
    billing.validateCheckoutPayload({ planId: 'creator', locale: 'ro' }),
    {
      success: true,
      data: { planId: 'creator', locale: 'ro' }
    }
  )

  for (const payload of [
    null,
    [],
    {},
    { planId: 'free' },
    { planId: 'enterprise' },
    { planId: 'pro', locale: 'de' },
    { planId: 'pro', priceId: 'price_attacker' },
    { planId: 'pro', mode: 'payment' },
    { planId: 'pro', userId: 'another-user' }
  ]) {
    assert.equal(billing.validateCheckoutPayload(payload).success, false)
  }
})

test('portal payload does not accept customer IDs or callback URLs', () => {
  assert.deepEqual(billing.validatePortalPayload({ locale: 'ro' }), {
    success: true,
    data: { locale: 'ro' }
  })
  assert.deepEqual(billing.validatePortalPayload({}), {
    success: true,
    data: { locale: 'en' }
  })

  for (const payload of [
    null,
    { locale: 'fr' },
    { customerId: 'cus_attacker' },
    { returnUrl: 'https://evil.example' },
    { locale: 'en', extra: true }
  ]) {
    assert.equal(billing.validatePortalPayload(payload).success, false)
  }
})

test('plan prices must be nonempty and unique', () => {
  assert.equal(
    billing.getConfiguredPlanPrice('creator', configuredEnvironment),
    'price_creator'
  )
  assert.equal(
    billing.getPlanForPrice('price_pro', configuredEnvironment),
    'pro'
  )
  assert.equal(
    billing.hasCompleteBillingPlanConfiguration(configuredEnvironment),
    true
  )

  const emptyEnvironment = {
    ...configuredEnvironment,
    STRIPE_PRICE_CREATOR: '   '
  }
  assert.equal(
    billing.getConfiguredPlanPrice('creator', emptyEnvironment),
    null
  )
  assert.equal(billing.getPlanForPrice('', emptyEnvironment), null)
  assert.equal(
    billing.hasCompleteBillingPlanConfiguration(emptyEnvironment),
    false
  )

  const duplicateEnvironment = {
    ...configuredEnvironment,
    STRIPE_PRICE_CREATOR: 'price_shared',
    STRIPE_PRICE_PRO: 'price_shared'
  }
  assert.equal(
    billing.getConfiguredPlanPrice('creator', duplicateEnvironment),
    null
  )
  assert.equal(
    billing.getConfiguredPlanPrice('pro', duplicateEnvironment),
    null
  )
  assert.equal(
    billing.getPlanForPrice('price_shared', duplicateEnvironment),
    null
  )
  assert.equal(
    billing.hasCompleteBillingPlanConfiguration(duplicateEnvironment),
    false
  )
})

test('legacy credit packs reject empty and ambiguous price mappings', () => {
  assert.equal(
    billing.getCreditsForPackPrice('price_pack_500', configuredEnvironment),
    500
  )
  assert.equal(billing.getCreditsForPackPrice('', configuredEnvironment), null)
  assert.equal(
    billing.getCreditsForPackPrice('price_unknown', configuredEnvironment),
    null
  )
  assert.equal(
    billing.getCreditsForPackPrice('price_duplicate', {
      STRIPE_PRICE_CREDITS_100: 'price_duplicate',
      STRIPE_PRICE_CREDITS_500: 'price_duplicate'
    }),
    null
  )
})

test('new checkout permits upgrades only', () => {
  assert.equal(billing.canStartPlanCheckout('free', 'creator'), true)
  assert.equal(billing.canStartPlanCheckout('creator', 'pro'), true)
  assert.equal(billing.canStartPlanCheckout('pro', 'agency'), true)
  assert.equal(billing.canStartPlanCheckout('pro', 'pro'), false)
  assert.equal(billing.canStartPlanCheckout('agency', 'creator'), false)
})

test('renewal credits are restricted to initial and recurring invoices', () => {
  assert.equal(
    billing.shouldGrantSubscriptionCredits('subscription_create'),
    true
  )
  assert.equal(
    billing.shouldGrantSubscriptionCredits('subscription_cycle'),
    true
  )

  for (const reason of [
    'subscription_update',
    'manual',
    'upcoming',
    null,
    undefined
  ]) {
    assert.equal(billing.shouldGrantSubscriptionCredits(reason), false)
  }
})

test('terminal subscriptions are distinguished from manageable states', () => {
  assert.equal(billing.isTerminalSubscriptionStatus('canceled'), true)
  assert.equal(billing.isTerminalSubscriptionStatus('incomplete_expired'), true)
  for (const status of [
    'active',
    'trialing',
    'past_due',
    'unpaid',
    'incomplete',
    'paused',
    null
  ]) {
    assert.equal(billing.isTerminalSubscriptionStatus(status), false)
  }
})

test('subscription state ordering rejects stale and lower-authority events', () => {
  const active = billing.subscriptionStateVersion('active', 200)
  const olderPastDue = billing.subscriptionStateVersion('past_due', 199)
  const sameSecondIncomplete = billing.subscriptionStateVersion(
    'incomplete',
    200
  )
  const sameSecondCanceled = billing.subscriptionStateVersion('canceled', 200)
  const newerActive = billing.subscriptionStateVersion('active', 201)

  assert.equal(
    billing.shouldApplySubscriptionState(active, olderPastDue),
    false
  )
  assert.equal(
    billing.shouldApplySubscriptionState(active, sameSecondIncomplete),
    false
  )
  assert.equal(
    billing.shouldApplySubscriptionState(active, sameSecondCanceled),
    true
  )
  assert.equal(billing.shouldApplySubscriptionState(active, newerActive), true)
})

test('authoritative provider selection survives equal-second and replacement events', () => {
  const candidate = (id, status, generation = '0') => ({
    id,
    status,
    metadata: { checkoutGeneration: generation }
  })

  const legacyNewestFirst = [
    candidate('sub_new', 'active'),
    candidate('sub_old', 'active')
  ]
  assert.equal(
    billing.chooseAuthoritativeSubscription(legacyNewestFirst, 'sub_old')?.id,
    'sub_new'
  )

  const generated = [
    candidate('sub_old', 'canceled', '4'),
    candidate('sub_new', 'active', '5')
  ]
  assert.equal(
    billing.chooseAuthoritativeSubscription(generated, 'sub_old')?.id,
    'sub_new'
  )

  const sameSubscriptionLatestSnapshot = [candidate('sub_same', 'active', '7')]
  assert.equal(
    billing.chooseAuthoritativeSubscription(
      sameSubscriptionLatestSnapshot,
      'sub_same'
    )?.status,
    'active'
  )

  const terminal = [candidate('sub_a', 'canceled')]
  assert.equal(
    billing.chooseAuthoritativeSubscription(terminal, 'sub_a')?.id,
    'sub_a'
  )
})

test('checkout callback IDs and external links are tightly validated', () => {
  for (const value of ['cs_test_abc123', 'cs_live_ABC123', 'cs_abc123']) {
    assert.equal(billing.isCheckoutSessionId(value), true)
  }
  for (const value of [
    '',
    'cs_test_bad/path',
    'pi_abc123',
    'cs_test_a?next=https://evil.example',
    `cs_test_${'a'.repeat(256)}`,
    null
  ]) {
    assert.equal(billing.isCheckoutSessionId(value), false)
  }

  assert.equal(
    billing.safeHttpsUrl('https://invoice.stripe.com/i/example'),
    'https://invoice.stripe.com/i/example'
  )
  for (const value of [
    'http://invoice.stripe.com/i/example',
    'javascript:alert(1)',
    '/relative',
    '',
    null
  ]) {
    assert.equal(billing.safeHttpsUrl(value), null)
  }
})

test('Stripe object helpers normalize IDs and the latest period end', () => {
  assert.equal(billing.stripeObjectId('sub_123'), 'sub_123')
  assert.equal(billing.stripeObjectId({ id: 'cus_123' }), 'cus_123')
  assert.equal(billing.stripeObjectId({ id: '' }), null)
  assert.equal(billing.stripeObjectId(null), null)

  assert.equal(
    billing
      .subscriptionPeriodEnd([
        { current_period_end: 1_700_000_000 },
        { current_period_end: 1_800_000_000 },
        { current_period_end: 'invalid' }
      ])
      ?.toISOString(),
    new Date(1_800_000_000 * 1000).toISOString()
  )
  assert.equal(billing.subscriptionPeriodEnd([]), null)
})

test('request reader enforces actual UTF-8 bytes without trusting headers', async () => {
  const withinLimit = await billing.readBoundedRequestText(
    new Request('https://example.test', {
      method: 'POST',
      body: 'ă'
    }),
    2
  )
  assert.deepEqual(withinLimit, { ok: true, text: 'ă' })

  const overLimit = await billing.readBoundedRequestText(
    new Request('https://example.test', {
      method: 'POST',
      body: 'ăa'
    }),
    2
  )
  assert.deepEqual(overLimit, { ok: false })

  const rejectedFromHeader = await billing.readBoundedRequestText(
    new Request('https://example.test', {
      method: 'POST',
      headers: { 'Content-Length': '999' },
      body: '{}'
    }),
    10
  )
  assert.deepEqual(rejectedFromHeader, { ok: false })
})
