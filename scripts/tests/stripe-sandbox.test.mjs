import assert from 'node:assert/strict'
import test from 'node:test'
import { API_VERSION, WEBHOOK_EVENTS, apply, createStripeClient, prepare, validatePolicy } from '../stripe-sandbox.mjs'

const environment = { STRIPE_MODE: 'test', STRIPE_EXPECTED_ACCOUNT_ID: 'acct_synthetic' }
function policy() {
  return {
    version: 1, configurationKey: 'synthetic-billing-test', expectedAccountId: 'acct_synthetic', appOrigin: 'http://localhost:3000',
    catalog: ['creator', 'pro', 'agency'].map((key, index) => ({ key, name: `Synthetic ${key}`, currency: 'eur', unitAmount: (index + 1) * 100, taxBehavior: 'exclusive', interval: 'month', intervalCount: 1 })),
    portal: { paymentMethodUpdate: true, invoiceHistory: true, customerUpdates: ['email', 'address'], cancelEnabled: true, cancelMode: 'at_period_end', cancelProrationBehavior: 'none', updateEnabled: true, updateProrationBehavior: 'always_invoice', returnPath: '/ro/dashboard/billing' },
    webhookUrl: 'https://sandbox.example.test/api/webhooks/stripe',
  }
}
function fixture() {
  const resources = new Map(['/products', '/prices', '/billing_portal/configurations', '/webhook_endpoints'].map(name => [name, []]))
  const calls = []
  const keys = new Map()
  const client = {
    async request(method, resource, form, idempotencyKey) {
      calls.push({ method, resource, form, idempotencyKey })
      if (resource === '/account') return { id: 'acct_synthetic', business_profile: { name: 'Synthetic account' } }
      if (method === 'GET') {
        const data = structuredClone(resources.get(resource))
        // Stripe omits the Portal product allowlist unless explicitly expanded.
        if (resource === '/billing_portal/configurations' && !form.expand?.includes('data.features.subscription_update.products')) {
          data.forEach(item => { delete item.features.subscription_update.products })
        }
        return { data, has_more: false }
      }
      assert.ok(idempotencyKey)
      if (keys.has(idempotencyKey)) return structuredClone(keys.get(idempotencyKey))
      const prefix = { '/products': 'prod', '/prices': 'price', '/billing_portal/configurations': 'bpc', '/webhook_endpoints': 'we' }[resource]
      const result = { ...structuredClone(form), id: `${prefix}_${resources.get(resource).length + 1}`, livemode: false, active: true }
      if (resource === '/prices') Object.assign(result, { billing_scheme: 'per_unit', type: form.recurring ? 'recurring' : 'one_time', transform_quantity: null, custom_unit_amount: null })
      if (resource === '/webhook_endpoints') Object.assign(result, { status: 'enabled', application: null, secret: 'whsec_synthetic_must_never_be_persisted' })
      resources.get(resource).push(result)
      keys.set(idempotencyKey, result)
      return structuredClone(result)
    },
  }
  return { client, resources, calls, keys }
}

test('requires explicit commercial settings and rejects extra fields and duplicate plans', () => {
  validatePolicy(policy())
  for (const mutate of [
    value => delete value.catalog[0].unitAmount,
    value => delete value.catalog[0].taxBehavior,
    value => delete value.portal.cancelMode,
    value => delete value.portal.updateProrationBehavior,
    value => { value.portal.cancelProrationBehavior = 'always_invoice' },
    value => { value.portal.cancelProrationBehavior = 'create_prorations' },
    value => { value.catalog[0].secret = 'private' },
    value => { value.catalog[1].key = 'creator' },
    value => { value.portal.returnPath = '//elsewhere.test' },
    value => { value.appOrigin = 'http://external.test' },
    value => { value.webhookUrl = 'https://sandbox.test/api/webhooks/stripe?secret=private' },
  ]) {
    const value = policy()
    mutate(value)
    assert.throws(() => validatePolicy(value))
  }
})

test('accepts explicit one-time packs and rejects recurring pack definitions', () => {
  const value = policy()
  value.catalog.push({ key: 'credits_100', name: 'Synthetic credits', currency: 'eur', unitAmount: 100, taxBehavior: 'exclusive' })
  validatePolicy(value)
  value.catalog.at(-1).interval = 'month'
  assert.throws(() => validatePolicy(value), /one-time/)
})

test('live and placeholder keys are rejected before any network access', () => {
  let requests = 0
  for (const secret of ['sk_live_private', 'rk_live_private', 'sk_test_...', '', undefined]) {
    assert.throws(() => createStripeClient(secret, () => { requests++ }), /test/)
  }
  assert.equal(requests, 0)
})

test('environment and account identity are checked before inventory or mutations', async () => {
  const { client, calls } = fixture()
  await assert.rejects(prepare(client, policy(), { ...environment, STRIPE_MODE: 'live' }), /test environment/)
  assert.equal(calls.length, 0)
  await assert.rejects(prepare(client, { ...policy(), expectedAccountId: 'acct_other' }, { ...environment, STRIPE_EXPECTED_ACCOUNT_ID: 'acct_other' }), /identity/)
  assert.deepEqual(calls.map(call => call.resource), ['/account'])
})

