import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE')
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.setDefaultTimeout(30000)
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5194'
const projectID = '00000000-0000-4000-8000-000000000095'
const requests = [],
  errors = []
let conflict = true
page.on('pageerror', (error) => errors.push(error.message))
const version = {
  number: 1,
  parent: 0,
  accepted: true,
  plan: { title: 'Review caption fixture', summary: '', blocks: [] },
  timeline: [],
  output: { captions: false, duration: 3 },
  report: {
    status: 'ready',
    issues: [],
    coverage: {
      plan: true,
      file: true,
      audio: true,
      visual: true,
      captions: false,
      semantics: true,
      boundaries: true
    }
  }
}
let project = {
  id: projectID,
  status: 'ready',
  current_version: 1,
  versions: [version],
  expected_state: 'a'.repeat(64),
  options: {
    brief: '',
    target_seconds: 3,
    aspect_ratio: '9:16',
    language: 'en',
    mode: 'smart',
    preserve_order: true,
    captions: true,
    caption_mode: 'all'
  },
  limits: {
    max_files: 200,
    max_file_bytes: 2 * 1024 ** 3,
    max_total_bytes: 10 * 1024 ** 3,
    max_source_seconds: 900,
    max_total_seconds: 3600
  },
  assets: [
    {
      id: 'source-1',
      name: 'Review recording.mp4',
      duration: 3,
      size: 1000,
      order: 0,
      role: 'auto',
      include: 'auto',
      source_url: '/fixture/review.wav',
      transcript_proposals: [
        {
          id: 'proposal-1',
          candidate_id: 'candidate-1',
          in: 0.5,
          out: 1.8,
          words: [
            { text: 'Helo', start: 0.5, end: 0.8 },
            { text: 'world', start: 1, end: 1.8 }
          ],
          confidence: 0.506,
          reason: 'low_confidence',
          timing_verified: true,
          reviewed: false
        },
        {
          id: 'proposal-2',
          candidate_id: 'candidate-2',
          in: 2,
          out: 2.8,
          words: [{ text: 'uncertain', start: 2, end: 2.8 }],
          confidence: 0.2,
          reason: 'unverified_timing',
          timing_verified: false,
          reviewed: false
        }
      ]
    }
  ]
}
const wav = Buffer.alloc(44 + 48000 * 3 * 2)
wav.write('RIFF')
wav.writeUInt32LE(wav.length - 8, 4)
wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16)
wav.writeUInt16LE(1, 20)
wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(48000, 24)
wav.writeUInt32LE(96000, 28)
wav.writeUInt16LE(2, 32)
wav.writeUInt16LE(16, 34)
wav.write('data', 36)
wav.writeUInt32LE(wav.length - 44, 40)
for (let index = 0; index < 48000 * 3; index++)
  wav.writeInt16LE(
    Math.round(Math.sin((index * 2 * Math.PI * 440) / 48000) * 3000),
    44 + index * 2
  )
