import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
const source = readFileSync(new URL('../src/components/story/story-retry.ts', import.meta.url), 'utf8')
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports })
const plain = (value) => JSON.parse(JSON.stringify(value))

test('initial recovery confirms every retained source in stable project order', () => {
  const project = { current_version: 0, assets: [{ id: 'video-b' }, { id: 'voice' }, { id: 'video-a' }] }
  assert.deepEqual(plain(exports.storyRetryPayload(project)), { asset_ids: ['video-b', 'voice', 'video-a'] })
})

test('existing result recovery preserves the exact block/candidate operation', () => {
  const project = { current_version: 3, assets: [], expected_state: 'new-state' }
  const payload = { action: 'alternate', version: 3, block_id: 'block-b', candidate_id: 'candidate-c' }
  const operation = { action: payload.action, version: 3, payload }
  const snapshot = structuredClone(operation)
  assert.deepEqual(plain(exports.storyRetryPayload(project, operation)), { ...payload, expected_state: 'new-state' })
  assert.deepEqual(operation, snapshot)
})

test('appearance recovery retains choices while refreshing the concurrency guard', () => {
  const style = { audio_cleanup: { enabled: false }, caption_mode: 'off', use_brand_kit: true }
  const operation = { action: 'restyle', version: 4, payload: { action: 'restyle', version: 4, style, expected_state: 'before-failure' } }
  const project = { current_version: 4, assets: [], expected_state: 'after-failure' }
  assert.deepEqual(plain(exports.storyRetryPayload(project, operation)), { action: 'restyle', version: 4, style, expected_state: 'after-failure' })
  assert.equal(exports.storyRetryPayload({ ...project, expected_state: undefined }, operation), undefined)
})

test('refresh or a newer saved version never guesses another edit to retry', () => {
  const project = { current_version: 7, assets: [], expected_state: 'current-state' }
  assert.equal(exports.storyRetryPayload(project), undefined)
  assert.equal(exports.storyRetryPayload(project, { action: 'faster', version: 6, payload: { action: 'faster', version: 6 } }), undefined)
})