import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const exports = {}
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/components/story/story-time.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText, { exports })

test('short scene endpoints remain distinct and rounding carries across minutes', () => {
  assert.equal(exports.formatStoryTime(0), '0:00.00')
  assert.equal(exports.formatStoryTime(0.48), '0:00.48')
  assert.equal(exports.formatStoryTime(2.5), '0:02.50')
  assert.equal(exports.formatStoryTime(59.999), '1:00.00')
  assert.equal(exports.formatStoryTime(3599.999), '1:00:00.00')
  for (const invalid of [-1, NaN, Infinity]) assert.equal(exports.formatStoryTime(invalid), '0:00.00')
})