try {
  await page.route('**/v1/**', (route) =>
    route.fulfill({
      json: {
        access_token: 'synthetic-token',
        user: {
          id: '00000000-0000-4000-8000-000000000096',
          email: 'transcript-review@example.invalid',
          name: 'Transcript fixture',
          credits: 100,
          plan: 'free',
          access_role: 'member'
        }
      }
    })
  )
  await page.route('**/fixture/review.wav', (route) =>
    route.fulfill({ contentType: 'audio/wav', body: wav })
  )
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/stories')
      return route.fulfill({ json: { stories: [project] } })
    if (path === `/api/stories/${projectID}/transcript-review`) {
      const body = route.request().postDataJSON()
      requests.push(body)
      if (conflict) {
        conflict = false
        project = { ...project, expected_state: 'b'.repeat(64) }
        return route.fulfill({ status: 409, json: { detail: 'Story changed' } })
      }
      project = {
        ...project,
        status: 'queued',
        stage: 'analyze',
        expected_state: 'c'.repeat(64),
        assets: project.assets.map((asset) => ({
          ...asset,
          transcript_proposals: asset.transcript_proposals.map((proposal) =>
            proposal.id === 'proposal-1'
              ? {
                  ...proposal,
                  reviewed: true,
                  words: proposal.words.map((word, index) => ({
                    ...word,
                    text: body.reviews[0].words[index]
                  }))
                }
              : proposal
          )
        }))
      }
      return route.fulfill({ json: project })
    }
    if (path === `/api/stories/${projectID}`)
      return route.fulfill({ json: project })
    if (path === '/api/workspace-agent/runs')
      return route.fulfill({ json: { runs: [], has_more: false } })
    if (path === '/api/workspace-agent/suggestions')
      return route.fulfill({ json: { suggestions: [], capabilities: [] } })
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/dashboard/create?story=${projectID}`, {
    waitUntil: 'domcontentloaded', timeout: 90000
  })
  await page
    .getByRole('link', { name: 'Review transcripts', exact: true })
    .click()
  await page.getByTestId('transcript-asset').locator('summary').click()
  const passages = page.getByTestId('transcript-passage')
  const first = passages.nth(0),
    second = passages.nth(1)
  assert.equal(await second.getByRole('textbox').isDisabled(), true)
  assert.equal(
    await second.getByRole('button', { name: 'Listen to passage' }).isEnabled(),
    true
  )
  assert.equal(await second.getByRole('checkbox').count(), 0)
  await first.getByRole('button', { name: 'Listen to passage' }).click()
  await page.waitForFunction(() => {
    const video = document.querySelector(
      'video[aria-label^="Transcript source"]'
    )
    return (
      video &&
      video.readyState >= 2 &&
      video.currentTime >= 0.5 &&
      !video.paused
    )
  })
  await page
    .locator('video[aria-label^="Transcript source"]')
    .evaluate((video) => video.pause())
  await first.getByRole('textbox').first().fill('Hello')
  const approve = page.getByRole('button', {
    name: 'Approve selected and rebuild captions'
  })
  assert.equal(await approve.isDisabled(), true)
  await first.getByRole('checkbox').check()
  await first.getByRole('textbox').last().fill('world!')
  assert.equal(
    await first.getByRole('checkbox').isChecked(),
    false,
    'Changing text requires explicit review of the new words'
  )
  await first.getByRole('checkbox').check()
  await approve.click()
  await page
    .getByRole('alert')
    .filter({ hasText: 'The project changed.' })
    .waitFor()
  assert.equal(await first.getByRole('textbox').first().inputValue(), 'Hello')
  assert.equal(await first.getByRole('checkbox').isChecked(), true)
  assert.equal(
    requests.length,
    1,
    'Conflict never automatically approves again'
  )
  await approve.click()
  await page.waitForFunction(() =>
    document.body.textContent.includes('Reviewed transcript')
  )
  assert.equal(requests.length, 2)
  assert.deepEqual(requests[1].reviews, [
    {
      asset_id: 'source-1',
      proposal_id: 'proposal-1',
      words: ['Hello', 'world!']
    }
  ])
  assert.equal(requests[1].version, 1)
  assert.equal(requests[1].expected_state, 'b'.repeat(64))
  assert.match(requests[1].request_id, /^[0-9a-f-]{36}$/)
  assert.equal(
    await first.getByRole('textbox').first().isDisabled(),
    true,
    'Queued revision locks review edits'
  )
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1
    ),
    false
  )
  const output =
    process.env.TEST_SCREENSHOT_DIR || 'test-results/story-transcript-review'
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true })
  project = { ...project, status: 'ready', stage: undefined }
  await page.goto(`${origin}/ro/dashboard/create?story=${projectID}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.getByTestId('transcript-asset').locator('summary').click()
  const translatedAction = page.getByRole('button', { name: 'Confirmă selecția și regenerează subtitrările' })
  await translatedAction.scrollIntoViewIfNeeded()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Romanian controls fit the mobile viewport')
  await page.screenshot({ path: `${output}/mobile-ro.png`, fullPage: true })
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({
      verified:
        'Explicit fixed-timing review, source playback, edit invalidates confirmation, owner-state conflict retains draft, approval queues caption revision',
      requests: requests.length
    })
  )
} finally {
  await browser.close()
}
