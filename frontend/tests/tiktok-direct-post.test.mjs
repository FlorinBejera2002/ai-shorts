import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = ts.transpileModule(
  readFileSync(
    new URL('../src/lib/tiktok-direct-post.ts', import.meta.url),
    'utf8'
  ),
  {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }
).outputText

const exports = {}
vm.runInNewContext(source, { exports, require: () => ({}) })

const options = {
  privacyLevels: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
  commentDisabled: false,
  duetDisabled: true,
  stitchDisabled: false,
  maxDuration: 180,
  nickname: 'Latest TikTok name'
}

const settings = {
  privacyLevel: 'PUBLIC_TO_EVERYONE',
  allowComment: true,
  allowDuet: true,
  allowStitch: false,
  commercialContent: true,
  ownBrand: false,
  brandedContent: true,
  policyConsent: true,
  isAigc: true
}

test('create flow resolves the selected clip from the current publishing list', () => {
  const current = {
    id: 'current-clip',
    title: 'Current clip',
    duration: 24,
    tiktokEligible: true,
    fileUrl: '/current.mp4'
  }
  const resolved = exports.resolveCalendarTikTokClip({
    calendarClips: [],
    clipId: current.id,
    publishingClips: [current]
  })

  assert.equal(resolved, current)
})

test('edit flow resolves an older scheduled clip outside the recent publishing list', () => {
  const resolved = exports.resolveCalendarTikTokClip({
    calendarClips: [
      {
        id: 'older-clip',
        title: 'Older scheduled clip',
        viralScore: 8,
        duration: 42,
        tiktokEligible: true,
        thumbnailUrl: null,
        captionTiktok: 'Saved caption',
        captionInstagram: null,
        captionYoutube: null
      }
    ],
    clipId: 'older-clip',
    publishingClips: []
  })

  assert.equal(resolved.duration, 42)
  assert.equal(resolved.tiktokEligible, true)
  assert.equal(resolved.thumbnailUrl, undefined)
})

test('requires a manual audience and explicit policy confirmation', () => {
  const errors = exports.validateTikTokDirectPost({
    accountId: 'account-1',
    caption: 'A useful clip',
    clip: { duration: 30, tiktokEligible: true },
    options,
    settings: {
      ...settings,
      privacyLevel: '',
      policyConsent: false
    }
  })

  assert.deepEqual([...errors], ['privacyRequired', 'policyConsentRequired'])
})

test('blocks branded content when the chosen audience is private', () => {
  const errors = exports.validateTikTokDirectPost({
    accountId: 'account-1',
    caption: 'A useful clip',
    clip: { duration: 30, tiktokEligible: true },
    options,
    settings: { ...settings, privacyLevel: 'SELF_ONLY' }
  })

  assert.deepEqual([...errors], ['brandedContentPrivacy'])
})

test('rejects an overlong caption even when it was prefilled', () => {
  const errors = exports.validateTikTokDirectPost({
    accountId: 'account-1',
    caption: 'x'.repeat(2201),
    clip: { duration: 30, tiktokEligible: true },
    options,
    settings
  })

  assert.deepEqual([...errors], ['captionTooLong'])
})

test('rejects a privacy choice that is no longer offered by TikTok', () => {
  const errors = exports.validateTikTokDirectPost({
    accountId: 'account-1',
    caption: 'A useful clip',
    clip: { duration: 30, tiktokEligible: true },
    options,
    settings: { ...settings, privacyLevel: 'MUTUAL_FOLLOW_FRIENDS' }
  })

  assert.deepEqual([...errors], ['privacyUnavailable'])
})

test('create flow keeps incomplete TikTok options when saving a draft', () => {
  const draft = exports.createCalendarTikTokPublishingOptions({
    creatorOptions: options,
    hasUploadedMedia: false,
    selectedAccountCount: 1,
    settings: {
      ...settings,
      privacyLevel: '',
      policyConsent: false
    },
    status: 'draft',
    validationErrors: [
      'clipRequired',
      'captionRequired',
      'privacyRequired',
      'policyConsentRequired'
    ]
  })

  assert.equal(draft.privacyLevel, '')
  assert.equal(draft.musicUsageConfirmed, false)
  assert.equal(draft.disableDuet, true)
  assert.equal(draft.brandContentToggle, true)
})

test('edit flow restores and reserializes every saved TikTok option', () => {
  const saved = {
    privacyLevel: 'PUBLIC_TO_EVERYONE',
    disableComment: false,
    disableDuet: true,
    disableStitch: false,
    brandContentToggle: false,
    brandOrganicToggle: true,
    musicUsageConfirmed: true,
    isAigc: true
  }
  const restored = exports.settingsFromTikTokPublishingOptions(saved)

  assert.deepEqual(
    { ...restored },
    {
      privacyLevel: 'PUBLIC_TO_EVERYONE',
      allowComment: true,
      allowDuet: false,
      allowStitch: true,
      commercialContent: true,
      ownBrand: true,
      brandedContent: false,
      policyConsent: true,
      isAigc: true
    }
  )

  const edited = exports.createCalendarTikTokPublishingOptions({
    creatorOptions: options,
    hasUploadedMedia: false,
    selectedAccountCount: 1,
    settings: restored,
    status: 'draft',
    validationErrors: []
  })
  assert.deepEqual({ ...edited }, saved)
})

test('publish and schedule flows require every TikTok validation to pass', () => {
  const invalidScheduled = exports.createCalendarTikTokPublishingOptions({
    creatorOptions: options,
    hasUploadedMedia: false,
    selectedAccountCount: 1,
    settings,
    status: 'scheduled',
    validationErrors: ['captionRequired']
  })
  const validPublish = exports.createCalendarTikTokPublishingOptions({
    creatorOptions: options,
    hasUploadedMedia: false,
    selectedAccountCount: 1,
    settings,
    status: 'publish',
    validationErrors: []
  })

  assert.equal(invalidScheduled, undefined)
  assert.equal(validPublish.privacyLevel, 'PUBLIC_TO_EVERYONE')
  assert.equal(validPublish.musicUsageConfirmed, true)
})
