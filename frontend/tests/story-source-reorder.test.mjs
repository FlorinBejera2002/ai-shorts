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
  vm.runInNewContext(compiled, { exports })
  return normalise(exports)
}

const { moveItem, dropIndexFromCentres, reorderSequence, clampIndex } = load('../src/components/story/story-source-reorder.ts')

test('moveItem moves an item forward and backward without mutating the input', () => {
  const input = ['a', 'b', 'c', 'd']
  assert.deepEqual(moveItem(input, 0, 2), ['b', 'c', 'a', 'd'])
  assert.deepEqual(moveItem(input, 3, 0), ['d', 'a', 'b', 'c'])
  assert.deepEqual(input, ['a', 'b', 'c', 'd'])
})

test('moveItem clamps targets outside the list and ignores missing sources', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 99), ['b', 'c', 'a'])
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, -4), ['c', 'a', 'b'])
  assert.deepEqual(moveItem(['a'], 5, 0), ['a'])
})

test('clampIndex keeps indexes inside an empty or non-empty list', () => {
  assert.equal(clampIndex(-1, 3), 0)
  assert.equal(clampIndex(7, 3), 2)
  assert.equal(clampIndex(4, 0), 0)
})

test('dropIndexFromCentres counts other rows above the pointer', () => {
  const centres = [20, 80, 140]
  assert.equal(dropIndexFromCentres(centres, 10), 0)
  assert.equal(dropIndexFromCentres(centres, 100), 2)
  assert.equal(dropIndexFromCentres(centres, 999), 3)
})

test('reorderSequence shows the slot with the lifted row at the target position', () => {
  // Third file lifted above the second: row 1, slot (lifted row), row 2.
  assert.deepEqual(reorderSequence(3, 2, 1), [
    { kind: 'row', index: 0 },
    { kind: 'slot', index: 2 },
    { kind: 'row', index: 1 }
  ])
})

test('reorderSequence keeps every row exactly once at the ends and for a single row', () => {
  assert.deepEqual(reorderSequence(3, 0, 0).map((entry) => entry.kind), ['slot', 'row', 'row'])
  assert.deepEqual(reorderSequence(3, 0, 2), [
    { kind: 'row', index: 1 },
    { kind: 'row', index: 2 },
    { kind: 'slot', index: 0 }
  ])
  assert.deepEqual(reorderSequence(1, 0, 0), [{ kind: 'slot', index: 0 }])
})

test('a committed move matches the board: the sequence order equals moveItem order', () => {
  const ids = ['one', 'two', 'three', 'four']
  for (let from = 0; from < ids.length; from += 1)
    for (let to = 0; to < ids.length; to += 1) {
      const board = reorderSequence(ids.length, from, to).map((entry) => ids[entry.index])
      assert.deepEqual(board, moveItem(ids, from, to), `from ${from} to ${to}`)
    }
})
