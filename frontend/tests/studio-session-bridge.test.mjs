import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

function moduleUrl(path, replace = {}) {
  let source = readFileSync(new URL(path, import.meta.url), 'utf8')
  for (const [from, to] of Object.entries(replace)) source = source.replace(from, to)
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
  return `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`
}
const client = moduleUrl('../src/components/studio/studio-client.ts')
const themeStorage = moduleUrl('../src/components/shared/theme-storage.ts')
const { installStudioSessionBridge } = await import(moduleUrl('../src/components/studio/studio-session-bridge.ts', {
  "'./studio-client'": JSON.stringify(client),
  "'../shared/theme-storage'": JSON.stringify(themeStorage)
}))
const studioOrigin = 'https://studio.example.com'
const userId = '11111111-1111-4111-8111-111111111111'
const settle = () => new Promise(resolve => setImmediate(resolve))

function fixture(options = {}) {
  const messages = [], requests = []
  const listeners = {}
  const parent = { postMessage: (...args) => messages.push(args) }
  const host = {
    parent,
    localStorage: options.storage,
    addEventListener: (name, fn) => { listeners[name] = fn },
    removeEventListener: (name) => { delete listeners[name] }
  }
  let refreshes = 0
  const auth = {
    refresh: async () => { refreshes++; return options.refresh ? options.refresh() : 'private-token' },
    getAccessToken: () => 'private-token',
    getSnapshot: () => ({ user: { id: options.userId ?? userId } })
  }
  const stop = installStudioSessionBridge(studioOrigin, auth, host, async (url, init) => {
    requests.push({ url, init }); return new Response(null, { status: 204 })
  })
  const dispatch = (override = {}) => listeners.message?.({ source: parent, origin: studioOrigin, data: { type: 'sneepcut:renew-session', requestId: 'request-1', userId }, ...override })
  const storageEvent = (key) => listeners.storage?.({ key })
  return { messages, requests, dispatch, storageEvent, stop, refreshes: () => refreshes }
}

test('only the configured Studio parent can request owner-bound renewal', async () => {
  const f = fixture()
  f.dispatch({ origin: 'https://evil.test' }); f.dispatch({ source: {} })
  f.dispatch({ data: { type: 'sneepcut:renew-session', requestId: 'request-1', userId: 'invalid' } })
  await settle()
  assert.equal(f.refreshes(), 0)
  f.dispatch(); f.dispatch()
  await settle()
  assert.equal(f.refreshes(), 1)
  assert.equal(f.requests.length, 1)
  assert.equal(f.requests[0].url, `${studioOrigin}/sneepcut/session`)
  assert.equal(f.requests[0].init.headers.Authorization, 'Bearer private-token')
  assert.equal(f.requests[0].init.credentials, 'include')
  assert.deepEqual(f.messages.at(-1), [{ type: 'sneepcut:session-result', requestId: 'request-1', ok: true }, studioOrigin])
  assert.doesNotMatch(JSON.stringify(f.messages), /private-token/)
  f.stop()
})

test('a changed account or missing refresh cookie cannot replace the native session', async () => {
  for (const options of [{ userId: '22222222-2222-4222-8222-222222222222' }, { refresh: async () => null }]) {
    const f = fixture(options)
    f.dispatch(); await settle()
    assert.equal(f.requests.length, 0)
    assert.equal(f.messages.at(-1)[0].ok, false)
    f.stop()
  }
})

test('unmount during refresh cancels session establishment and replies', async () => {
  let resolveRefresh
  const f = fixture({ refresh: () => new Promise(resolve => { resolveRefresh = resolve }) })
  f.dispatch(); f.stop(); resolveRefresh('private-token'); await settle()
  assert.equal(f.requests.length, 0)
  assert.equal(f.messages.length, 1)
})

test('sends the saved app theme to Studio on load and whenever another app tab changes it', () => {
  let saved = 'dark'
  const f = fixture({ storage: { getItem: (key) => (key === 'theme' ? saved : null) } })
  assert.deepEqual(f.messages.at(-1), [{ type: 'sneepcut:theme', theme: 'dark' }, studioOrigin])
  saved = 'system'
  f.storageEvent('theme')
  assert.deepEqual(f.messages.at(-1), [{ type: 'sneepcut:theme', theme: 'system' }, studioOrigin])
  const count = f.messages.length
  f.storageEvent('sidebar')
  assert.equal(f.messages.length, count)
  f.stop()
  f.storageEvent('theme')
  assert.equal(f.messages.length, count)
})

test('blocked storage leaves the Studio theme unchanged', () => {
  const f = fixture()
  assert.deepEqual(f.messages.map(([data]) => data.type), ['sneepcut:session-bridge-ready'])
  f.stop()
})
