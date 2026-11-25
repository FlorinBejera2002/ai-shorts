import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTsModule } from './support/load-ts-module.mjs'

const schedule = loadTsModule('src/components/feedback/clip-feedback-schedule.ts')

function memoryStorage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) }
}

test('the clip prompt is asked once per job and then pauses', () => {
  const storage = memoryStorage()
  const now = Date.UTC(2026, 10, 24)
  assert.equal(schedule.shouldAskClipFeedback('job-a', now, storage), true)
  schedule.settleClipFeedback('job-a', 'answered', now, storage)
  assert.equal(schedule.shouldAskClipFeedback('job-a', now + schedule.DISMISSED_PAUSE_MS * 2, storage), false)
  assert.equal(schedule.shouldAskClipFeedback('job-b', now + 1000, storage), false)
  assert.equal(schedule.shouldAskClipFeedback('job-b', now + schedule.ANSWERED_PAUSE_MS, storage), true)
})

test('"Not now" pauses the prompt longer than an answer', () => {
  const storage = memoryStorage()
  const now = Date.UTC(2026, 10, 24)
  schedule.settleClipFeedback('job-a', 'dismissed', now, storage)
  assert.equal(schedule.shouldAskClipFeedback('job-b', now + schedule.ANSWERED_PAUSE_MS, storage), false)
  assert.equal(schedule.shouldAskClipFeedback('job-b', now + schedule.DISMISSED_PAUSE_MS, storage), true)
})

test('missing or broken storage still lets the prompt show', () => {
  assert.equal(schedule.shouldAskClipFeedback('job-a', 0, null), true)
  const broken = { getItem: () => '{not json', setItem: () => { throw new Error('quota') } }
  assert.equal(schedule.shouldAskClipFeedback('job-a', 0, broken), true)
  assert.doesNotThrow(() => schedule.settleClipFeedback('job-a', 'answered', 0, broken))
})
