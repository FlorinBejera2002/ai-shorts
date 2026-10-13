import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

test('queued uploads and registration retries retain their original story after navigation', async () => {
  const source = readFileSync(new URL('../src/components/story/use-story-uploads.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const states = []; const refs = []; const effects = []
  let stateIndex = 0; let refIndex = 0
  const transfers = new Map(); const registrations = []; const refreshed = []
  const react = {
    useState: initial => {
      const index = stateIndex++
      if (!(index in states)) states[index] = initial
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
    },
    useRef: initial => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }),
    useCallback: value => value,
    useEffect: callback => effects.push(callback)
  }
  let registrationFailed = false
  const api = {
    uploadStoryFile: file => new Promise(resolve => transfers.set(file.name, () => resolve(`owned/${file.name}`))),
    storyRequest: async (path, method, body) => {
      registrations.push({ path, method, body })
      if (body.name === 'third.mp4' && !registrationFailed) {
        registrationFailed = true
        throw new Error('Registration connection lost')
      }
      return { id: path.split('/')[3] }
    }
  }
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    require: name => name === 'react' ? react : api,
    Map, AbortController, Error, crypto: globalThis.crypto, queueMicrotask,
    URL: { createObjectURL: file => `blob:${file.name}`, revokeObjectURL: () => {} }
  })
  const renderUploads = exports.useStoryUploads
  let project = 'original-story'
  const refresh = async value => { refreshed.push(value.id) }
  const render = () => {
    stateIndex = 0; refIndex = 0; effects.length = 0
    const uploads = renderUploads(project, refresh)
    effects.at(-1)()
    return uploads
  }
  let uploads = render()
  uploads.add(['first.mp4', 'second.mp4', 'third.mp4'].map(name => ({ name, size: 100 })))
  render()
  assert.equal(transfers.size, 2)
  project = 'different-story'
  render()
  transfers.get('first.mp4')(); transfers.get('second.mp4')()
  await new Promise(setImmediate)
  render()
  assert.equal(transfers.size, 3)
  transfers.get('third.mp4')()
  await new Promise(setImmediate)
  uploads = render()
  const failed = uploads.items.find(item => item.status === 'failed')
  assert.equal(failed.projectId, 'original-story')
  uploads.retry(failed.id)
  render()
  await new Promise(setImmediate)
  uploads = render()
  assert.equal(uploads.busy, false)
  assert.equal(uploads.items.every(item => item.status === 'complete'), true)
  assert.equal(registrations.length, 4)
  assert.equal(registrations.every(item => item.path === '/api/stories/original-story/assets'), true)
  assert.equal(registrations[2].body.id, registrations[3].body.id)
  assert.equal(registrations[2].body.reference, registrations[3].body.reference)
  assert.deepEqual(refreshed, ['original-story', 'original-story', 'original-story'])
})
