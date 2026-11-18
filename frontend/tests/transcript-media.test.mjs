import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL('../src/components/story/transcript-media.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText,
  { exports, URL }
)
const identity = exports.transcriptMediaIdentity

test('renewed local and S3 signatures retain the recording identity', () => {
  assert.equal(identity('/media/clip.mp4?expires=100&sig=one'), identity('/media/clip.mp4?expires=200&sig=two'))
  assert.equal(identity('https://storage.example/clip.mp4?X-Amz-Date=first&X-Amz-Signature=one'), identity('https://storage.example/clip.mp4?X-Amz-Date=second&X-Amz-Signature=two'))
})

test('real source, host and content-query changes replace the recording', () => {
  assert.notEqual(identity('/media/one.mp4'), identity('/media/two.mp4'))
  assert.notEqual(identity('https://one.example/clip.mp4'), identity('https://two.example/clip.mp4'))
  assert.notEqual(identity('/media/clip.mp4?version=1&sig=one'), identity('/media/clip.mp4?version=2&sig=two'))
})
