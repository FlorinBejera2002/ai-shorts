import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/story/story-file-validation.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const exports = {}
vm.runInNewContext(compiled, { exports })
const limits = { max_files: 0, max_file_bytes: 1000, max_total_bytes: 50000 }
const file = (name = 'clip.mp4', size = 100) => ({ name, size })

test('both upload entry points admit more than 200 clips within resource budgets', () => {
  assert.equal(exports.validateStoryFiles(Array.from({ length: 250 }, () => file()), [], [], limits), '')
  assert.equal(exports.validateStoryFiles([file()], Array.from({ length: 200 }, () => file()), [], limits), '')
})

test('file format and byte budgets include saved and pending uploads', () => {
  assert.match(exports.validateStoryFiles([file('clip.exe')], [], [], limits), /unsupported/)
  assert.match(exports.validateStoryFiles([file('clip.mp4', 1001)], [], [], limits), /file size/)
  assert.match(exports.validateStoryFiles([file('clip.mp4', 0)], [], [], limits), /empty/)
  assert.match(exports.validateStoryFiles([file()], [{ size: 49900 }], [file()], limits), /total size/)
})
