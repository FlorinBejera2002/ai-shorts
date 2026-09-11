import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/studio/studio-session-renewal.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const { startStudioSessionRenewal } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`)

function timerQueue() {
  const timers = []
  return { timers, schedule: (callback, delay) => {
    const entry = { callback, delay, cancelled: false }
    timers.push(entry)
    return () => { entry.cancelled = true }
  } }
}

test('renews sequentially before expiry without overlapping resume events', async () => {
  const { timers, schedule } = timerQueue()
  let calls = 0
  let finish
  const renewal = startStudioSessionRenewal(async () => { calls++; await new Promise(resolve => { finish = resolve }) }, assert.fail, schedule)
  assert.equal(timers[0].delay, 240000)
  assert.equal(calls, 0)
  const first = renewal.renewNow()
  await renewal.renewNow()
  assert.equal(calls, 1)
  finish()
  await first
  assert.equal(timers.length, 2)
  assert.equal(timers[0].cancelled, true)
  renewal.stop()
  assert.equal(timers[1].cancelled, true)
  await renewal.renewNow()
  assert.equal(calls, 1)
})

test('cleanup aborts active renewal and suppresses late callbacks', async () => {
  const { timers, schedule } = timerQueue()
  let signal
  let reject
  const failures = []
  const renewal = startStudioSessionRenewal(async value => { signal = value; await new Promise((_resolve, fail) => { reject = fail }) }, error => failures.push(error), schedule)
  const pending = renewal.renewNow()
  renewal.stop()
  assert.equal(signal.aborted, true)
  reject(new Error('late failure'))
  await pending
  assert.equal(failures.length, 0)
  assert.equal(timers.length, 1)
})

test('reports renewal failures so the caller can hide an expired workspace', async () => {
  const { schedule } = timerQueue()
  const failures = []
  const renewal = startStudioSessionRenewal(async () => { throw new Error('Session expired') }, error => failures.push(error.message), schedule)
  await renewal.renewNow()
  assert.deepEqual(failures, ['Session expired'])
  renewal.stop()
})
