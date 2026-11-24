import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// vm-realm arrays fail deepStrictEqual against this realm; compare plain copies.
const normalise = (exports) => Object.fromEntries(Object.entries(exports).map(([name, value]) => [name, typeof value === "function" ? (...args) => structuredClone(value(...args)) : value]))

function load(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const exports = {}
  vm.runInNewContext(compiled, { exports, require: () => ({}) })
  return normalise(exports)
}

const model = load('../src/components/story/story-source-model.ts')
const validation = load('../src/components/story/story-file-validation.ts')
const GB = 1024 ** 3
const asset = (id, order, size = GB, extra = {}) => ({ id, name: `${id}.mp4`, order, size, duration: 60, ...extra })
const file = (name, size = 100) => ({ name, size })
const upload = (id, status, extra = {}) => ({ id, projectId: 'p', file: file(`${id}.mp4`, 1000), preview: '', status, bytes: 0, order: 0, ...extra })

test('rows list saved assets in order, then pending uploads, then refused files', () => {
  const rows = model.buildSourceRows(
    [asset('b', 1), asset('a', 0)],
    [upload('c', 'queued'), upload('b', 'complete'), upload('d', 'complete'), upload('e', 'uploading')],
    [{ id: 'bad', file: file('clip-vechi.avi') }]
  )
  assert.deepEqual(rows.map((row) => `${row.kind}:${row.id}`), [
    'asset:a',
    'asset:b',
    'upload:c',
    'upload:e',
    'rejected:bad'
  ])
})

test('completed uploads already saved or not saved are not shown as extra rows', () => {
  const assets = [asset('a', 0)]
  const uploads = [upload('a', 'complete'), upload('x', 'complete'), upload('y', 'queued')]
  const rows = model.buildSourceRows(assets, uploads, [])
  assert.deepEqual(rows.map((row) => `${row.kind}:${row.id}`), ['asset:a', 'upload:y'])
})

test('status mapping covers every upload state and the paused retry', () => {
  const state = (u) => model.sourceRowState({ kind: 'upload', id: u.id, upload: u })
  assert.equal(state(upload('q', 'queued')), 'waiting')
  assert.equal(state(upload('u', 'uploading')), 'uploading')
  assert.equal(state(upload('v', 'validating')), 'validating')
  assert.equal(state(upload('f', 'failed')), 'failed')
  assert.equal(state(upload('p', 'uploading', { retryAt: Date.now() + 5000 })), 'paused')
  assert.equal(model.sourceRowState({ kind: 'asset', id: 'a', asset: asset('a', 0) }), 'uploaded')
  assert.equal(model.sourceRowState({ kind: 'rejected', id: 'r', file: file('a.avi') }), 'rejected')
})

test('upload percent is the transferred share and is safe for empty files', () => {
  assert.equal(model.sourceUploadPercent(upload('a', 'uploading', { bytes: 640 })), 64)
  assert.equal(model.sourceUploadPercent(upload('a', 'uploading', { bytes: 5000 })), 100)
  assert.equal(model.sourceUploadPercent({ ...upload('z', 'queued'), file: file('z.mp4', 0), bytes: 0 }), 0)
})

test('header totals count saved and in-flight bytes but never refused files', () => {
  const rows = model.buildSourceRows(
    [asset('one', 0, 1.2 * GB), asset('two', 1, 0.98 * GB)],
    [upload('three', 'queued', { file: file('b.mov', 0.42 * GB), bytes: 0 })],
    [{ id: 'bad', file: file('clip-vechi.avi', 0.21 * GB) }]
  )
  const totals = model.sourceTotals(rows)
  assert.equal(model.formatGigabytes(totals.transferred), '2.2')
  assert.equal(model.formatGigabytes(totals.total), '2.6')
  assert.equal(model.formatGigabytes(1.8 * GB, ','), '1,8')
})

test('limit minutes round seconds for the limits panel', () => {
  assert.equal(model.formatLimitMinutes(900), 15)
  assert.equal(model.formatLimitMinutes(3600), 60)
})

test('per-file acceptance matches the format, empty and size rules', () => {
  const limits = { max_files: 0, max_file_bytes: 1000, max_total_bytes: 5000, max_source_seconds: 900, max_total_seconds: 3600 }
  assert.equal(validation.isAcceptedStoryFile(file('clip.MOV', 10), limits), true)
  assert.equal(validation.isAcceptedStoryFile(file('clip.avi', 10), limits), false)
  assert.equal(validation.isAcceptedStoryFile(file('clip.mp4', 0), limits), false)
  assert.equal(validation.isAcceptedStoryFile(file('clip.mp4', 1001), limits), false)
})
