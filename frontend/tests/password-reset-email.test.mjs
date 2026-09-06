import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/password-reset-email.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { passwordResetDelivery, sendPasswordResetEmail } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const environment = { RESEND_API_KEY: 'synthetic-key', AUTH_EMAIL_FROM: 'Sneepcut <reset@example.invalid>', NEXTAUTH_URL: 'https://studio.example.invalid' }

test('email delivery requires complete configuration and a trusted HTTPS origin', () => {
  assert.equal(passwordResetDelivery({}), null)
  assert.equal(passwordResetDelivery({ ...environment, RESEND_API_KEY: '' }), null)
  for (const origin of ['http://localhost:3000', 'javascript:alert(1)', 'https://user:pass@example.invalid', 'broken']) {
    assert.equal(passwordResetDelivery({ ...environment, NEXTAUTH_URL: origin }), null)
  }
  assert.equal(passwordResetDelivery(environment).origin, environment.NEXTAUTH_URL)
})

test('reset email uses encoded account/token, expiry, bounded request and idempotency', async () => {
  let request
  await sendPasswordResetEmail(passwordResetDelivery(environment), 'fixture+reset@example.invalid', 'a&b', 'digest', async (url, options) => {
    request = { url, ...options }
    return Response.json({ id: 'synthetic-email' })
  })
  assert.equal(request.url, 'https://api.resend.com/emails')
  assert.equal(request.headers.Authorization, 'Bearer synthetic-key')
  assert.equal(request.headers['Idempotency-Key'], 'password-reset/digest')
  assert.ok(request.signal instanceof AbortSignal)
  const body = JSON.parse(request.body)
  assert.deepEqual(body.to, ['fixture+reset@example.invalid'])
  const link = new URL(body.text.split('\n')[2])
  assert.equal(link.origin, environment.NEXTAUTH_URL)
  assert.equal(link.searchParams.get('token'), 'a&b')
  assert.equal(link.searchParams.get('email'), body.to[0])
  assert.match(body.text, /one hour/)
})

test('provider errors and missing acknowledgements do not count as delivery', async () => {
  for (const response of [new Response('unavailable', { status: 503 }), Response.json({}), Response.json({ id: '' })]) {
    await assert.rejects(sendPasswordResetEmail(passwordResetDelivery(environment), 'fixture@example.invalid', 'token', 'digest', async () => response))
  }
  await assert.rejects(sendPasswordResetEmail(passwordResetDelivery(environment), 'fixture@example.invalid', 'token', 'digest', async () => { throw new Error('network failure') }))
})
