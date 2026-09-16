import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

async function load(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}
const { publishingFileType, movePublishingMedia, incompatibleMediaPlatforms, unsupportedMetaVideos, uploadPublishingFile, publishingUploadErrorKey, PublishingUploadError } = await load('../src/components/calendar/publishing-media-utils.ts')
const { validateScheduledPostPayload } = await load('../src/lib/content-calendar.ts')
const items = [
  { type: 'image', reference: 'publishing/user/a.jpg', name: 'a.jpg' },
  { type: 'video', reference: 'publishing/user/b.mov', name: 'b.mov' },
  { type: 'video', reference: 'publishing/user/c.mp4', name: 'c.mp4' }
]

test('mobile files without MIME are identified by supported case-insensitive extensions', () => {
  assert.equal(publishingFileType({ name: 'IMG_1234.JPG', type: '' }), 'image')
  assert.equal(publishingFileType({ name: 'IMG_1234.MOV', type: '' }), 'video')
  assert.equal(publishingFileType({ name: 'photo.HEIC', type: 'image/heic' }), null)
  assert.equal(publishingFileType({ name: 'spoof.jpg.exe', type: 'image/jpeg' }), null)
})

test('making a video first retains every item and persists the exact order', () => {
  const reordered = movePublishingMedia(items, items[2].reference, 0)
  assert.deepEqual(reordered, [items[2], items[0], items[1]])
  assert.equal(items[0].name, 'a.jpg')
  const validated = validateScheduledPostPayload({ media: reordered }, 'update')
  assert.equal(validated.success, true)
  assert.deepEqual(validated.data.media, reordered)
  assert.equal(movePublishingMedia(items, 'missing', 0), items)
  assert.equal(movePublishingMedia(items, items[0].reference, -1), items)
})

test('accepts ten mixed slides but rejects eleven and malformed references', () => {
  const media = Array.from({ length: 10 }, (_, index) => ({ ...items[index % 3], reference: `publishing/user/${index}.jpg` }))
  assert.equal(validateScheduledPostPayload({ media }, 'update').success, true)
  assert.equal(validateScheduledPostPayload({ media: [...media, items[0]] }, 'update').success, false)
  assert.equal(validateScheduledPostPayload({ media: [{ ...items[0], reference: '' }] }, 'update').success, false)
})

test('only compatible destinations can receive mixed media', () => {
  assert.deepEqual(incompatibleMediaPlatforms(items, ['instagram', 'facebook', 'tiktok', 'youtube']), ['facebook', 'tiktok', 'youtube'])
  assert.deepEqual(incompatibleMediaPlatforms([items[1]], ['instagram', 'facebook', 'tiktok', 'youtube']), [])
  assert.deepEqual(incompatibleMediaPlatforms([items[0], { ...items[0], reference: 'other' }], ['facebook']), [])
})

test('unsupported Meta video containers are flagged without converting the original', () => {
  const media = [...items, { ...items[1], name: 'source.WEBM' }]
  assert.deepEqual(unsupportedMetaVideos(media, ['instagram']), ['source.WEBM'])
  assert.deepEqual(unsupportedMetaVideos(media, ['facebook']), ['source.WEBM'])
  assert.deepEqual(unsupportedMetaVideos(media, ['tiktok']), [])
})

test('uploads original bytes using FormData without forcing a multipart boundary', async () => {
  const bytes = new Uint8Array([0, 255, 45, 12, 99])
  const file = new File([bytes], 'phone.MOV', { type: '' })
  const signal = new AbortController().signal
  const result = await uploadPublishingFile(file, async (url, init) => {
    assert.equal(url, '/api/publishing/media')
    assert.equal(init.headers, undefined)
    assert.equal(init.signal, signal)
    assert.equal(init.body.get('file').name, 'phone.MOV')
    assert.deepEqual(new Uint8Array(await init.body.get('file').arrayBuffer()), bytes)
    return Response.json(items[1], { status: 201 })
  }, signal)
  assert.deepEqual(result, items[1])
})

test('upload errors retain their status for actionable messages and retry', async () => {
  for (const status of [400, 401, 404, 405, 413, 415, 422, 429, 500, 502, 503, 504]) {
    await assert.rejects(uploadPublishingFile(new File(['x'], 'a.jpg'), async () => new Response(null, { status }), new AbortController().signal), error => error instanceof PublishingUploadError && error.status === status)
  }
})

test('missing upload routes and server failures do not blame the selected files', () => {
  for (const status of [404, 405, 500, 502, 503, 504]) {
    assert.equal(publishingUploadErrorKey(new PublishingUploadError(status)), 'mediaTemporarilyUnavailable')
  }
  for (const status of [400, 415, 422]) {
    assert.equal(publishingUploadErrorKey(new PublishingUploadError(status)), 'mediaUnsupported')
  }
  assert.equal(publishingUploadErrorKey(new PublishingUploadError(413)), 'mediaTooLarge')
  assert.equal(publishingUploadErrorKey(new PublishingUploadError(429)), 'mediaRateLimit')
  assert.equal(publishingUploadErrorKey(new PublishingUploadError(401)), 'mediaAuthRequired')
  assert.equal(publishingUploadErrorKey(new TypeError('Failed to fetch')), 'mediaUploadFailed')
})
