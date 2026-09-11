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

test('credit balance is translated into a conservative clip runway', () => {
  assert.equal(billing.CREDITS_PER_CLIP, 10)
  assert.equal(billing.estimateAvailableClips(100), 10)
  assert.equal(billing.estimateAvailableClips(19), 1)
  assert.equal(billing.estimateAvailableClips(9), 0)
  assert.equal(billing.estimateAvailableClips(-20), 0)
  assert.equal(billing.estimateAvailableClips(Number.NaN), 0)
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