test('prepare is read-only and apply records only nonsecret IDs with stable idempotency', async () => {
  const { client, calls, keys } = fixture()
  const value = policy()
  const reviewed = await prepare(client, value, environment)
  assert.equal(reviewed.actions.length, 8)
  assert.ok(calls.every(call => call.method === 'GET'))
  const checkpoints = []
  const manifest = await apply(client, value, environment, reviewed, async checkpoint => checkpoints.push(structuredClone(checkpoint)))
  assert.equal(keys.size, 8)
  assert.equal(manifest.environmentVariables.STRIPE_PRICE_CREATOR, 'price_1')
  assert.equal(manifest.environmentVariables.STRIPE_PORTAL_CONFIGURATION, 'bpc_1')
  assert.equal(manifest.webhookEndpointId, 'we_1')
  assert.ok(!JSON.stringify(checkpoints).includes('whsec_synthetic'))
  const webhook = calls.find(call => call.resource === '/webhook_endpoints' && call.method === 'POST')
  assert.equal(webhook.form.api_version, API_VERSION)
  assert.deepEqual(webhook.form.enabled_events, WEBHOOK_EVENTS)
  assert.ok(checkpoints.length >= 8)
  const next = await prepare(client, value, environment)
  assert.deepEqual(next.actions, [])
  const before = calls.filter(call => call.method === 'POST').length
  await apply(client, value, environment, next)
  assert.equal(calls.filter(call => call.method === 'POST').length, before)
})

test('changed reviewed policy or inventory prevents all mutations', async () => {
  const { client, calls, resources } = fixture()
  const value = policy()
  const reviewed = await prepare(client, value, environment)
  value.catalog[0].unitAmount += 1
  await assert.rejects(apply(client, value, environment, reviewed), /Reviewed plan differs/)
  assert.ok(calls.every(call => call.method === 'GET'))
  value.catalog[0].unitAmount -= 1
  resources.get('/products').push({ id: 'prod_new', name: value.catalog[0].name, active: true, livemode: false, metadata: { sneepcut_configuration: value.configurationKey, sneepcut_catalog_key: 'creator' } })
  await assert.rejects(apply(client, value, environment, reviewed), /Reviewed plan differs/)
  assert.ok(calls.every(call => call.method === 'GET'))
})

test('ambiguity, unmanaged name collisions and mismatching resources fail preflight', async () => {
  for (const scenario of ['ambiguous', 'unmanaged', 'mismatch', 'live']) {
    const { client, calls, resources } = fixture()
    const value = policy()
    const product = { id: 'prod_existing', name: value.catalog[0].name, active: true, livemode: false, metadata: { sneepcut_configuration: value.configurationKey, sneepcut_catalog_key: 'creator' } }
    if (scenario === 'unmanaged') product.metadata = {}
    if (scenario === 'mismatch') product.name = 'Other name'
    if (scenario === 'live') product.livemode = true
    resources.get('/products').push(product)
    if (scenario === 'ambiguous') resources.get('/products').push({ ...product, id: 'prod_duplicate' })
    await assert.rejects(prepare(client, value, environment))
    assert.ok(calls.every(call => call.method === 'GET'))
  }
})

test('explicit resource adoption verifies immutable amount and portal settings', async () => {
  const { client, resources } = fixture()
  const value = policy()
  await apply(client, value, environment, await prepare(client, value, environment))
  for (const resource of resources.values()) for (const item of resource) item.metadata = {}
  value.catalog.forEach((entry, index) => { entry.productId = `prod_${index + 1}`; entry.priceId = `price_${index + 1}` })
  value.portal.configurationId = 'bpc_1'
  assert.deepEqual((await prepare(client, value, environment)).actions, [])
  resources.get('/prices')[0].unit_amount += 1
  await assert.rejects(prepare(client, value, environment), /Existing price creator differs/)
  resources.get('/prices')[0].unit_amount -= 1
  resources.get('/billing_portal/configurations')[0].features.subscription_cancel.mode = 'immediately'
  await assert.rejects(prepare(client, value, environment), /Existing portal differs/)
})

test('webhook mismatches fail rather than creating a duplicate endpoint', async () => {
  const { client, resources } = fixture()
  const value = policy()
  resources.get('/webhook_endpoints').push({ id: 'we_existing', livemode: false, url: value.webhookUrl, api_version: 'older', enabled_events: WEBHOOK_EVENTS, status: 'enabled' })
  await assert.rejects(prepare(client, value, environment), /Existing webhook differs/)
})

test('HTTP client pins API, encodes nested fields and omits provider errors from exceptions', async () => {
  let request
  const client = createStripeClient('sk_test_synthetic', async (url, options) => {
    request = { url, options }
    return { ok: true, json: async () => ({ id: 'test' }) }
  })
  await client.request('POST', '/products', { name: 'Synthetic', metadata: { key: 'value' } }, 'synthetic-idempotency')
  assert.equal(request.url.href, 'https://api.stripe.com/v1/products')
  assert.equal(request.options.headers['Stripe-Version'], API_VERSION)
  assert.equal(request.options.body.get('metadata[key]'), 'value')
  assert.equal(request.options.headers['Idempotency-Key'], 'synthetic-idempotency')
  assert.equal(request.options.redirect, 'error')
  const rejected = createStripeClient('rk_test_synthetic', async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'sk_test_private_payload' } }) }))
  await assert.rejects(rejected.request('GET', '/account'), error => !error.message.includes('private_payload') && error.message.includes('HTTP 403'))
})
