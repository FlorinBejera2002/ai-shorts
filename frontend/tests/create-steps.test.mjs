import assert from 'node:assert/strict'
import test from 'node:test'
import {
  creationStepCounter,
  creationStepItems,
  creationStepLabels,
  creationStepSegments
} from '../src/components/story/create-steps.ts'

const english = (en) => en
const romanian = (_en, ro) => ro

test('creation step labels follow the active language', () => {
  assert.deepEqual([...creationStepLabels(english)], ['Add footage', 'Choose result', 'Generate'])
  assert.deepEqual([...creationStepLabels(romanian)], ['Adaugă filmări', 'Alege rezultatul', 'Generează'])
})

test('done, current and upcoming states follow the selected step', () => {
  const labels = ['A', 'B', 'C']
  const items = creationStepItems({ step: 1, furthest: 1, disabled: false, labels })
  assert.deepEqual(items.map((item) => item.state), ['done', 'current', 'upcoming'])
  assert.deepEqual(items.map((item) => item.index), [0, 1, 2])
})

test('only steps already reached are reachable, and never the current one', () => {
  const labels = ['A', 'B', 'C']
  const reachable = creationStepItems({ step: 1, furthest: 1, disabled: false, labels })
    .map((item) => item.reachable)
  assert.deepEqual(reachable, [true, false, false])
  const afterReview = creationStepItems({ step: 0, furthest: 2, disabled: false, labels })
    .map((item) => item.reachable)
  assert.deepEqual(afterReview, [false, true, true])
})

test('a running operation disables every step', () => {
  const items = creationStepItems({ step: 0, furthest: 2, disabled: true, labels: ['A', 'B', 'C'] })
  assert.ok(items.every((item) => !item.reachable))
})

test('mobile segments fill up to the current step inclusive', () => {
  assert.deepEqual(creationStepSegments(0), [true, false, false])
  assert.deepEqual(creationStepSegments(1), [true, true, false])
  assert.deepEqual(creationStepSegments(2), [true, true, true])
})

test('mobile counter reads "Pasul N din 3" in Romanian', () => {
  assert.equal(creationStepCounter(0, romanian), 'Pasul 1 din 3')
  assert.equal(creationStepCounter(2, romanian), 'Pasul 3 din 3')
  assert.equal(creationStepCounter(1, english), 'Step 2 of 3')
})
