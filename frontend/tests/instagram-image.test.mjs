import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

async function load(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

const { validateScheduledPostPayload } = await load('../src/lib/content-calendar.ts')
const { publishingImageCropGeometry, publishingImageCropStyle, applyPublishingImageFormat, publishingImageFormatsMatch } = await load('../src/components/calendar/publishing-image-utils.ts')
const { movePublishingMedia } = await load('../src/components/calendar/publishing-media-utils.ts')
const photo = { type: 'image', reference: 'publishing/user/photo.jpg', name: 'photo.jpg' }
const crop = { aspectRatio: '4:5', x: 0.25, y: 0.75, zoom: 2 }
const edited = { ...photo, crop, altText: 'A person beside a red bicycle', userTags: [{ username: 'person.name', x: 0.1, y: 0.9 }] }
const tiktokOptions = {
  privacyLevel: 'PUBLIC_TO_EVERYONE', disableComment: false, disableDuet: true,
  disableStitch: true, brandContentToggle: false, brandOrganicToggle: false,
  musicUsageConfirmed: true, isAigc: false
}
const youtubeOptions = {
  title: 'A bicycle ride', description: '', privacyStatus: 'private',
  madeForKids: false, containsSyntheticMedia: false, notifySubscribers: false,
  termsAccepted: true
}

test('image metadata persists through validation and reordering without changing original references', () => {
  const other = { ...photo, reference: 'other.jpg', name: 'other.jpg' }
  const media = movePublishingMedia([edited, other], photo.reference, 1)
  const result = validateScheduledPostPayload({ media }, 'update')
  assert.equal(result.success, true)
  assert.deepEqual(result.data.media, [other, edited])
  assert.equal(result.data.media[1], edited)
  assert.equal(edited.reference, photo.reference)
})

test('Facebook photos retain shared crop and alt text across save, reorder and destination changes', () => {
  const second = { ...edited, reference: 'publishing/user/second.jpg', altText: 'The bicycle parked beside a bench' }
  const media = applyPublishingImageFormat([edited, second], '1:1')
  for (const platforms of [['facebook'], ['instagram', 'facebook']]) {
    const result = validateScheduledPostPayload({ platforms, media }, 'update')
    assert.equal(result.success, true)
    assert.deepEqual(result.data.media, media)
    assert.equal(result.data.media[0].reference, edited.reference)
    assert.deepEqual(movePublishingMedia(result.data.media, second.reference, 0), [media[1], media[0]])
  }
  // Facebook accepts independently shaped photos; Instagram still requires a common carousel ratio.
  const mixedFormats = [edited, { ...second, crop: { ...crop, aspectRatio: '1:1' } }]
  assert.equal(validateScheduledPostPayload({ platforms: ['facebook'], media: mixedFormats }, 'update').success, true)
  assert.equal(validateScheduledPostPayload({ platforms: ['instagram', 'facebook'], media: mixedFormats }, 'update').success, false)
})

test('TikTok photos keep the shared crop and saved Meta descriptions when destinations change', () => {
  const media = applyPublishingImageFormat([edited], '1.91:1')
  const result = validateScheduledPostPayload({ platforms: ['tiktok'], media }, 'update')
  assert.equal(result.success, true)
  assert.deepEqual(result.data.media[0].crop, { ...crop, aspectRatio: '1.91:1' })
  assert.equal(result.data.media[0].altText, edited.altText)
  assert.deepEqual(result.data.media[0].userTags, edited.userTags)
  assert.equal(result.data.media[0].reference, edited.reference)
})

test('TikTok cover options preserve zero values and reject invalid indices or timestamps', () => {
  for (const covers of [
    { photoCoverIndex: 0 },
    { photoCoverIndex: 34 },
    { videoCoverTimestampMs: 0 },
    { videoCoverTimestampMs: Number.MAX_SAFE_INTEGER }
  ]) {
    const tiktok = { ...tiktokOptions, ...covers }
    const result = validateScheduledPostPayload({ tiktok }, 'update')
    assert.equal(result.success, true)
    assert.deepEqual(result.data.tiktok, tiktok)
  }
  for (const covers of [
    { photoCoverIndex: -1 }, { photoCoverIndex: 35 }, { photoCoverIndex: 0.5 },
    { photoCoverIndex: '0' }, { videoCoverTimestampMs: -1 },
    { videoCoverTimestampMs: 0.5 }, { videoCoverTimestampMs: Infinity },
    { videoCoverTimestampMs: Number.MAX_SAFE_INTEGER + 1 },
    { videoCoverTimestampMs: null }
  ]) {
    assert.equal(validateScheduledPostPayload({ tiktok: { ...tiktokOptions, ...covers } }, 'update').success, false)
  }
})

test('YouTube tags count Unicode characters, commas and quotes without dropping tag values', () => {
  const validTags = [
    [], ['🚲'.repeat(500)], ['a'.repeat(498), 'b'],
    ['a'.repeat(496) + ' b'], ['tag', 'tag'], ['one\ttwo']
  ]
  for (const tags of validTags) {
    const youtube = { ...youtubeOptions, tags, license: 'creativeCommon', embeddable: false }
    const result = validateScheduledPostPayload({ youtube }, 'update')
    assert.equal(result.success, true)
    assert.deepEqual(result.data.youtube, youtube)
  }
  for (const tags of [
    ['🚲'.repeat(501)], ['a'.repeat(499), 'b'], ['a'.repeat(497) + ' b'],
    [''], [' '], ['\t'], [12], null, 'tag'
  ]) {
    assert.equal(validateScheduledPostPayload({ youtube: { ...youtubeOptions, tags } }, 'update').success, false)
  }
})

test('YouTube license and embedding remain optional and preserve existing title validation', () => {
  for (const extra of [{}, { license: 'youtube' }, { embeddable: true }]) {
    assert.equal(validateScheduledPostPayload({ youtube: { ...youtubeOptions, ...extra } }, 'update').success, true)
  }
  for (const extra of [
    { license: 'creativeCommons' }, { license: null }, { embeddable: 'true' },
    { title: '<invalid>' }, { title: '🚲'.repeat(101) }, { unexpected: true }
  ]) {
    assert.equal(validateScheduledPostPayload({ youtube: { ...youtubeOptions, ...extra } }, 'update').success, false)
  }
})

test('crop geometry matches cover positioning and zoom at each boundary', () => {
  assert.deepEqual(publishingImageCropGeometry(1600, 1200, crop), { width: 480, height: 600, left: 280, top: 450 })
  assert.deepEqual(publishingImageCropGeometry(1600, 1200, { aspectRatio: '1:1', x: 0, y: 0, zoom: 1 }), { width: 1200, height: 1200, left: 0, top: 0 })
  assert.deepEqual(publishingImageCropGeometry(1600, 1200, { aspectRatio: '1:1', x: 1, y: 1, zoom: 1 }), { width: 1200, height: 1200, left: 400, top: 0 })
  const landscape = publishingImageCropGeometry(800, 1200, { aspectRatio: '1.91:1', x: 1, y: 1, zoom: 3 })
  assert.ok(Math.abs(landscape.width / landscape.height - 1.91) < 1e-10)
  assert.equal(landscape.left + landscape.width, 800)
  assert.equal(landscape.top + landscape.height, 1200)
  const style = publishingImageCropStyle(1600, 1200, crop)
  assert.equal(parseFloat(style.height), 200)
  assert.equal(parseFloat(style.top), -75)
  assert.ok(Math.abs(parseFloat(style.left) - (-280 / 480 * 100)) < 1e-10)
})

test('carousel format applies to every image while preserving positions, tags, alt text and videos', () => {
  const other = { ...photo, reference: 'other.jpg' }
  const video = { type: 'video', reference: 'video.mp4', name: 'video.mp4' }
  const media = applyPublishingImageFormat([edited, other, video], '1:1')
  assert.deepEqual(media[0], { ...edited, crop: { ...crop, aspectRatio: '1:1' } })
  assert.deepEqual(media[1].crop, { aspectRatio: '1:1', x: 0.5, y: 0.5, zoom: 1 })
  assert.equal(media[2], video)
  assert.equal(publishingImageFormatsMatch(media), true)
  assert.equal(publishingImageFormatsMatch([edited, other]), false)
  const original = applyPublishingImageFormat(media, 'original')
  assert.equal(original[0].crop, undefined)
  assert.deepEqual(original[0].userTags, edited.userTags)
  assert.equal(original[0].altText, edited.altText)
  assert.equal(edited.crop, crop)
})

test('alt text limit counts Unicode characters and metadata is image-only', () => {
  assert.equal(validateScheduledPostPayload({ media: [{ ...photo, altText: '🌻'.repeat(1000) }] }, 'update').success, true)
  for (const altText of ['🌻'.repeat(1001), 12, null]) {
    assert.equal(validateScheduledPostPayload({ media: [{ ...photo, altText }] }, 'update').success, false)
  }
  for (const metadata of [{ crop }, { altText: '' }, { userTags: [] }]) {
    assert.equal(validateScheduledPostPayload({ media: [{ ...photo, type: 'video', ...metadata }] }, 'update').success, false)
  }
})

test('rejects malformed, out of bounds and unexpected crop or tag metadata', () => {
  for (const invalidCrop of [null, {}, { ...crop, aspectRatio: '9:16' }, { ...crop, aspectRatio: ['4:5'] }, { ...crop, x: -0.01 }, { ...crop, y: 1.01 }, { ...crop, x: NaN }, { ...crop, zoom: Infinity }, { ...crop, zoom: 0.99 }, { ...crop, zoom: 3.01 }, { ...crop, extra: true }]) {
    assert.equal(validateScheduledPostPayload({ media: [{ ...photo, crop: invalidCrop }] }, 'update').success, false)
  }
  for (const userTags of [null, [{ username: '@name', x: 0.5, y: 0.5 }], [{ username: 'name', x: 1.01, y: 0.5 }], [{ username: 'name', x: 0.5, y: 0.5, extra: true }], [{ username: 'Name', x: 0.5, y: 0.5 }, { username: 'name', x: 0.4, y: 0.4 }], Array.from({ length: 21 }, (_, i) => ({ username: `name${i}`, x: 0.5, y: 0.5 }))]) {
    assert.equal(validateScheduledPostPayload({ media: [{ ...photo, userTags }] }, 'update').success, false)
  }
  assert.equal(validateScheduledPostPayload({ platforms: ['instagram'], media: [edited, { ...photo, reference: 'other' }] }, 'update').success, false)
  assert.equal(validateScheduledPostPayload({ platforms: ['instagram'], media: [edited, { ...edited, reference: 'other' }] }, 'update').success, true)
})

test('advanced Instagram settings preserve the API contract and enforce their boundaries', () => {
  const instagram = { commentEnabled: true, shareToFeed: false, locationId: '1234567', collaborators: ['person.name', 'another_user'], coverReference: 'publishing/user/cover.jpg', thumbOffset: 1200, audioName: '🎵'.repeat(100), isAiGenerated: true, trialReel: 'MANUAL' }
  const result = validateScheduledPostPayload({ instagram }, 'update')
  assert.equal(result.success, true)
  assert.deepEqual(result.data.instagram, instagram)
  assert.equal(validateScheduledPostPayload({ instagram: { thumbOffset: 900000 } }, 'update').success, true)
  assert.equal(validateScheduledPostPayload({ instagram: { thumbOffset: 900001 } }, 'update').success, false)
  for (const invalid of [{ locationId: '1a' }, { locationId: '1'.repeat(65) }, { collaborators: ['Name', 'name'] }, { collaborators: ['one', 'two', 'three', 'four'] }, { collaborators: ['@name'] }, { thumbOffset: -1 }, { thumbOffset: 1.5 }, { thumbOffset: Infinity }, { audioName: '🎵'.repeat(101) }, { coverReference: ' ' }, { coverReference: 'a'.repeat(1025) }, { isAiGenerated: 'yes' }, { trialReel: 'always' }, { trialReel: ['MANUAL'] }, { unsupported: true }]) {
    assert.equal(validateScheduledPostPayload({ instagram: { ...instagram, ...invalid } }, 'update').success, false)
  }
})

test('Facebook Page settings preserve valid options and reject unsupported metadata', () => {
  const facebook = { placeId: '123456789', reelTitle: '🚲'.repeat(255), isAiGenerated: true }
  const result = validateScheduledPostPayload({ facebook }, 'update')
  assert.equal(result.success, true)
  assert.deepEqual(result.data.facebook, facebook)
  assert.equal(validateScheduledPostPayload({ facebook: {} }, 'update').success, true)
  for (const invalid of [
    null,
    { placeId: '' },
    { placeId: 'place-name' },
    { placeId: '1'.repeat(65) },
    { placeId: 123 },
    { reelTitle: '🚲'.repeat(256) },
    { reelTitle: null },
    { isAiGenerated: 'yes' },
    { collaborators: ['name'] },
    { trialReel: 'MANUAL' }
  ]) {
    const checked = validateScheduledPostPayload({ facebook: invalid }, 'update')
    assert.equal(checked.success, false)
    assert.equal(checked.issues[0].field, 'facebook')
  }
})
