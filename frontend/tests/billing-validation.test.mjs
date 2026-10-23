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
const { createBillingActionLock } = await loadTypeScriptModule('../src/lib/billing-action-lock.ts')

test('credit balance is translated into a conservative clip runway', () => {
  assert.equal(billing.CREDITS_PER_CLIP, 10)
  assert.equal(billing.estimateAvailableClips(100), 10)
  assert.equal(billing.estimateAvailableClips(19), 1)
  assert.equal(billing.estimateAvailableClips(9), 0)
  assert.equal(billing.estimateAvailableClips(-20), 0)
  assert.equal(billing.estimateAvailableClips(Number.NaN), 0)
})

test('paid monthly allowances provide finite clip capacity without changing signup credits', () => {
  assert.equal(billing.INITIAL_FREE_CREDITS, 1000)
  assert.equal(billing.estimateAvailableClips(billing.PLAN_CREDITS.creator), 150)
  assert.equal(billing.estimateAvailableClips(billing.PLAN_CREDITS.pro), 500)
  assert.equal(billing.estimateAvailableClips(billing.PLAN_CREDITS.agency), 2000)
})

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

test('new checkout permits upgrades only', () => {
  assert.equal(billing.canStartPlanCheckout('free', 'creator'), true)
  assert.equal(billing.canStartPlanCheckout('creator', 'pro'), true)
  assert.equal(billing.canStartPlanCheckout('pro', 'agency'), true)
  assert.equal(billing.canStartPlanCheckout('pro', 'pro'), false)
  assert.equal(billing.canStartPlanCheckout('agency', 'creator'), false)
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

test('external invoice links require HTTPS', () => {
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

test('hosted billing destinations accept only the exact Stripe host for the action', () => {
  assert.equal(billing.safeStripeDestination('https://checkout.stripe.com/c/pay/cs_test_example', 'checkout'), 'https://checkout.stripe.com/c/pay/cs_test_example')
  assert.equal(billing.safeStripeDestination('https://billing.stripe.com/p/session/test_example', 'portal'), 'https://billing.stripe.com/p/session/test_example')
  for (const value of [
    'http://checkout.stripe.com/session',
    'https://checkout.stripe.com.evil.example/session',
    'https://evil.example/checkout.stripe.com',
    'https://checkout.stripe.com@evil.example/session',
    'https://user:password@checkout.stripe.com/session',
    'https://checkout.stripe.com:444/session',
    'https://billing.stripe.com/session',
    null
  ]) assert.equal(billing.safeStripeDestination(value, 'checkout'), null)
  assert.equal(billing.safeStripeDestination('https://checkout.stripe.com/session', 'portal'), null)
})

test('checkout can safely fall back to the portal when server billing state is newer', () => {
  const checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_example'
  const portalUrl = 'https://billing.stripe.com/p/session/test_example'
  assert.equal(billing.hostedBillingDestination({ kind: 'checkout', url: checkoutUrl }, 'checkout'), checkoutUrl)
  assert.equal(billing.hostedBillingDestination({ kind: 'portal', url: portalUrl }, 'checkout'), portalUrl)
  assert.equal(billing.hostedBillingDestination({ url: portalUrl }, 'portal'), portalUrl)
  for (const response of [
    { url: checkoutUrl },
    { kind: 'unknown', url: checkoutUrl },
    { kind: 'portal', url: checkoutUrl },
    { kind: 'checkout', url: portalUrl },
    null
  ]) assert.equal(billing.hostedBillingDestination(response, 'checkout'), null)
  assert.equal(billing.hostedBillingDestination({ kind: 'checkout', url: checkoutUrl }, 'portal'), null)
  assert.equal(billing.hostedBillingDestination({ kind: null, url: portalUrl }, 'portal'), null)
})

test('confirmation polling is bounded and stops on authoritative completion or invalid ownership', () => {
  for (const status of ['pending', 'unavailable']) {
    assert.equal(billing.shouldConfirmCheckout({ status }, 1), true)
    assert.equal(billing.shouldConfirmCheckout({ status }, billing.CHECKOUT_CONFIRMATION_ATTEMPTS), false)
  }
  for (const status of ['complete', 'invalid']) assert.equal(billing.shouldConfirmCheckout({ status }, 1), false)
  assert.equal(billing.shouldConfirmCheckout(null, 1), false)
})

test('subscription dates do not advertise renewal for ended or payment-blocked subscriptions', () => {
  const sub = { cancelAtPeriodEnd: false, currentPeriodEnd: '2026-11-21T00:00:00Z' }
  for (const status of ['active', 'trialing']) assert.equal(billing.subscriptionPeriodKind({ ...sub, status }), 'renews')
  for (const status of ['past_due', 'unpaid', 'incomplete', 'paused']) assert.equal(billing.subscriptionPeriodKind({ ...sub, status }), 'period')
  for (const status of ['canceled', 'incomplete_expired']) assert.equal(billing.subscriptionPeriodKind({ ...sub, status, cancelAtPeriodEnd: true }), 'none')
  assert.equal(billing.subscriptionPeriodKind({ ...sub, status: 'active', cancelAtPeriodEnd: true }), 'ends')
  assert.equal(billing.subscriptionPeriodKind(null), 'none')
})

test('unconfirmed managed paid access prompts recovery without overriding admin or manual plan access', () => {
  const subscription = { status: 'active', currentPeriodEnd: null, cancelAtPeriodEnd: false }
  assert.equal(billing.needsSubscriptionConfirmation('free', subscription, true), true)
  assert.equal(billing.needsSubscriptionConfirmation('free', { ...subscription, status: 'trialing' }, true), true)
  assert.equal(billing.needsSubscriptionConfirmation('free', subscription, true, true), false)
  assert.equal(billing.needsSubscriptionConfirmation('agency', subscription, false), false)
  assert.equal(billing.needsSubscriptionConfirmation('creator', subscription, true), false)
  assert.equal(billing.needsSubscriptionConfirmation('free', null, true), false)
  assert.equal(billing.needsSubscriptionConfirmation('free', { ...subscription, status: 'past_due' }, true), false)
})

test('billing action lock blocks synchronous submissions across distinct buttons and recovers on failure', () => {
  const lock = createBillingActionLock()
  const changes = []
  const unsubscribe = lock.subscribe(() => changes.push(lock.getSnapshot()))
  assert.equal(lock.acquire(), true)
  assert.equal(lock.acquire(), false)
  assert.equal(lock.getSnapshot(), true)
  lock.release()
  assert.equal(lock.acquire(), true)
  assert.deepEqual(changes, [true, false, true])
  unsubscribe()
  lock.release()
  assert.equal(lock.getSnapshot(), false)
  assert.deepEqual(changes, [true, false, true])
})
