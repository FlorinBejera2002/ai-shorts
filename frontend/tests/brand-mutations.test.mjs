import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/app/api/user/brand/route.ts', import.meta.url), 'utf8')
function route({ authenticated = true, plan = 'free' } = {}) {
  const writes = []
  const prisma = {
    user: { findUnique: async () => ({ plan }) },
    brandKit: { upsert: async args => { writes.push(args); return args.create } }
  }
  const modules = {
    'next/server': { NextResponse: { json: (value, options) => Response.json(value, options) } },
    '@/lib/auth': { auth: async () => authenticated ? { user: { id: 'owner' } } : null },
    '@/lib/db': { createPrismaClient: () => prisma },
    '@/lib/brand-logo': { withFreshBrandLogo: async value => value },
    '@/lib/rate-limit': { rateLimit: async () => ({ limited: false }), rateLimitKey: () => 'test' },
    '@/lib/request-body': { readBoundedJson: request => request.json(), RequestBodyTooLargeError: class extends Error {} }
  }
  const exports = {}
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => { assert.ok(modules[name], name); return modules[name] } })
  return { writes, put: body => exports.PUT(new Request('http://localhost/api/user/brand', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })) }
}

test('brand mutation rejects anonymous callers without database writes', async () => {
  const api = route({ authenticated: false })
  assert.equal((await api.put({ primaryColor: '#112233' })).status, 401)
  assert.equal(api.writes.length, 0)
})

test('brand mutation rejects ownership/system fields and malformed values', async () => {
  const api = route()
  for (const body of [null, [], {}, { userId: 'other' }, { id: 'other' }, { createdAt: 'now' },
    { logoPath: 'brand/other/logo.png' }, { watermarkOpacity: 2 }, { primaryColor: 'red' },
    { subtitleFont: 'Arial,Fontsize=999' }, { subtitlePosition: 'outside' }, { hidePlatformBadge: 'true' }]) {
    assert.equal((await api.put(body)).status, 400, JSON.stringify(body))
  }
  assert.equal(api.writes.length, 0)
})

test('badge removal is rejected for free accounts and accepted for agency', async () => {
  assert.equal((await route().put({ hidePlatformBadge: true })).status, 403)
  assert.equal((await route({ plan: 'agency' }).put({ hidePlatformBadge: true })).status, 200)
})

test('valid brand fields are normalized and persisted only for the session owner', async () => {
  const api = route()
  assert.equal((await api.put({ primaryColor: '#aabbcc', subtitleFont: 'Inter Bold', watermarkOpacity: 0.4 })).status, 200)
  assert.equal(api.writes[0].where.userId, 'owner')
  assert.equal(api.writes[0].create.userId, 'owner')
  assert.equal(api.writes[0].update.primaryColor, '#AABBCC')
})
