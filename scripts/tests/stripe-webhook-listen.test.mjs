import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import test from 'node:test'
import { safeListenerEvidence, saveSigningSecret, validateListenerEnvironment } from '../stripe-webhook-listen.mjs'

// Generate clearly synthetic credentials; these tests never contact Stripe.
const syntheticKey = `sk_test_${'synthetic'.repeat(3)}`
const environment = { STRIPE_MODE: 'test', STRIPE_EXPECTED_ACCOUNT_ID: 'acct_synthetic', STRIPE_SECRET_KEY: syntheticKey }

test('listener refuses live keys, missing mode and absent account identity', () => {
  validateListenerEnvironment(environment)
  for (const change of [{ STRIPE_MODE: 'live' }, { STRIPE_SECRET_KEY: syntheticKey.replace('_test_', '_live_') }, { STRIPE_EXPECTED_ACCOUNT_ID: '' }]) {
    assert.throws(() => validateListenerEnvironment({ ...environment, ...change }))
  }
})

test('raw secrets, payloads and provider errors never become listener output', () => {
  for (const line of ['Ready! Your signing secret is whsec_syntheticfortestingonly', '{"client_secret":"pi_synthetic_secret_private"}', `Error Authorization: Bearer ${syntheticKey}`]) {
    assert.equal(safeListenerEvidence(line), null)
  }
  assert.deepEqual(safeListenerEvidence(`2026-10-21 --> invoice.paid [evt_synthetic] ${syntheticKey}`), { eventType: 'invoice.paid', eventId: 'evt_synthetic', phase: 'received' })
  assert.deepEqual(safeListenerEvidence('<-- [200] POST http://127.0.0.1:58081/api/webhooks/stripe [evt_synthetic]'), { eventId: 'evt_synthetic', httpStatus: 200, phase: 'forwarded' })
  assert.deepEqual(safeListenerEvidence('Failed to POST: connection refused; sensitive_provider_payload'), { phase: 'transport_error', code: 'connection_refused' })
  assert.deepEqual(safeListenerEvidence(`Unauthorized: ${syntheticKey}`), { phase: 'transport_error', code: 'authentication_failed' })
})

test('saving the signing secret preserves configuration and removes temporary copies', async t => {
  const base = fileURLToPath(new URL('../../.cache/tmp/', import.meta.url))
  await mkdir(base, { recursive: true })
  const root = await mkdtemp(path.join(base, 'stripe-webhook-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const source = `${Object.entries(environment).map(([key, value]) => `${key}=${value}`).join('\n')}\nSTRIPE_WEBHOOK_SECRET=whsec_previoussyntheticsecret\nUNRELATED=value\n`
  await writeFile(path.join(root, '.env'), source)
  await saveSigningSecret(root, 'whsec_newsyntheticfortestingonly')
  const saved = parseEnv(await readFile(path.join(root, '.env'), 'utf8'))
  assert.equal(saved.STRIPE_WEBHOOK_SECRET, 'whsec_newsyntheticfortestingonly')
  assert.equal(saved.STRIPE_SECRET_KEY, environment.STRIPE_SECRET_KEY)
  assert.equal(saved.UNRELATED, 'value')
  assert.deepEqual(await readdir(path.join(root, '.cache/tmp/stripe-billing')), [])
  await assert.rejects(saveSigningSecret(root, 'invalid'), /Invalid listener/)
})
