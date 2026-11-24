import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Loads a TypeScript module as CommonJS. The YouTube create models import nothing outside their folder.
function load(relative) {
  const exports = {}
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText,
    { exports, URL }
  )
  return exports
}

const model = load('../src/components/create/youtube-creation-model.ts')
const importModel = load('../src/components/create/youtube-import-model.ts')

// Values created inside the vm context have another Array prototype; compare plain JSON copies.
const plain = (value) => structuredClone(value)

test('clip count clamps to the 1..30 manual range', () => {
  assert.equal(model.clampClipCount(0), 1)
  assert.equal(model.clampClipCount(-4), 1)
  assert.equal(model.clampClipCount(31), 30)
  assert.equal(model.clampClipCount(4.6), 5)
  assert.equal(model.clampClipCount(Number.NaN), 1)
  assert.equal(model.clampClipCount(Number.POSITIVE_INFINITY), 1)
})

test('manual clip count input parses integers and rejects text', () => {
  assert.equal(model.parseManualClipCount(''), null)
  assert.equal(model.parseManualClipCount('abc'), null)
  assert.equal(model.parseManualClipCount('2.5'), null)
  assert.equal(model.parseManualClipCount(' 7 '), 7)
  assert.equal(model.parseManualClipCount('99'), 30)
  assert.equal(model.parseManualClipCount('0'), 1)
})

test('Auto is the zero count and presets are Auto, 3, 5 and 8', () => {
  assert.equal(model.AUTO_CLIP_COUNT, 0)
  assert.equal(model.isAutoClipCount(0), true)
  assert.equal(model.isAutoClipCount(3), false)
  assert.deepEqual(plain(model.CLIP_COUNT_PRESETS), [0, 3, 5, 8])
})

test('selection holds at most ten videos and removing always works', () => {
  assert.equal(model.MAX_SELECTED_VIDEOS, 10)
  assert.deepEqual(plain(model.toggleVideoSelection([], 'a')), ['a'])
  assert.deepEqual(plain(model.toggleVideoSelection(['a', 'b'], 'a')), ['b'])
  const full = Array.from({ length: 10 }, (_, index) => `v${index}`)
  assert.deepEqual(plain(model.toggleVideoSelection(full, 'extra')), full, 'An eleventh video is ignored')
  assert.equal(plain(model.toggleVideoSelection(full, 'v3')).length, 9, 'A chosen video can still be removed at the cap')
})

test('private videos cannot be chosen', () => {
  assert.equal(model.isSelectableVideo('public'), true)
  assert.equal(model.isSelectableVideo('unlisted'), true)
  assert.equal(model.isSelectableVideo('private'), false)
})

test('visibility filter maps one-to-one onto the channel videos query', () => {
  assert.deepEqual(plain(model.VISIBILITY_FILTERS), ['all', 'public', 'unlisted', 'private'])
  for (const filter of model.VISIBILITY_FILTERS) {
    assert.equal(model.visibilityQueryParam(filter), filter)
  }
  assert.equal(model.visibilityQueryParam('deleted'), 'all')
})

test('authorization redirect must be Google HTTPS sign-in without credentials or port', () => {
  assert.equal(model.isGoogleAuthorizationUrl('https://accounts.google.com/o/oauth2/v2/auth?state=x'), true)
  assert.equal(model.isGoogleAuthorizationUrl('http://accounts.google.com/o/oauth2/v2/auth'), false)
  assert.equal(model.isGoogleAuthorizationUrl('https://accounts.google.com:8443/auth'), false)
  assert.equal(model.isGoogleAuthorizationUrl('https://user@accounts.google.com/auth'), false)
  assert.equal(model.isGoogleAuthorizationUrl('https://evil.example/accounts.google.com'), false)
  assert.equal(model.isGoogleAuthorizationUrl(undefined), false)
  assert.equal(model.isGoogleAuthorizationUrl('not a url'), false)
})

