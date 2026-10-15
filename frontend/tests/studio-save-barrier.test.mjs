import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/studio/studio-save-barrier.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const { flushStudioSaves, registerStudioSave, needsStudioSaveBarrier, flushStudioFrame } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`)

test('generation waits until the editor confirms pending edits are saved', async () => {
  let finish
  const saved = new Promise((resolve) => { finish = resolve })
  const unregister = registerStudioSave(() => saved)
  let complete = false
  try {
    const pending = flushStudioSaves().then(() => { complete = true })
    await new Promise((resolve) => setTimeout(resolve, 180))
    assert.equal(complete, false)
    finish()
    await pending
    assert.equal(complete, true)
  } finally { unregister() }
})

test('failed saves stop regeneration and removing a frame removes its barrier', async () => {
  const unregister = registerStudioSave(async () => { throw new Error('save conflict') })
  await assert.rejects(flushStudioSaves(), /save conflict|pending Studio edits/)
  unregister()
  await flushStudioSaves()
})

test('save synchronization covers render actions without delaying reads or metadata changes', () => {
  for (const path of ['/api/stories/id/generate', '/api/stories/id/retry', '/api/stories/id/transcript-review', '/api/clips/id/recut', '/api/clips/id/trim', '/api/clips/id/style', '/api/clips/id/transitions', '/api/workspace-agent/runs', '/api/workspace-agent/runs/id/control']) {
    assert.equal(needsStudioSaveBarrier(path, 'POST'), true, path)
    assert.equal(needsStudioSaveBarrier(path, 'GET'), false, path)
  }
  assert.equal(needsStudioSaveBarrier('/api/clips/id', 'PATCH'), false)
  assert.equal(needsStudioSaveBarrier('/api/stories', 'POST'), false)
})

test('frame acknowledgment must match origin, source, project and request', async () => {
  const previous = globalThis.window
  const target = new EventTarget()
  globalThis.window = target
  const origin = 'https://studio.example.com'
  let request
  const frame = { postMessage(value, destination) { request = value; assert.equal(destination, origin) } }
  function message(overrides = {}) {
    const event = new Event('message')
    Object.assign(event, { source: frame, origin, data: { ...request, type: 'sneepcut:project-flushed' }, ...overrides })
    target.dispatchEvent(event)
  }
  try {
    let complete = false
    const pending = flushStudioFrame(frame, origin, 'project').then(() => { complete = true })
    message({ origin: 'https://other.example.com' })
    message({ source: {} })
    message({ data: { ...request, type: 'sneepcut:project-flushed', projectId: 'another-project' } })
    await Promise.resolve()
    assert.equal(complete, false)
    message()
    await pending
    assert.equal(complete, true)
  } finally { globalThis.window = previous }
})

test('a throttled remote Studio tab must acknowledge saving even when discovery messages are delayed', async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  const previousChannel = globalThis.BroadcastChannel
  const held = new Set()
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: {
    request(name, callback) { held.add(name); return Promise.resolve().then(() => callback({ name })).finally(() => held.delete(name)) },
    async query() { return { held: [...held].map((name) => ({ name })), pending: [] } }
  } } })
  const channels = new Set()
  globalThis.BroadcastChannel = class {
    constructor(name) { this.name = name; channels.add(this) }
    postMessage(data) {
      for (const target of channels) if (target !== this && target.name === this.name) {
        setTimeout(() => { if (channels.has(target)) target.onmessage?.({ data }) }, data.type === 'flush' ? 300 : 0)
      }
    }
    close() { channels.delete(this) }
  }
  const remote = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}#remote`)
  let finishSave
  let started = false
  let completed = false
  const saved = new Promise((resolve) => { finishSave = resolve })
  const unregister = remote.registerStudioSave(async () => { started = true; await saved })
  try {
    const pending = flushStudioSaves().then(() => { completed = true })
    await new Promise((resolve) => setTimeout(resolve, 220))
    assert.equal(started, false)
    assert.equal(completed, false)
    await new Promise((resolve) => setTimeout(resolve, 150))
    assert.equal(started, true)
    assert.equal(completed, false)
    finishSave()
    await pending
    assert.equal(completed, true)
  } finally {
    unregister()
    globalThis.BroadcastChannel = previousChannel
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator)
    else delete globalThis.navigator
  }
})
