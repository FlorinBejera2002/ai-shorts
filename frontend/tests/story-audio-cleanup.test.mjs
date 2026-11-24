import assert from 'node:assert/strict'
import test from 'node:test'
import { withAvailableCleanup } from '../src/components/story/story-audio-cleanup.ts'
import { storyProblem } from '../src/components/story/story-error.ts'

const en = (value) => value
const options = { brief: '', audio_cleanup: { enabled: true, asset_ids: ['a'] } }

test('noise reduction is turned off when the server cannot run it', () => {
  assert.deepEqual(withAvailableCleanup(options, false).audio_cleanup, { enabled: false, asset_ids: ['a'] })
})

test('noise reduction is kept when the server can run it', () => {
  assert.equal(withAvailableCleanup(options, true), options)
})

test('the unavailable noise reduction refusal names the cause', () => {
  const message = storyProblem(
    'Background noise reduction is unavailable. Turn it off to continue with original audio',
    en
  )
  assert.match(message, /noise reduction is unavailable/i)
})
