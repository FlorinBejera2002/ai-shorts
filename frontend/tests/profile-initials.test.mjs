import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const exports = {}
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/profile-initials.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports, Intl })
const { firstNameInitials } = exports
test('uses two letters from the first name, not first and last initials', () => {
  assert.equal(firstNameInitials('Florin Popescu'), 'FL')
  assert.equal(firstNameInitials('  Ana   Maria  '), 'AN')
  assert.equal(firstNameInitials('\u0218tefan Ionescu'), '\u0218T')
})
test('handles missing, short and decomposed names', () => {
  assert.equal(firstNameInitials(null), '?')
  assert.equal(firstNameInitials(' '), '?')
  assert.equal(firstNameInitials('A Popescu'), 'A')
  assert.equal(firstNameInitials('S\u0326tefan').normalize('NFC'), '\u0218T')
})
