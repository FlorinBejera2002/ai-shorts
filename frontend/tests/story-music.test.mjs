import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(ts.transpileModule(
  readFileSync(new URL('../src/components/story/types.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText, { exports })
const { defaultOptions, storyOptionsEqual } = exports

test('legacy drafts treat omitted and cleared music equally, without adding music by default', () => {
  assert.equal(defaultOptions.music, undefined)
  assert.equal(storyOptionsEqual(defaultOptions, { ...defaultOptions, music: null }), true)
})

test('saving a music choice tracks its identity, volume and sync independently', () => {
  const saved = { ...defaultOptions, music: { track_id: 'incompetech:one', volume: 0.18, sync: true } }
  assert.equal(storyOptionsEqual(structuredClone(saved), saved), true)
  for (const music of [
    null,
    { ...saved.music, track_id: 'incompetech:two' },
    { ...saved.music, volume: 0 },
    { ...saved.music, sync: false }
  ]) {
    assert.equal(storyOptionsEqual({ ...saved, music }, saved), false)
  }
  assert.equal(storyOptionsEqual(saved, defaultOptions), false)
})
