import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cleanupFootageIDs,
  footageNumbers,
  storyFootage,
  toggleCleanupFootage
} from '../src/components/story/story-footage.ts'

const asset = (id, order, kind = 'video') => ({ id, order, kind, name: `${id}.mp4` })
const assets = [
  asset('c', 2),
  asset('narr', 0, 'narration'),
  asset('a', 0),
  asset('b', 1)
]

test('footage numbering follows the footage order and ignores narration recordings', () => {
  const footage = storyFootage(assets)
  assert.deepEqual(footage.map((item) => item.id), ['a', 'b', 'c'])
  const numbers = footageNumbers(footage)
  assert.equal(numbers.get('a'), 1)
  assert.equal(numbers.get('b'), 2)
  assert.equal(numbers.get('c'), 3)
  assert.equal(numbers.has('narr'), false)
})

test('an empty or stale noise selection means every footage asset', () => {
  const footage = storyFootage(assets)
  assert.deepEqual(cleanupFootageIDs(footage), ['a', 'b', 'c'])
  assert.deepEqual(cleanupFootageIDs(footage, []), ['a', 'b', 'c'])
  assert.deepEqual(cleanupFootageIDs(footage, ['gone']), ['a', 'b', 'c'])
  assert.deepEqual(cleanupFootageIDs(footage, ['c', 'a', 'gone']), ['a', 'c'])
})

test('toggling noise footage writes an explicit list in footage order', () => {
  const footage = storyFootage(assets)
  assert.deepEqual(toggleCleanupFootage(footage, [], 'b'), ['a', 'c'])
  assert.deepEqual(toggleCleanupFootage(footage, ['a', 'c'], 'b'), ['a', 'b', 'c'])
  assert.deepEqual(toggleCleanupFootage(footage, ['a', 'b', 'c'], 'c'), ['a', 'b'])
})

test('the last selected footage asset cannot be removed, so the save never means all by accident', () => {
  const footage = storyFootage(assets)
  assert.deepEqual(toggleCleanupFootage(footage, ['b'], 'b'), ['b'])
  assert.deepEqual(toggleCleanupFootage(footage, ['gone'], 'a'), ['b', 'c'])
})
