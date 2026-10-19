import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/instagram-post-settings.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } })
const { INITIAL_INSTAGRAM_SETTINGS, settingsFromInstagramPublishingOptions, createInstagramPublishingOptions, validateInstagramSettings } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

test('old drafts keep default settings and disabled-comments intent remains visible', () => {
  assert.deepEqual(settingsFromInstagramPublishingOptions(), INITIAL_INSTAGRAM_SETTINGS)
  assert.equal(settingsFromInstagramPublishingOptions({ commentEnabled: false }).commentEnabled, false)
})

test('advanced Reel settings survive save and reopen with seconds converted to milliseconds', () => {
  const settings = { ...INITIAL_INSTAGRAM_SETTINGS, collaboratorsText: '@creator, second.creator', locationId: '123456',
    audioName: 'Behind the scenes', thumbOffsetSeconds: '1.5', isAiGenerated: true, trialReel: 'MANUAL', shareToFeed: false }
  assert.equal(validateInstagramSettings(settings, true), null)
  const saved = createInstagramPublishingOptions(settings, true)
  assert.deepEqual(saved.collaborators, ['creator', 'second.creator'])
  assert.equal(saved.thumbOffset, 1500)
  assert.equal(saved.shareToFeed, false)
  assert.deepEqual(createInstagramPublishingOptions(settingsFromInstagramPublishingOptions(saved), true), saved)
})

test('switching from a Reel to photos excludes inapplicable options without erasing form state', () => {
  const settings = { ...INITIAL_INSTAGRAM_SETTINGS, coverReference: 'publishing/user/cover.jpg', thumbOffsetSeconds: '2',
    audioName: 'Original sound', trialReel: 'SS_PERFORMANCE', collaboratorsText: 'creator' }
  const photos = createInstagramPublishingOptions(settings, false)
  for (const key of ['coverReference', 'thumbOffset', 'audioName', 'trialReel']) assert.equal(key in photos, false)
  assert.deepEqual(photos.collaborators, ['creator'])
  assert.equal(createInstagramPublishingOptions(settings, true).coverReference, settings.coverReference)
  assert.equal('thumbOffset' in createInstagramPublishingOptions(settings, true), false, 'Uploaded cover takes precedence')
})

test('invalid collaborators, locations and Reel cover times are rejected before submission', () => {
  for (const collaboratorsText of ['one,two,three,four', '@same,SAME', 'invalid/name']) {
    assert.equal(validateInstagramSettings({ ...INITIAL_INSTAGRAM_SETTINGS, collaboratorsText }, true), 'instagramCollaboratorsInvalid')
  }
  assert.equal(validateInstagramSettings({ ...INITIAL_INSTAGRAM_SETTINGS, locationId: 'Bucharest' }, false), 'instagramLocationInvalid')
  for (const thumbOffsetSeconds of ['-1', 'Infinity', 'no', '901']) {
    assert.equal(validateInstagramSettings({ ...INITIAL_INSTAGRAM_SETTINGS, thumbOffsetSeconds }, true), 'instagramCoverTimeInvalid')
  }
  assert.equal(validateInstagramSettings({ ...INITIAL_INSTAGRAM_SETTINGS, audioName: '🎙'.repeat(101) }, true), 'instagramAudioInvalid')
})
