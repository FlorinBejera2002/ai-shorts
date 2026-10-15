import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

test('slow validation overlaps the next transfers while the pipeline remains bounded', async () => {
  const source = readFileSync(new URL('../src/components/story/use-story-uploads.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const states = []; const refs = []; const effects = []
  let stateIndex = 0; let refIndex = 0
  const transfers = new Map(); const validations = new Map(); const signals = []
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
  const api = {
    uploadStoryFile: (file, signal) => {
      signals.push(signal)
      return new Promise(resolve => transfers.set(file.name, () => resolve(`owned/${file.name}`)))
    },
    storyRequest: (_path, _method, body) => new Promise(resolve => validations.set(body.name, () => resolve({ id: 'project' })))
  }
  const exports = {}
  vm.runInNewContext(compiled, {
    exports, require: name => name === 'react' ? react : api,
    AbortController, crypto: globalThis.crypto, queueMicrotask,
    URL: { createObjectURL: file => `blob:${file.name}`, revokeObjectURL: () => {} }
  })
  const render = () => {
    stateIndex = refIndex = 0; effects.length = 0
    const uploads = exports.useStoryUploads('project', async () => {})
    effects.at(-1)()
    return uploads
  }
  let uploads = render()
  uploads.add(Array.from({ length: 6 }, (_, index) => ({ name: `${index}.mov`, size: 100 })))
  render()
  assert.equal(transfers.size, 2)
  const cleanup = effects[0]()
  cleanup()
  effects[0]() // React's development reconnect must preserve the transfers.
  await new Promise(setImmediate)
  assert.equal(signals.some(signal => signal.aborted), false)
  transfers.get('0.mov')(); transfers.get('1.mov')()
  await new Promise(setImmediate)
  render()
  assert.equal(validations.size, 2)
  assert.equal(transfers.size, 4, 'next bytes transfer while the first files are still validating')
  transfers.get('2.mov')(); transfers.get('3.mov')()
  await new Promise(setImmediate)
  render()
  assert.equal(validations.size, 4)
  assert.equal(transfers.size, 4, 'at most four unfinished uploads may enter validation')
  validations.get('0.mov')(); validations.get('1.mov')()
  await new Promise(setImmediate)
  render()
  assert.equal(transfers.size, 6)
  transfers.get('4.mov')(); transfers.get('5.mov')()
  await new Promise(setImmediate)
  for (const finish of validations.values()) finish()
  await new Promise(setImmediate)
  uploads = render()
  assert.equal(uploads.busy, false)
  assert.equal(uploads.items.every(item => item.status === 'complete'), true)
})
