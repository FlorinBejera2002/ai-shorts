import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import test from 'node:test'
import { replayEvent } from '../stripe-sandbox-replay.mjs'

// Generate clearly synthetic credentials; every provider request is mocked below.
const syntheticKey = `sk_test_${'synthetic'.repeat(3)}`
const environment = { STRIPE_MODE: 'test', STRIPE_EXPECTED_ACCOUNT_ID: 'acct_synthetic', STRIPE_SECRET_KEY: syntheticKey, STRIPE_WEBHOOK_SECRET: 'whsec_synthetickeyfortestingonly' }
const body = '{ "id": "evt_synthetic", "object": "event", "livemode": false, "data": {"object": {"id": "sub_synthetic"}} }'
function provider(overrides = {}) {
  const calls = []
  const fetcher = async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/account')) return { ok: true, json: async () => ({ id: overrides.account ?? 'acct_synthetic' }) }
    if (url.includes('/events/')) return { ok: true, text: async () => overrides.body ?? body }
    return { status: 200, json: async () => ({ received: true, duplicate: calls.filter(call => call.options.method === 'POST').length > 1 }) }
  }
  return { calls, fetcher }
}

test('sandbox identity, credentials and event ownership fail before local delivery', async () => {
  for (const [changes, overrides] of [
    [{ STRIPE_MODE: 'live' }, {}], [{ STRIPE_SECRET_KEY: syntheticKey.replace('_test_', '_live_') }, {}],
    [{ STRIPE_WEBHOOK_SECRET: '' }, {}], [{}, { account: 'acct_foreign' }],
    [{}, { body: body.replace('false', 'true') }], [{}, { body: body.replace('evt_synthetic', 'evt_foreign') }],
    [{}, { body: JSON.stringify({ id: 'evt_synthetic', object: 'event', livemode: false, account: 'acct_foreign' }) }],
  ]) {
    const fixture = provider(overrides)
    await assert.rejects(replayEvent({ ...environment, ...changes }, 'acct_synthetic', 'evt_synthetic', fixture.fetcher))
    assert.ok(fixture.calls.every(call => call.options.method !== 'POST'))
  }
})

test('retrieved original bytes are signed and delivered exactly twice to fixed loopback', async () => {
  const fixture = provider()
  const results = await replayEvent(environment, 'acct_synthetic', 'evt_synthetic', fixture.fetcher)
  const posts = fixture.calls.filter(call => call.options.method === 'POST')
  assert.equal(posts.length, 2)
  for (const call of posts) {
    assert.equal(call.url, 'http://127.0.0.1:58081/api/webhooks/stripe')
    assert.equal(call.options.body, body)
    const parts = Object.fromEntries(call.options.headers['Stripe-Signature'].split(',').map(part => part.split('=')))
    assert.equal(parts.v1, createHmac('sha256', environment.STRIPE_WEBHOOK_SECRET).update(`${parts.t}.${body}`).digest('hex'))
    assert.equal(call.options.redirect, 'error')
  }
  assert.deepEqual(results.map(result => [result.httpStatus, result.duplicate]), [[200, false], [200, true]])
  assert.ok(!JSON.stringify(results).includes(environment.STRIPE_SECRET_KEY))
  assert.ok(!JSON.stringify(results).includes(environment.STRIPE_WEBHOOK_SECRET))
  assert.ok(!JSON.stringify(results).includes('sub_synthetic'))
})
