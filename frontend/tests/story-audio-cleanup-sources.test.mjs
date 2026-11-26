import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanupSourceAssets } from '../src/components/story/story-audio-cleanup.ts'

test('only assets with a cleanup result are compared', () => {
  const cleaned = { id: 'a', audio_cleanup: { status: 'ready' } }
  const plain = { id: 'b' }
  assert.deepEqual(cleanupSourceAssets([cleaned, plain]), [cleaned])
})

test('missing asset entries are skipped instead of throwing', () => {
  const cleaned = { id: 'a', audio_cleanup: { status: 'failed' } }
  assert.deepEqual(cleanupSourceAssets([null, undefined, cleaned]), [cleaned])
  assert.deepEqual(cleanupSourceAssets([]), [])
})
