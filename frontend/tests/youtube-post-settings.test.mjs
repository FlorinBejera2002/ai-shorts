import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

async function load(path) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const { initialYouTubeSettings, validateYouTubeSettings } = await load('../src/lib/youtube-post-settings.ts')
const { isPublishingAccountUsable } = await load('../src/lib/publishing.ts')
const { validateScheduledPostPayload } = await load('../src/lib/content-calendar.ts')
const complete = { ...initialYouTubeSettings(), title: 'My video', madeForKids: false, containsSyntheticMedia: false, termsAccepted: true }

test('YouTube requires explicit audience, synthetic media and renewed review consent', () => {
  assert.equal(validateYouTubeSettings(initialYouTubeSettings(), false), false)
  assert.equal(validateYouTubeSettings(complete, false), true)
  for (const key of ['madeForKids', 'containsSyntheticMedia']) {
    assert.equal(validateYouTubeSettings({ ...complete, [key]: null }, false), false)
  }
  assert.equal(initialYouTubeSettings(complete).termsAccepted, false)
})
test('YouTube restricts unaudited uploads and validates byte length', () => {
  assert.equal(validateYouTubeSettings({ ...complete, privacyStatus: 'public' }, false), false)
  assert.equal(validateYouTubeSettings({ ...complete, privacyStatus: 'public' }, true), true)
  assert.equal(validateYouTubeSettings({ ...complete, description: 'ă'.repeat(2501) }, true), false)
  assert.equal(validateYouTubeSettings({ ...complete, title: '<invalid>' }, true), false)
})
test('old readonly YouTube connections require reconnect; refreshable access remains usable', () => {
  const account = { provider: 'youtube', status: 'connected', tokenExpired: true }
  assert.equal(isPublishingAccountUsable({ ...account, scopes: ['channel_read'] }), false)
  assert.equal(isPublishingAccountUsable({ ...account, scopes: ['channel_read', 'video_publish'] }), true)
})

test('calendar retains YouTube options and accepts incomplete choices only for drafts', () => {
  const payload = { title: 'Video', platforms: ['youtube'], accountIds: [], status: 'draft', scheduledAt: '2026-10-01T12:00:00Z', youtube: initialYouTubeSettings() }
  const draft = validateScheduledPostPayload(payload, 'create')
  assert.equal(draft.success, true)
  assert.deepEqual(draft.data.youtube, payload.youtube)
  const publish = validateScheduledPostPayload({ ...payload, status: 'publish' }, 'create')
  assert.equal(publish.success, false)
  assert.ok(publish.issues.some(issue => issue.field === 'youtube'))
})
