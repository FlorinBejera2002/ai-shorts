import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTsModule } from './support/load-ts-module.mjs'

const model = loadTsModule('src/components/jobs/job-source-model.ts')
const romanian = (english, romanianText) => romanianText
const english = (englishText) => englishText

test('link jobs are YouTube or URL sources, everything else is uploaded footage', () => {
  assert.equal(model.isLinkJob({ source_type: 'youtube' }), true)
  assert.equal(model.isLinkJob({ source_type: 'url' }), true)
  assert.equal(model.isLinkJob({ source_type: 'upload' }), false)
  assert.equal(model.isLinkJob({}), false)
})

test('the source row uses the backend title when present and a source fallback otherwise', () => {
  assert.equal(model.jobSourceCard({ source_type: 'youtube', source_title: 'Interviu cu Mara' }, romanian).title, 'Interviu cu Mara')
  assert.equal(model.jobSourceCard({ source_type: 'youtube' }, romanian).title, 'Videoclip YouTube')
  assert.equal(model.jobSourceCard({ source_type: 'upload' }, romanian).title, 'Filmări încărcate')
  assert.equal(model.jobSourceCard({ source_type: 'upload' }, english).title, 'Uploaded footage')
})

test('the source meta reads like the canvas: clip count, aspect ratio and subtitle style', () => {
  const card = model.jobSourceCard(
    { source_type: 'youtube', num_clips_requested: 0, aspect_ratio: '9:16', subtitle_style: 'bold' },
    romanian
  )
  assert.equal(card.meta, 'Auto · 9:16 · Bold')
  assert.equal(
    model.jobSourceCard({ num_clips_requested: 5, aspect_ratio: '9:16', subtitle_style: 'bold' }, romanian).meta,
    '5 clipuri · 9:16 · Bold'
  )
  assert.equal(model.jobSourceCard({ num_clips_requested: 1 }, romanian).meta, '1 clip')
  assert.equal(model.jobSourceCard({ subtitle_style: 'default' }, romanian).meta, 'Standard')
})

test('the source meta is omitted when the job carries no source settings, and thumbnails default to none', () => {
  const card = model.jobSourceCard({}, romanian)
  assert.equal(card.meta, undefined)
  assert.equal(card.thumbnailUrl, null)
  assert.equal(model.jobSourceCard({ source_thumbnail_url: 'https://example.invalid/t.jpg' }, romanian).thumbnailUrl, 'https://example.invalid/t.jpg')
})
