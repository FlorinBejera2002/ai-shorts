import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as jsxRuntime from 'react/jsx-runtime'

function load(file, imports = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText, { exports, require: (name) => {
    if (!(name in imports)) throw Error(`Unexpected import ${name}`)
    return imports[name]
  } })
  return exports
}
const types = load('../src/components/story/types.ts')
const { StoryCaptionStatus } = load('../src/components/story/story-caption-status.tsx', {
  './types': types,
  './use-story-language': { useStoryLanguage: () => (english) => english },
  'react/jsx-runtime': jsxRuntime
})

test('requested captions with explicitly empty output explain the absence', () => {
  const node = StoryCaptionStatus({ version: { output: { captions: false } }, options: { captions: true } })
  assert.equal(node.props.role, 'status')
  assert.match(node.props.children, /This version has no captions/)
  assert.match(node.props.children, /Open the video in Studio/)
})

test('legacy metadata, selective silence and already displayed warnings stay quiet', () => {
  for (const [version, options] of [
    [{}, { captions: true }],
    [{ output: {} }, { captions: true }],
    [{ output: { captions: true } }, { captions: true }],
    [{ output: { captions: false } }, { caption_mode: 'off', captions: false }],
    [{ output: { captions: false } }, { caption_mode: 'selective', captions: true }],
    [{ output: { captions: false, caption_warnings: ['Withheld'] } }, { captions: true }]
  ]) assert.equal(StoryCaptionStatus({ version, options }), null)
})

test('comparison uses the rendered version caption choice', () => {
  assert.equal(StoryCaptionStatus({
    version: { output: { captions: false }, render_options: { caption_mode: 'off' } },
    options: { caption_mode: 'all' }
  }), null)
})
