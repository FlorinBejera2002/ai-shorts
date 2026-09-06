import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function recovery({ configured = true, found = true, fail = false } = {}) {
  const deleted = [], created = [], logs = []
  let sent = 0, disconnected = 0, lookups = 0
  const db = {
    user: { findUnique: async () => { lookups++; return found ? { email: 'test@example.invalid' } : null } },
    verificationToken: {
      deleteMany: async args => { deleted.push(args.where); return { count: 1 } },
      create: async args => { created.push(args.data) }
    },
    $transaction: values => Promise.all(values),
    $disconnect: async () => { disconnected++ }
  }
  const modules = {
    'node:crypto': { createHash, randomBytes },
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/db': { createPrismaClient: () => db },
    '@/lib/password-reset-email': {
      passwordResetDelivery: () => configured ? {} : null,
      sendPasswordResetEmail: async () => { sent++; if (fail) throw new Error('provider secret') }
    },
    '@/lib/rate-limit': { rateLimit: async () => ({ limited: false }), rateLimitKey: () => 'synthetic' },
    '@/lib/request-body': { readBoundedJson: request => request.json(), RequestBodyTooLargeError: class extends Error {} }
  }
  const exports = {}
  const source = readFileSync(new URL('../src/app/api/auth/forgot-password/route.ts', import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, process: { env: { APP_ENV: 'production' } }, console: { error: message => logs.push(message), log: message => logs.push(message) }, require: name => { assert.ok(modules[name], name); return modules[name] }
  })
  return {
    post: () => exports.POST(new Request('https://studio.example.invalid/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'test@example.invalid' }) })),
    counts: () => ({ sent, disconnected, lookups }), deleted, created, logs
  }
}

test('missing mail configuration fails uniformly before account lookup', async () => {
  const r = recovery({ configured: false })
  assert.equal((await r.post()).status, 503)
  assert.equal(r.counts().lookups, 0)
})
test('successful reset sends only a digest-backed token and closes the DB', async () => {
  const r = recovery()
  assert.deepEqual(await (await r.post()).json(), { sent: true })
  assert.equal(r.counts().sent, 1)
  assert.equal(r.counts().disconnected, 1)
  assert.match(r.created[0].token, /^[a-f0-9]{64}$/)
  assert.equal(r.logs.length, 0)
})
test('failed delivery revokes its own token without exposing account existence or secrets', async () => {
  const failed = recovery({ fail: true }), missing = recovery({ found: false })
  assert.deepEqual(await (await failed.post()).json(), await (await missing.post()).json())
  assert.equal(failed.deleted[1].token, failed.created[0].token)
  assert.equal(failed.counts().disconnected, 1)
  assert.equal(missing.counts().sent, 0)
  assert.equal(missing.counts().disconnected, 1)
  assert.deepEqual(failed.logs, ['Password reset email delivery failed'])
})
