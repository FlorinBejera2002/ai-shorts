import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function transport() {
  let user = { id: 'first' }, response = Promise.resolve({ ok: true }), invalidations = []
  const client = {
    getSnapshot: () => ({ status: 'authenticated', user }),
    getAccessToken: () => 'synthetic',
    subscribe: () => {},
    apiFetch: () => response
  }
  const exports = {}
  const imports = {
    '@/lib/auth-client': { createAuthClient: () => client },
    '../stores/auth-store': { publishAuthState: () => {} },
    '../query/query-client': { queryClient: {
      clear: () => {},
      invalidateQueries: value => { invalidations.push([...value.queryKey]); return Promise.resolve() }
    } },
    './account-credits': { accountCreditsKey: id => ['account-credits', id] }
  }
  const source = readFileSync(new URL('../src/lib/auth.ts', import.meta.url), 'utf8')
    .replace("import.meta.env.VITE_API_URL ?? ''", "''")
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, { exports, URLSearchParams, require: name => {
    assert.ok(name in imports, `Unexpected import ${name}`)
    return imports[name]
  } })
  return {
    request: exports.apiFetch,
    invalidations: () => invalidations,
    respond: value => { response = value },
    account: value => { user = value }
  }
}

test('successful mutations refresh only the current account balance without consuming the response', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
    const t = transport(), response = new Response('original body')
    t.respond(Promise.resolve(response))
    assert.equal(await t.request('/api/test', { method }), response)
    assert.equal(await response.text(), 'original body')
    assert.deepEqual(t.invalidations(), [['account-credits', 'first']])
  }
})

test('reads and failed mutations do not trigger extra balance requests', async () => {
  for (const init of [{}, { method: 'GET' }, { method: 'HEAD' }, { method: 'OPTIONS' }]) {
    const t = transport()
    await t.request('/api/test', init)
    assert.deepEqual(t.invalidations(), [])
  }
  const t = transport()
  t.respond(Promise.resolve(new Response('failure', { status: 503 })))
  await t.request('/api/test', { method: 'POST' })
  assert.deepEqual(t.invalidations(), [])
})

test('an old account mutation cannot refresh or contaminate a newly signed-in account', async () => {
  const t = transport()
  let finish
  t.respond(new Promise(resolve => { finish = resolve }))
  const pending = t.request('/api/test', { method: 'POST' })
  t.account({ id: 'second' })
  finish({ ok: true })
  await pending
  assert.deepEqual(t.invalidations(), [])
})

test('anonymous mutations and transport failures preserve existing cache state', async () => {
  const t = transport()
  t.account(null)
  await t.request('/api/test', { method: 'POST' })
  t.respond(Promise.reject(new Error('offline')))
  await assert.rejects(t.request('/api/test', { method: 'POST' }), /offline/)
  assert.deepEqual(t.invalidations(), [])
})
