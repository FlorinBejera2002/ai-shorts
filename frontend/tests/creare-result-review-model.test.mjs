import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTsModule } from './support/load-ts-module.mjs'

const types = loadTsModule('src/components/story/types.ts')
const outputs = loadTsModule('src/components/story/story-result-outputs.ts', { './types': types })
const review = loadTsModule('src/components/story/story-create-review-model.ts', { './types': types })

const plain = (value) => structuredClone(value)

const footage = [
  { id: 'a1', name: 'one.mp4', size: 1, duration: 10, role: 'auto', include: 'auto', order: 0 },
  { id: 'b2', name: 'two.mp4', size: 1, duration: 10, role: 'auto', include: 'excluded', order: 1 },
  { id: 'c3', name: 'three.mp4', size: 1, duration: 10, role: 'auto', include: 'auto', order: 2 }
]

test('briefs split into text and footage references in reading order', () => {
  const segments = plain(review.briefSegments('Start with @[asset:c3] and keep @[asset:a1] last.'))
  assert.deepEqual(segments, [
    { type: 'text', value: 'Start with ' },
    { type: 'footage', assetId: 'c3' },
    { type: 'text', value: ' and keep ' },
    { type: 'footage', assetId: 'a1' },
    { type: 'text', value: ' last.' }
  ])
  assert.deepEqual(plain(review.briefSegments('')), [])
})

test('footage numbers follow the footage order and ignore unknown ids', () => {
  assert.equal(review.footageNumber(footage, 'c3'), 3)
  assert.equal(review.footageNumber(footage, 'missing'), undefined)
})

test('noise reduction applies to all footage unless specific footage is selected', () => {
  const base = { ...types.defaultOptions, audio_cleanup: { enabled: true } }
  assert.deepEqual(plain(review.noiseReducedFootage(base, footage)).map((asset) => asset.id), ['a1', 'b2', 'c3'])
  const selected = { ...base, audio_cleanup: { enabled: true, asset_ids: ['c3', 'unknown'] } }
  assert.deepEqual(plain(review.noiseReducedFootage(selected, footage)).map((asset) => asset.id), ['c3'])
})

test('clip count is 0 for automatic and clamps to the 1-30 range', () => {
  assert.equal(review.clipCountOf(types.defaultOptions), 0)
  assert.equal(review.clipCountOf({ ...types.defaultOptions, clip_count: 5 }), 5)
  assert.equal(review.clipCountOf({ ...types.defaultOptions, clip_count: 99 }), 30)
  assert.equal(review.clipCountOf({ ...types.defaultOptions, clip_count: -3 }), 0)
})

const version = (extra = {}) => ({
  number: 2,
  parent: 1,
  accepted: true,
  plan: { title: '', summary: '', blocks: [] },
  timeline: [{ block_id: 'x', output_in: 0, output_out: 12, video: { source_id: 'a', in: 0, out: 12 } }],
  report: { status: 'ready', coverage: { plan: true, file: true, audio: true, visual: true, captions: true, semantics: true, boundaries: true } },
  ...extra
})

test('a single-output version yields one clip from its preview with the fallback duration', () => {
  const clips = plain(outputs.resultClips(version({ preview_url: '/p.mp4', clip_id: 'clip-1', thumbnail_url: '/t.jpg' }), { aspect_ratio: '9:16' }))
  assert.equal(clips.length, 1)
  assert.equal(clips[0].videoUrl, '/p.mp4')
  assert.equal(clips[0].clipId, 'clip-1')
  assert.equal(clips[0].durationSeconds, 12)
  assert.equal(clips[0].aspectRatio, '9:16')
})

test('a version without any preview yields no clips', () => {
  assert.deepEqual(plain(outputs.resultClips(version(), { aspect_ratio: '9:16' })), [])
})

test('multi-clip outputs are returned in index order and keep their own download and clip ids', () => {
  const clips = plain(
    outputs.resultClips(
      version({
        outputs: [
          { id: 'o2', index: 2, video_url: '/3.mp4', poster_url: null, duration_seconds: 30, aspect_ratio: '1:1', clip_id: null },
          { id: 'o0', index: 0, video_url: '/1.mp4', poster_url: '/1.jpg', duration_seconds: 45, aspect_ratio: '9:16', clip_id: 'c1' },
          { id: 'o1', index: 1, video_url: '/2.mp4', poster_url: null, duration_seconds: 40, aspect_ratio: '9:16', clip_id: 'c2' }
        ]
      }),
      { aspect_ratio: '9:16' }
    )
  )
  assert.deepEqual(clips.map((clip) => clip.index), [0, 1, 2])
  assert.deepEqual(clips.map((clip) => clip.downloadUrl), ['/1.mp4', '/2.mp4', '/3.mp4'])
  assert.equal(clips[0].clipId, 'c1')
  assert.equal(clips[2].aspectRatio, '1:1')
  assert.equal(outputs.totalDuration(clips), 115)
})

test('a requested clip position is clamped to the available clips', () => {
  assert.equal(outputs.selectClipPosition(0, 3), 0)
  assert.equal(outputs.selectClipPosition(2, 3), 2)
  assert.equal(outputs.selectClipPosition(9, 3), 2)
  assert.equal(outputs.selectClipPosition(-1, 3), 0)
  assert.equal(outputs.selectClipPosition(1.8, 3), 1)
  assert.equal(outputs.selectClipPosition(4, 0), 0)
  assert.equal(outputs.selectClipPosition(Number.NaN, 3), 0)
})
