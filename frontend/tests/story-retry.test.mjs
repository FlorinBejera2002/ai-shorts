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

test('completed results never retry local editing operations', () => {
  const project = { current_version: 7, assets: [], expected_state: 'current-state' }
  assert.equal(exports.storyRetryPayload(project), undefined)
})