test('selection refusals map to the limit, connect, active, invalid-video and transport outcomes', () => {
  assert.deepEqual(plain(importModel.classifySelectionFailure(402, { error: 'Insufficient credits' })), { kind: 'limit' })
  assert.deepEqual(
    plain(importModel.classifySelectionFailure(400, { error: 'Choose between 1 and 10 videos and accept the import disclosure.' })),
    { kind: 'invalid-selection' }
  )
  assert.deepEqual(
    plain(importModel.classifySelectionFailure(400, { error: 'Invalid import request.' })),
    { kind: 'invalid-request' },
    'A malformed body gets its own copy, not the clip-settings message'
  )
  assert.deepEqual(
    plain(importModel.classifySelectionFailure(422, { error: 'Invalid clip count' })),
    { kind: 'invalid-options' },
    'An invalid clip option stays separate from a malformed request'
  )
  assert.deepEqual(
    plain(importModel.classifySelectionFailure(409, { error: 'Connect your YouTube channel before choosing videos.' })),
    { kind: 'connect' }
  )
  assert.deepEqual(
    plain(importModel.classifySelectionFailure(409, { error: 'A YouTube import is already in progress.' })),
    { kind: 'active' }
  )
  assert.deepEqual(plain(importModel.classifySelectionFailure(409, { error: 'Something else' })), { kind: 'generic' })
  assert.deepEqual(
    plain(importModel.classifySelectionFailure(422, { error: 'Some selected videos are private.', video_ids: ['p1', 'p2'] })),
    { kind: 'invalid-videos', videoIds: ['p1', 'p2'] }
  )
  assert.deepEqual(plain(importModel.classifySelectionFailure(422, { error: 'Invalid clip count' })), { kind: 'invalid-options' })
  assert.deepEqual(plain(importModel.classifySelectionFailure(429, {})), { kind: 'rate-limited' })
  assert.deepEqual(plain(importModel.classifySelectionFailure(502, {})), { kind: 'unavailable' })
  assert.deepEqual(plain(importModel.classifySelectionFailure(503, {})), { kind: 'unavailable' })
  assert.deepEqual(plain(importModel.classifySelectionFailure(403, { error: 'Account is unavailable' })), { kind: 'forbidden' })
  assert.deepEqual(plain(importModel.classifySelectionFailure(500, null)), { kind: 'generic' })
})

test('progress payload is read defensively and keeps the import-level state', () => {
  const imports = importModel.parseYouTubeImports({
    imports: [
      { id: 'active', status: 'queued', error: '', selection: null },
      {
        id: 'new',
        status: 'importing',
        error: '',
        selection: {
          items: [
            { video_id: 'a', title: 'A', thumbnail_url: '', status: 'waiting', job_id: null, error: '' },
            { video_id: 'b', title: 'B', thumbnail_url: 'https://img.example/b.jpg', status: 'processing', job_id: 'job-b', error: '' },
            { video_id: 'c', title: 'C', status: 'unknown-status' }
          ]
        }
      },
      { id: 'old', status: 'failed', error: 'boom', selection: { items: [{ video_id: 'z', title: 'Z', status: 'failed' }] } },
      'not an import'
    ]
  })
  assert.equal(imports.length, 3)
  assert.equal(imports[1].status, 'importing')
  assert.equal(imports[2].error, 'boom')
  assert.equal(importModel.trackedImport(imports).id, 'active', 'A newer import still running is the one the card tracks')
  const latest = importModel.trackedImport(imports.slice(1))
  assert.equal(latest.id, 'new')
  assert.deepEqual(importModel.progressItems(imports.slice(1)).map((item) => item.video_id), ['a', 'b'], 'The malformed item is dropped')
  assert.equal(latest.selection.items[1].job_id, 'job-b')
  assert.equal(latest.selection.items[0].thumbnail_url, '')
  assert.equal(importModel.parseYouTubeImports(null).length, 0)
})

