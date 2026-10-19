import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/lib/facebook-post-settings.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
})
const {
  settingsFromFacebookPublishingOptions,
  createFacebookPublishingOptions,
  validateFacebookSettings
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

test('Facebook old drafts default to optional empty settings', () => {
  const settings = settingsFromFacebookPublishingOptions()
  assert.deepEqual(settings, { placeId: '', reelTitle: '', isAiGenerated: false })
  assert.deepEqual(createFacebookPublishingOptions(settings, false), {})
})

test('Facebook Reel settings roundtrip and preserve an explicit false AI choice', () => {
  const settings = { placeId: ' 123456 ', reelTitle: ' Studio visit ', isAiGenerated: false }
  const saved = createFacebookPublishingOptions(settings, true)
  assert.deepEqual(saved, { placeId: '123456', reelTitle: 'Studio visit', isAiGenerated: false })
  assert.deepEqual(createFacebookPublishingOptions(settingsFromFacebookPublishingOptions(saved), true), saved)
})

test('photo posts omit Reel fields without discarding the local settings', () => {
  const settings = { placeId: '1234', reelTitle: 'My Reel', isAiGenerated: true }
  assert.deepEqual(createFacebookPublishingOptions(settings, false), { placeId: '1234' })
  assert.deepEqual(createFacebookPublishingOptions(settings, true), settings)
})

test('Facebook form rejects invalid places and counts title Unicode characters', () => {
  const settings = settingsFromFacebookPublishingOptions()
  for (const placeId of ['Bucharest', '-12', '1'.repeat(65)]) {
    assert.equal(validateFacebookSettings({ ...settings, placeId }, true), 'facebookPlaceInvalid')
  }
  assert.equal(validateFacebookSettings({ ...settings, reelTitle: '🎬'.repeat(255) }, true), null)
  assert.equal(validateFacebookSettings({ ...settings, reelTitle: '🎬'.repeat(256) }, true), 'facebookReelTitleInvalid')
  assert.equal(validateFacebookSettings({ ...settings, reelTitle: '🎬'.repeat(256) }, false), null)
})
