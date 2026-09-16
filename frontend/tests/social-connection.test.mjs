import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function compile(path) {
  return ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      }
    }
  ).outputText
}
const source = compile('../src/lib/social-connection.ts')
const publishing = {}
vm.runInNewContext(compile('../src/lib/publishing.ts'), { exports: publishing })

function fixture(search = '') {
  const exports = {}
  const storage = new Map()
  const listeners = new Map()
  const timers = new Map()
  const channels = []
  let nextTimer = 0
  let closed = false
  let replaced = ''
  const window = {
    location: {
      search,
      origin: 'https://app.example',
      href: `https://app.example/dashboard/publish${search}`
    },
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key)
    },
    history: {
      state: { retained: true },
      replaceState: (_state, _unused, url) => {
        replaced = url
      }
    },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
    setTimeout: (callback, ms) => {
      timers.set(++nextTimer, { callback, ms })
      return nextTimer
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (callback, ms) => {
      timers.set(++nextTimer, { callback, ms })
      return nextTimer
    },
    clearInterval: (id) => timers.delete(id),
    close: () => {
      closed = true
    },
    opener: null
  }
  class BroadcastChannel {
    constructor(name) {
      this.name = name
      this.sent = []
      channels.push(this)
    }
    addEventListener(_name, listener) {
      this.listener = listener
    }
    postMessage(message) {
      this.sent.push(message)
    }
    close() {
      this.closed = true
    }
  }
  vm.runInNewContext(source, {
    exports,
    require: () => publishing,
    window,
    URL,
    URLSearchParams,
    Date,
    BroadcastChannel,
    crypto: { randomUUID: () => 'request-1' }
  })
  return {
    exports,
    window,
    storage,
    listeners,
    timers,
    channels,
    closed: () => closed,
    replaced: () => replaced
  }
}

test('only supported successful callbacks animate; errors take precedence', () => {
  const { readSocialConnectionResult: read } = fixture().exports
  for (const { id } of publishing.PUBLISHING_PROVIDER_CATALOG)
    assert.equal(read(`?connected=${id}`).provider, id)
  for (const input of [
    '',
    '?connected=unknown',
    '?connected=__proto__',
    '?connected=toString'
  ])
    assert.equal(read(input), null)
  assert.equal(
    read('?connected=instagram&connectionError=denied').error,
    'denied'
  )
})

test('a stale pending intent never confirms an abandoned connection', async () => {
  const f = fixture()
  f.storage.set('sneepcut:pending-social-connection', 'instagram')
  assert.equal(await f.exports.completeSocialConnection(), null)
  assert.equal(f.replaced(), '')
})

test('same-tab success consumes only callback parameters without reloading', async () => {
  const f = fixture('?connected=facebook&keep=1#accounts')
  assert.equal(
    (await f.exports.completeSocialConnection()).provider,
    'facebook'
  )
  assert.equal(f.replaced(), '/dashboard/publish?keep=1#accounts')
  assert.equal(f.closed(), false)
})

test('popup only accepts the current request, provider and trusted source', () => {
  const f = fixture()
  const results = []
  const popup = {
    sessionStorage: { setItem: () => undefined },
    postMessage: () => undefined,
    closed: false
  }
  f.exports.listenForSocialConnection(
    popup,
    'instagram',
    (result) => results.push(result),
    () => undefined
  )
  const receive = f.listeners.get('message')
  const data = {
    id: 'request-1',
    type: 'result',
    result: { provider: 'instagram' }
  }
  receive({ origin: 'https://evil.example', source: popup, data })
  receive({ origin: f.window.location.origin, source: {}, data })
  receive({
    origin: f.window.location.origin,
    source: popup,
    data: { ...data, id: 'old-request' }
  })
  receive({
    origin: f.window.location.origin,
    source: popup,
    data: { ...data, result: { provider: 'facebook' } }
  })
  assert.equal(results.length, 0)
  receive({ origin: f.window.location.origin, source: popup, data })
  assert.equal(results[0].provider, 'instagram')
  assert.equal(f.channels[0].sent[0].type, 'received')
  assert.equal(f.listeners.size, 0)
  assert.equal(f.timers.size, 0)
})

test('closed popup unlocks controls while the channel can finish isolated OAuth', () => {
  const f = fixture()
  let unlocked = false
  let result
  const popup = { sessionStorage: { setItem: () => undefined }, closed: true }
  f.exports.listenForSocialConnection(
    popup,
    'facebook',
    (value) => {
      result = value
    },
    () => {
      unlocked = true
    }
  )
  Array.from(f.timers.values())
    .find((timer) => timer.ms === 500)
    .callback()
  assert.equal(unlocked, true)
  assert.equal(result, undefined)
  f.channels[0].listener({
    data: { id: 'request-1', type: 'result', result: { provider: 'facebook' } }
  })
  assert.equal(result.provider, 'facebook')
  assert.equal(f.timers.size, 0)
})

test('callback closes only after acknowledgement, otherwise confirms locally', async () => {
  for (const acknowledge of [true, false]) {
    const f = fixture('?connected=instagram')
    f.storage.set(
      'sneepcut:social-connection-request',
      JSON.stringify({ id: 'request-1', createdAt: Date.now() })
    )
    const completion = f.exports.completeSocialConnection()
    assert.equal(f.closed(), false)
    if (acknowledge)
      f.channels[0].listener({ data: { id: 'request-1', type: 'received' } })
    else [...f.timers.values()][0].callback()
    const result = await completion
    assert.equal(f.closed(), acknowledge)
    assert.equal(
      acknowledge ? result : result.provider,
      acknowledge ? null : 'instagram'
    )
    assert.equal(f.storage.has('sneepcut:social-connection-request'), false)
    assert.equal(f.channels[0].closed, true)
  }
})
