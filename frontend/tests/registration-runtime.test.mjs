import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(relative, modules = {}) {
  const exports = {}
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, process, require: name => {
    assert.ok(modules[name], name)
    return modules[name]
  } })
  return exports
}

function registration({ initError, lookupError, createError, existing = null } = {}) {
  let disconnected = 0
  const prisma = {
    user: {
      findUnique: async () => { if (lookupError) throw lookupError; return existing },
      create: async () => { if (createError) throw createError; return { id: 'synthetic', email: 'test@example.invalid' } }
    },
    $disconnect: async () => { disconnected++ }
  }
  const { POST } = load('../src/app/api/auth/register/route.ts', {
    bcryptjs: { default: { hash: async () => 'hashed' } },
    'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
    '@/lib/account-settings': { passwordPolicyIssues: () => [] },
    '@/lib/billing': { INITIAL_FREE_CREDITS: 100 },
    '@/lib/db': { createPrismaClient: () => { if (initError) throw initError; return prisma } },
    '@/lib/rate-limit': { rateLimit: async () => ({ limited: false }), rateLimitKey: () => 'fixture' },
    '@/lib/request-body': { readBoundedJson: request => request.json(), RequestBodyTooLargeError: class extends Error {} }
  })
  return {
    post: () => POST(new Request('http://localhost/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Fixture', email: 'test@example.invalid', password: 'Synthetic-password-73!' })
    })),
    disconnected: () => disconnected
  }
}

test('database initialization and lookup failures return safe JSON instead of an empty 500', async () => {
  for (const options of [{ initError: new Error('secret configuration') }, { lookupError: new Error('connection refused') }]) {
    const api = registration(options)
    const response = await api.post()
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'Account could not be created' })
    assert.equal(api.disconnected(), options.initError ? 0 : 1)
  }
})

test('registration distinguishes success, duplicate accounts and write failures and closes its client', async () => {
  for (const [options, status] of [[{}, 201], [{ existing: { id: 'existing' } }, 409],
    [{ createError: { code: 'P2002' } }, 409], [{ createError: new Error('write unavailable') }, 503]]) {
    const api = registration(options)
    assert.equal((await api.post()).status, status)
    assert.equal(api.disconnected(), 1)
  }
})

test('optimized local Docker builds use development policies while unknown deployments fail closed', () => {
  const { isProductionEnvironment } = load('../src/lib/environment.ts')
  for (const APP_ENV of ['development', 'test']) {
    assert.equal(isProductionEnvironment({ APP_ENV, NODE_ENV: 'production' }), false)
  }
  for (const APP_ENV of ['production', 'staging', 'preview', 'typo']) {
    assert.equal(isProductionEnvironment({ APP_ENV, NODE_ENV: 'development' }), true)
  }
  assert.equal(isProductionEnvironment({ NODE_ENV: 'production' }), true)
})
