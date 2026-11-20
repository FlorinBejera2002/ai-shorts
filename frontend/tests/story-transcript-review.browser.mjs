import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile, stat, utimes } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE')
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.setDefaultTimeout(30000)
const origin = process.env.TEST_ORIGIN || 'http://localhost:3001'
const projectID = '00000000-0000-4000-8000-000000000095'
const requests = [],
  errors = []
const viteMessages = []
const unexpectedMutations = []
let conflict = true
let polls = 0
let mediaRequests = 0
let expiredSource = ''
const output = process.env.TEST_SCREENSHOT_DIR || fileURLToPath(new URL('../test-results/story-transcript-review', import.meta.url))
const scratchRoot = fileURLToPath(new URL('../../.cache/tmp/', import.meta.url))
let scratch
const sourceFile = new URL('../src/components/story/story-transcript-asset.tsx', import.meta.url)
let originalSource
let originalStat
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', message => {
  if (message.text().includes('[vite]')) viteMessages.push(message.text())
})
let project = {
  id: projectID,
  status: 'analyzing',
  current_version: 0,
  versions: [],
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
      duration: 16,
      size: 1000,
      order: 0,
      role: 'auto',
      include: 'auto',
      source_url: '/fixture/review.mp4?expires=1700000000&sig=initial',
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
try {
  if (!process.env.FFMPEG_BINARY && !process.env.TRANSCRIPT_MEDIA_FIXTURE)
    throw Error('Set FFMPEG_BINARY or TRANSCRIPT_MEDIA_FIXTURE to a synthetic 16-second MP4')
  await mkdir(scratchRoot, { recursive: true })
  scratch = await mkdtemp(`${scratchRoot}transcript-review-`)
  const fixturePath = process.env.TRANSCRIPT_MEDIA_FIXTURE || resolve(scratch, 'review.mp4')
  if (!process.env.TRANSCRIPT_MEDIA_FIXTURE) execFileSync(process.env.FFMPEG_BINARY, [
    '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
    'testsrc2=size=320x180:rate=10:duration=16', '-f', 'lavfi', '-i',
    'sine=frequency=440:sample_rate=48000:duration=16', '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', fixturePath
  ])
  const media = await readFile(fixturePath)
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
  await page.route('**/fixture/review.mp4*', (route) => {
    mediaRequests++
    if (route.request().url() === expiredSource)
      return route.fulfill({ status: 403, body: 'Synthetic expired signed media URL' })
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/)
    const start = range ? Number(range[1]) : 0
    const end = range?.[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1
    return route.fulfill({ status: range ? 206 : 200, contentType: 'video/mp4',
      headers: { 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1),
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${media.length}` } : {}) },
      body: media.subarray(start, end + 1) })
  })
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
        status: 'failed',
        stage: undefined,
        expected_state: 'c'.repeat(64),
        assets: project.assets.map((asset) => ({
          ...asset,
          transcript_proposals: asset.transcript_proposals.map((proposal) => {
            const review = body.reviews.find(item => item.proposal_id === proposal.id)
            if (!review) return proposal
            return {
              ...proposal,
              id: review.timed_words ? `${proposal.id}-owner` : proposal.id,
              reviewed: true,
              timing_verified: review.timing_confirmed || proposal.timing_verified,
              ...(review.timing_confirmed ? { timing_source: 'owner' } : {}),
              words: review.timed_words ?? proposal.words.map((word, index) => ({
                ...word, text: review.words[index]
              }))
            }
          })
        }))
      }
      return route.fulfill({ json: project })
    }
    if (path === `/api/stories/${projectID}`) {
      polls++
      return route.fulfill({ json: { ...project, assets: project.assets.map(asset => ({
        ...asset, source_url: `/fixture/review.mp4?expires=${1700000000 + polls}&sig=poll-${polls}`
      })) } })
    }
    if (path === '/api/workspace-agent/runs')
      return route.fulfill({ json: { runs: [], has_more: false } })
    if (path === '/api/workspace-agent/suggestions')
      return route.fulfill({ json: { suggestions: [], capabilities: [] } })
    if (!['GET', 'OPTIONS'].includes(route.request().method())) unexpectedMutations.push(path)
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/dashboard/create?story=${projectID}`, {
    waitUntil: 'domcontentloaded', timeout: 90000
  })
  await page.getByTestId('story-transcript-disclosure').locator(':scope > summary').click()
  await page.getByText('Confirmation saves the reviewed text', { exact: false }).waitFor()
  await page.getByTestId('transcript-asset').locator('summary').click()
  const passages = page.getByTestId('transcript-passage')
  const first = passages.nth(0),
    second = passages.nth(1)
  const player = page.locator('video[aria-label^="Transcript source"]')
  await player.evaluate(async video => { video.muted = true; await video.play() })
  await page.evaluate(() => {
    window.transcriptBefore = {
      video: document.querySelector('video[aria-label^="Transcript source"]'),
      details: document.querySelector('[data-testid="transcript-asset"]')
    }
  })
  const initialPolls = polls
  await page.waitForFunction(() => document.querySelector('video[aria-label^="Transcript source"]')?.currentTime > 6, null, { timeout: 12000 })
  assert.ok(polls >= initialPolls + 2, 'Real project polling occurred during playback')
  assert.equal(await page.evaluate(() => {
    const { video, details } = window.transcriptBefore
    return video === document.querySelector('video[aria-label^="Transcript source"]') &&
      details === document.querySelector('[data-testid="transcript-asset"]') && details.open && !video.paused
  }), true, 'Signed URL renewal preserves the open review and playing media element')
  await player.evaluate(video => video.pause())
  assert.equal(await first.getByRole('textbox').first().isDisabled(), true, 'Editing remains disabled during analysis')
  await first.getByRole('button', { name: 'Play from word 2: world', exact: true }).click()
  await page.waitForFunction(() => {
    const video = document.querySelector('video[aria-label^="Transcript source"]')
    return video && !video.paused && video.currentTime >= 1 && video.currentTime < 2
  })
  await page.getByRole('button', { name: 'Play full recording', exact: true }).click()
  await page.waitForFunction(() => {
    const video = document.querySelector('video[aria-label^="Transcript source"]')
    return video && !video.paused && video.currentTime < 0.8
  })
  await player.evaluate(video => { video.currentTime = 14; })
  await page.waitForFunction(() => document.querySelector('video[aria-label^="Transcript source"]')?.ended === true)
  assert.equal(await player.evaluate(video => video.duration), 16, 'Full source duration is available beyond proposed transcript passages')
  expiredSource = await player.evaluate(video => video.currentSrc)
  await player.evaluate(video => video.load())
  // Trigger a real fetch of the expired fixture after clearing its media buffer.
  await player.evaluate(video => video.play().catch(() => {}))
  await page.getByRole('button', { name: 'Retry playback', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Retry playback', exact: true }).click()
  await page.waitForFunction(expired => {
    const video = document.querySelector('video[aria-label^="Transcript source"]')
    return video && video.currentSrc !== expired && video.readyState >= 2 && !video.paused
  }, expiredSource)
  assert.equal(await page.getByTestId('transcript-asset').evaluate(details => details.open), true,
    'Recovering expired media leaves the review open')
  await player.evaluate(video => video.pause())
  project = { ...project, status: 'failed' }
  await page.waitForFunction(() => document.querySelector('[data-testid="transcript-passage"] input[type="text"]')?.disabled === false)
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
    name: 'Confirm selected passages'
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
    .locator('[data-toast-region="corner"] [data-toast]')
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
  assert.equal(requests[1].version, 0)
  assert.equal(requests[1].expected_state, 'b'.repeat(64))
  assert.match(requests[1].request_id, /^[0-9a-f-]{36}$/)
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="transcript-passage"]')?.disabled === false
  )

  assert.equal(
    await first.getByRole('textbox').first().isDisabled(),
    false,
    'Preflight approval leaves review available for the next source'
  )
  await second.getByRole('button', { name: 'Correct timing', exact: true }).click()
  const manualText = index => second.getByRole('textbox', { name: `Word ${index} text`, exact: true })
  const manualStart = index => second.getByRole('spinbutton', { name: `Word ${index} start (seconds)`, exact: true })
  const manualEnd = index => second.getByRole('spinbutton', { name: `Word ${index} end (seconds)`, exact: true })
  const timingConfirmed = second.getByRole('checkbox', {
    name: 'I checked the words and timing against the recording.', exact: true
  })
  await manualText(1).fill('Clear')
  await manualStart(1).fill('2')
  await manualEnd(1).fill('2.4')
  await second.getByRole('button', { name: 'Add word', exact: true }).click()
  assert.equal(await timingConfirmed.isDisabled(), true, 'An empty added row cannot be approved')
  assert.equal(await approve.isDisabled(), true)
  await manualText(2).fill('speech')
  await manualStart(2).fill('2.4')
  await manualEnd(2).fill('2.8')
  await player.evaluate(video => { video.pause(); video.currentTime = 2.4 })
  await second.getByRole('button', { name: 'Use playhead for word 2 start', exact: true }).click()
  assert.equal(await manualStart(2).inputValue(), '2.4', 'Use playhead copies the full-recording media clock')
  await timingConfirmed.check()
  assert.equal(await approve.isEnabled(), true, 'Explicit checked timing enables a corrected proposal')

  await manualEnd(1).fill('2.6')
  assert.equal(await timingConfirmed.isChecked(), false, 'Editing timing clears prior confirmation')
  assert.equal(await timingConfirmed.isDisabled(), true, 'Overlapping words cannot be confirmed')
  assert.equal(await approve.isDisabled(), true)
  await manualEnd(1).fill('2.4')
  await manualEnd(2).fill('17')
  assert.equal(await timingConfirmed.isDisabled(), true, 'Words outside the source cannot be confirmed')
  await manualEnd(2).fill('3')
  assert.equal(await timingConfirmed.isDisabled(), true, 'Words outside the passage cannot be confirmed even within the source')
  await manualEnd(2).fill('2.8')
  await manualStart(1).fill('2.5')
  assert.equal(await timingConfirmed.isDisabled(), true, 'Non-positive intervals cannot be confirmed')
  await manualStart(1).fill('2')
  await manualText(2).fill('')
  assert.equal(await timingConfirmed.isDisabled(), true, 'Empty words cannot be confirmed')
  await manualText(2).fill('speech')
  await timingConfirmed.check()
  await manualText(1).fill('Clearer')
  assert.equal(await timingConfirmed.isChecked(), false, 'Editing words clears timing confirmation too')
  await manualText(1).fill('Clear')
  await second.getByRole('button', { name: 'Add word', exact: true }).click()
  assert.equal(await timingConfirmed.isDisabled(), true)
  await second.getByRole('button', { name: 'Remove word 3', exact: true }).click()
  assert.equal(await manualText(3).count(), 0, 'Removing an accidental row restores the intended word list')
  await timingConfirmed.check()
  if (process.env.RUN_FAST_REFRESH === '1') {
    originalSource = await readFile(sourceFile, 'utf8')
    originalStat = await stat(sourceFile)
    const probe = ' data-transcript-refresh="verified"'
    const updated = originalSource.replace('data-testid="transcript-asset"', `data-testid="transcript-asset"${probe}`)
    assert.notEqual(updated, originalSource, 'Fast Refresh probe must target the asset component')
    await page.evaluate(() => { window.transcriptDocument = document })
    await writeFile(sourceFile, updated)
    await page.locator('[data-transcript-refresh="verified"]').waitFor({ timeout: 60000 })
    assert.equal(await page.evaluate(() => {
      const { video, details } = window.transcriptBefore
      return window.transcriptDocument === document && video === document.querySelector('video[aria-label^="Transcript source"]') &&
        details === document.querySelector('[data-testid="transcript-asset"]') && details.open
    }), true, 'Fast Refresh preserves the document, media and open review DOM')
    assert.equal(await manualText(1).inputValue(), 'Clear')
    assert.equal(await manualText(2).inputValue(), 'speech')
    assert.equal(await manualStart(2).inputValue(), '2.4')
    assert.equal(await manualEnd(2).inputValue(), '2.8')
    assert.equal(await timingConfirmed.isChecked(), true, 'Fast Refresh preserves the reviewed manual timing draft')
    await writeFile(sourceFile, originalSource)
    await page.locator('[data-transcript-refresh="verified"]').waitFor({ state: 'detached' })
    await utimes(sourceFile, originalStat.atime, originalStat.mtime)
    originalSource = undefined
  }
  await second.getByRole('button', { name: 'Play from word 2: speech', exact: true }).click()
  await page.waitForFunction(() => {
    const video = document.querySelector('video[aria-label^="Transcript source"]')
    return video && !video.paused && video.currentTime >= 2.4 && video.currentTime < 3.4
  })
  await player.evaluate(video => video.pause())
  await page.setViewportSize({ width: 320, height: 844 })
  await second.scrollIntoViewIfNeeded()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false,
    'Manual word text, timing and confirmation controls fit 320px')
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: `${output}/manual-timing-320.png`, fullPage: true })
  await approve.click()
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="transcript-passage"]')].filter(node =>
      node.textContent.includes('Reviewed transcript')).length === 2)
  assert.equal(requests.length, 3)
  assert.deepEqual(requests[2].reviews, [{
    asset_id: 'source-1', proposal_id: 'proposal-2',
    timed_words: [{ text: 'Clear', start: 2, end: 2.4 }, { text: 'speech', start: 2.4, end: 2.8 }],
    timing_confirmed: true
  }], 'Manual confirmation carries explicit owner-reviewed timing without legacy words')
  assert.equal(requests[2].version, 0)
  assert.equal(requests[2].expected_state, 'c'.repeat(64))
  assert.equal(await page.getByTestId('transcript-asset').evaluate(details => details.open), true)
  await second.getByText('Timing checked by you', { exact: true }).waitFor()
  await second.getByRole('button', { name: 'Edit timing', exact: true }).click()
  assert.equal(await manualText(1).inputValue(), 'Clear')
  assert.equal(await manualText(2).inputValue(), 'speech')
  assert.equal(await manualStart(2).inputValue(), '2.4')
  assert.equal(await manualEnd(2).inputValue(), '2.8')
  assert.equal(await timingConfirmed.isChecked(), false, 'Reopening saved owner timing requires a fresh explicit confirmation')
  assert.equal(await approve.isDisabled(), true)
  assert.deepEqual(unexpectedMutations, [], 'Transcript review never starts generation or charges credits')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1
    ),
    false
  )
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true })
  await page.setViewportSize({ width: 1280, height: 960 })
  await page.getByTestId('transcript-asset').scrollIntoViewIfNeeded()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 320, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Word seeking and playback controls fit at 320px')
  await page.screenshot({ path: `${output}/mobile-320.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  project = { ...project, status: 'failed', stage: undefined }
  await page.goto(`${origin}/ro/dashboard/create?story=${projectID}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.getByTestId('story-transcript-disclosure').locator(':scope > summary').click()
  await page.getByTestId('transcript-asset').locator('summary').click()
  const translatedAction = page.getByRole('button', { name: 'Confirmă pasajele selectate' })
  await translatedAction.scrollIntoViewIfNeeded()
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Romanian controls fit the mobile viewport')
  await page.screenshot({ path: `${output}/mobile-ro.png`, fullPage: true })
  assert.deepEqual(errors, [])
  const report = {
    verified: 'Failed first generation allows mobile review, fixed timing remains required, conflict retains draft, preflight approval sends version 0 and leaves review enabled',
    playback: 'Real 16-second MP4, signed URL renewal across polling, uninterrupted playback, word seek during analysis, full recording playback, expired-media retry and stable open review DOM',
    manualTiming: 'Unverified timing stays blocked until corrected and explicitly checked; overlap, bounds and empty words rejected; edits clear confirmation; add/remove rows, corrected word seek, exact timed_words payload and 320px layout verified',
    fastRefresh: process.env.RUN_FAST_REFRESH === '1' ? 'passed' : 'not requested',
    polls,
    mediaRequests,
    requests: requests.length
  }
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} catch (error) {
  await mkdir(output, { recursive: true })
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {})
  console.error(JSON.stringify({ polls, mediaRequests, viteMessages: viteMessages.slice(-12), player: await page.evaluate(() => {
    const video = document.querySelector('video[aria-label^="Transcript source"]')
    const details = document.querySelector('[data-testid="transcript-asset"]')
    return { time: video?.currentTime, paused: video?.paused, readyState: video?.readyState, open: details?.open,
      sameVideo: video === window.transcriptBefore?.video, sameDetails: details === window.transcriptBefore?.details }
  }).catch(() => null) }))
  throw error
} finally {
  if (originalSource !== undefined) {
    await writeFile(sourceFile, originalSource)
    await utimes(sourceFile, originalStat.atime, originalStat.mtime)
  }
  await browser.close()
  if (scratch) await rm(scratch, { recursive: true, force: true })
}
