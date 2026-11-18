import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { readConfig, validateConfig, sanitizer, traceSummary } from '../hetzner-s3-helpers.mjs'

const config = { endpoint: 'https://hel1.your-objectstorage.com', region: 'hel1', bucket: 'synthetic-test', confirm_bucket: 'synthetic-test', access_key: 'SYNTHETIC-ACCESS-KEY', secret_key: 'SYNTHETIC-SECRET-KEY' }

test('provider opt-in rejects alternate endpoints, bucket paths and mismatched confirmation', () => {
  assert.equal(validateConfig(config), config)
  for (const changed of [{ endpoint: 'https://elsewhere.invalid' }, { endpoint: config.endpoint + '/bucket' }, { bucket: '../other', confirm_bucket: '../other' }, { confirm_bucket: 'another-bucket' }])
    assert.throws(() => validateConfig({ ...config, ...changed }))
})

test('diagnostic redaction removes private credentials and complete presigned addresses', () => {
  const result = sanitizer(config)(`${config.access_key} ${config.secret_key} https://private.invalid/file?X-Amz-Signature=private`)
  assert.equal(result.includes(config.access_key), false)
  assert.equal(result.includes(config.secret_key), false)
  assert.equal(result.includes('X-Amz-Signature'), false)
})

test('invalid input never includes private configuration in its parse error', async () => {
  await assert.rejects(readConfig(Readable.from([`{"secret_key":"${config.secret_key}", invalid`])), error => {
    assert.equal(error.message, 'Smoke configuration must be valid JSON')
    assert.equal(String(error.stack).includes(config.secret_key), false)
    return true
  })
})

test('validation errors do not echo values accidentally containing credentials', () => {
  for (const changed of [{ endpoint: `https://invalid/${config.secret_key}` },
    { bucket: config.secret_key }, { bucket: config.secret_key, confirm_bucket: config.secret_key }]) {
    assert.throws(() => validateConfig({ ...config, ...changed }), error => {
      assert.equal(String(error.stack).includes(config.secret_key), false)
      assert.equal(JSON.stringify(error).includes(config.secret_key), false)
      return true
    })
  }
})

test('wire summary preserves failed first attempts even when a retry succeeds', async () => {
  const scratch = await mkdtemp(path.join(tmpdir(), 'hetzner-summary-'))
  try {
    const file = path.join(scratch, 'trace.jsonl')
    await writeFile(file, [
      { phase: 'headers', path: '/synthetic', status: 503, attempt: 'attempt=1; max=3', elapsed_ms: 10 },
      { phase: 'headers', path: '/synthetic', status: 200, attempt: 'attempt=2; max=3', elapsed_ms: 10 },
      { phase: 'body', path: '/synthetic', status: 200, error: 'timeout', elapsed_ms: 6000 },
    ].map(item => JSON.stringify(item)).join('\n'))
    const result = await traceSummary(file)
    assert.equal(result.retriedAttempts, 1)
    assert.deepEqual(result.statuses, { 200: 1, 503: 1 })
    assert.equal(result.errors.length, 1)
    assert.equal(result.slowAttempts.length, 1)
  } finally { await rm(scratch, { recursive: true, force: true }) }
})
