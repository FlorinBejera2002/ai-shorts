import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseBrief,
  pruneBriefFootage,
  removeFootageReferences,
  serializeBrief
} from '../src/components/story/story-brief-tokens.ts'

const brief =
  'Începe cu @[asset:a1] și păstrează partea cu @[asset:b2] la final.\nFinal @[asset:a1]'

test('brief text with footage tokens round-trips exactly through parse and serialize', () => {
  for (const sample of [
    brief,
    '',
    'plain text only',
    '@[asset:a1]',
    '@[asset:a1]@[asset:b2]',
    'line one\n\nline three\n',
    'email@example.com and @[asset:broken'
  ]) {
    assert.equal(serializeBrief(parseBrief(sample)), sample)
  }
})

test('parse separates text and footage references in order', () => {
  assert.deepEqual(parseBrief('a @[asset:x1] b'), [
    { type: 'text', text: 'a ' },
    { type: 'footage', assetID: 'x1' },
    { type: 'text', text: ' b' }
  ])
})

test('deleted footage tokens are dropped while the surrounding text stays', () => {
  assert.equal(
    pruneBriefFootage(brief, new Set(['b2'])),
    'Începe cu  și păstrează partea cu @[asset:b2] la final.\nFinal '
  )
  assert.equal(pruneBriefFootage(brief, new Set(['a1', 'b2'])), brief)
  assert.equal(pruneBriefFootage('x @[asset:gone] y', new Set()), 'x  y')
})

test('removing a footage reference drops every use of it and one of the two spaces around it', () => {
  assert.equal(
    removeFootageReferences(brief, 'a1'),
    'Începe cu și păstrează partea cu @[asset:b2] la final.\nFinal '
  )
  assert.equal(
    removeFootageReferences('@[asset:a1] start', 'a1'),
    'start'
  )
  assert.equal(removeFootageReferences(brief, 'unknown'), brief)
})