test('only the latest selection keeps the card polling', () => {
  const waiting = { video_id: 'a', title: 'A', thumbnail_url: '', status: 'waiting', job_id: null, error: '' }
  const processing = { ...waiting, video_id: 'b', status: 'processing', job_id: 'j' }
  const older = { id: 'old', status: 'importing', error: '', selection: { items: [waiting] } }
  const latest = { id: 'new', status: 'ready', error: '', selection: { items: [processing] } }
  assert.equal(importModel.importNeedsPolling([latest, older]), false, 'An older waiting import does not poll the card')
  assert.equal(importModel.importNeedsPolling([{ ...latest, status: 'importing', selection: { items: [waiting] } }]), true)
  assert.equal(importModel.importNeedsPolling([{ id: 'x', status: 'queued', error: '', selection: null }]), true, 'A running import without a selection yet is polled')
  assert.equal(importModel.importNeedsPolling([{ id: 'x', status: 'ready', error: '', selection: null }]), false)
})

test('a cancelled import never keeps the card polling and its unsettled items read as unavailable', () => {
  const waiting = { video_id: 'a', title: 'A', thumbnail_url: '', status: 'waiting', job_id: null, error: '' }
  const cancelled = [{ id: 'c', status: 'cancelled', error: '', selection: { items: [waiting] } }]
  assert.equal(importModel.importNeedsPolling(cancelled), false)
  assert.equal(importModel.progressItems(cancelled)[0].status, 'missing')
  assert.equal(importModel.importProgressPhase(cancelled, false), 'incomplete')
})

test('progress phase follows the latest selection and reports incomplete imports', () => {
  const item = (status) => ({ video_id: status, title: status, thumbnail_url: '', status, job_id: null, error: '' })
  const selection = (...statuses) => ({ id: 'i', status: 'importing', error: '', selection: { items: statuses.map(item) } })
  assert.equal(importModel.importProgressPhase(undefined, false), 'checking')
  assert.equal(importModel.importProgressPhase(undefined, true), 'incomplete', 'A failed list read is not a checking state')
  assert.equal(importModel.importProgressPhase([], false), 'incomplete', 'No selection to show')
  assert.equal(importModel.importProgressPhase([{ id: 'x', status: 'queued', error: '', selection: null }], false), 'importing', 'A running import without a selection is still importing')
  assert.equal(importModel.importProgressPhase([{ id: 'x', status: 'cancelled', error: '', selection: null }], false), 'incomplete')
  assert.equal(importModel.importProgressPhase([selection('processing', 'waiting')], false), 'importing')
  assert.equal(importModel.importProgressPhase([selection('processing', 'processing')], false), 'ready')
  assert.equal(importModel.importProgressPhase([selection('processing', 'failed')], false), 'partial')
  assert.equal(importModel.importProgressPhase([selection('failed', 'missing')], false), 'incomplete')
  assert.equal(importModel.importProgressPhase([{ ...selection('processing'), status: 'failed' }], false), 'incomplete')
  assert.equal(importModel.importProgressPhase([selection('waiting'), { id: 'x', status: 'ready', error: '', selection: null }], false), 'importing')
})

test('refused rows stay disabled only for the visibility they were refused at', () => {
  assert.equal(model.isRefusedVideo(undefined, 'public'), false)
  assert.equal(model.isRefusedVideo('public', 'public'), true)
  assert.equal(model.isRefusedVideo('unlisted', 'public'), false, 'A visibility change makes the video choosable again')
})

test('radio-group keys move the visibility filter and wrap around', () => {
  assert.equal(model.nextVisibilityFilterIndex(0, 'ArrowRight'), 1)
  assert.equal(model.nextVisibilityFilterIndex(0, 'ArrowLeft'), 3)
  assert.equal(model.nextVisibilityFilterIndex(3, 'ArrowDown'), 0)
  assert.equal(model.nextVisibilityFilterIndex(2, 'ArrowUp'), 1)
  assert.equal(model.nextVisibilityFilterIndex(2, 'Home'), 0)
  assert.equal(model.nextVisibilityFilterIndex(1, 'End'), 3)
  assert.equal(model.nextVisibilityFilterIndex(1, 'Enter'), null)
})
