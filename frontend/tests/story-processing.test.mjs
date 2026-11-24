import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTsModule } from './support/load-ts-module.mjs'

// Stage and card behaviour lives in creare-processing-model.test.mjs and creare-processing-result.test.mjs.
// This file keeps the customer-facing failure copy that the upload processing card shows.
const storyError = loadTsModule('src/components/story/story-error.ts')
const text = (english) => english

test('failed API project message reaches the localized alert without requiring an error field', () => {
  const message = 'AI provider API-key spending limit was reached. Uploaded clips and saved versions are retained.'
  const rendered = storyError.storyProblem(storyError.storyFailureReason({ status: 'failed', message }), text)
  assert.match(rendered, /editing service has reached its usage limit/)
  assert.doesNotMatch(rendered, /API-key|enough credits to generate/)
  assert.equal(storyError.storyFailureReason({ status: 'ready', message }), undefined)
  assert.equal(storyError.storyFailureReason({ status: 'ready', operation_status: 'failed', message }), message)
})

test('planning recovery distinguishes provider funds from app credits and missing music', () => {
  const billing = storyError.storyProblem('story planning could not finish: AI provider credit or API-key spending limit was reached', text)
  assert.match(billing, /editing service has reached its usage limit/)
  assert.doesNotMatch(billing, /enough credits to generate|choose another track/)
  assert.match(storyError.storyProblem('story planning could not finish; sources and previous video are preserved', text), /before rendering/)
  assert.match(storyError.storyProblem('source analysis could not establish visual content for music-guided editing', text), /Retry analysis/)
})

test('music analysis errors offer deliberate recovery instead of falsely reporting missing music', () => {
  const message = storyError.storyProblem('selected music analysis is unavailable; retry', text)
  assert.match(message, /turn off Follow the music/)
  assert.match(message, /same soundtrack/)
  assert.doesNotMatch(message, /choose another track/)
  assert.match(storyError.storyProblem('music-only conflicts with preserving speech', text), /Keep original sound/)
})

