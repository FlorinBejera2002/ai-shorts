import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE')
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
const actions = []
page.on('pageerror', (error) => errors.push(error.message))
page.setDefaultTimeout(30000)
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5194'
const output = process.env.TEST_SCREENSHOT_DIR || 'test-results/story-result'
await mkdir(output, { recursive: true })

// Render disposable synthetic media; never use customer recordings as fixtures.
const ffmpeg = process.env.FFMPEG_BINARY
if (!ffmpeg) throw new Error('Set FFMPEG_BINARY to a local FFmpeg executable')
const fixturePath = resolve(output, 'preview.mp4')
execFileSync(ffmpeg, [
  '-hide_banner',
  '-loglevel',
  'error',
  '-y',
  '-f',
  'lavfi',
  '-i',
  'color=c=0xcee1de:s=180x320:r=5:d=45',
  '-vf',
  'drawbox=x=0:y=200:w=180:h=120:color=0x526b59:t=fill',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  fixturePath
])
const media = await readFile(fixturePath)
const projectID = '00000000-0000-4000-8000-000000000071'
const mediaURL = '/fixture/preview.mp4'
const userID = '00000000-0000-4000-8000-000000000072'
const thumbnail =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><rect width="180" height="120" fill="#cee1de"/><path d="M0 120L85 15L180 120" fill="#526b59"/></svg>'
  )
const assets = Array.from({ length: 17 }, (_, index) => ({
  id: `source-${index}`,
  name: `Mountain moment ${index + 1}.mp4`,
  kind: 'video',
  duration: 45,
  size: 32000,
  order: index,
  role: 'auto',
  include: 'auto',
  thumbnail_url: thumbnail,
  source_url: `/fixture/source-${index}.webm`,
  warnings: [
    'Automatic captions withheld: lexical-token probability 0.192 below 0.55.'
  ],
  candidates: [
    {
      id: `candidate-${index}`,
      source_id: `source-${index}`,
      in: 0,
      out: 2.5,
      text: '',
      confidence: 0.2,
      role: 'b_roll',
      reason: 'Technical candidate reason'
    }
  ]
}))
const version = (number, ready = false) => ({
  number,
  parent: number - 1,
  accepted: true,
  preview_url: mediaURL,
  thumbnail_url: thumbnail,
  plan: {
    title: 'Mountain weekend',
    summary: 'Synthetic montage',
    gaps: [],
    blocks: assets.map((asset, index) => ({
      id: `block-${index}`,
      candidate_id: `candidate-${index}`,
      role: 'context',
      reason: 'Internal raw reason',
      alternatives: index === 0 ? ['candidate-1'] : [],
      locked: false,
      lock_text: false,
      lock_order: false,
      lock_crop: false
    }))
  },
  timeline: assets.map((asset, index) => ({
    block_id: `block-${index}`,
    output_in: index * 2.5,
    output_out: (index + 1) * 2.5,
    video: { source_id: asset.id, in: 0, out: 2.5 }
  })),
  report: {
    status: ready ? 'ready' : 'needs_review',
    coverage: {
      plan: true,
      file: true,
      audio: ready,
      visual: ready,
      captions: ready,
      semantics: ready,
      boundaries: ready,
      incomplete: ready
        ? []
        : ['Media reviewer unavailable: internal model limitation.']
    },
    issues: ready
      ? []
      : assets.map((asset, index) => ({
          id: `issue-${index}`,
          type: 'b_roll',
          severity: 'minor',
          start: index * 2.5,
          end: (index + 1) * 2.5,
          evidence: `Candidate ${asset.id} audio_score=0.192; text field empty`,
          operation: 'remove_b_roll',
          resolved: false
        }))
  }
})
let project = {
  id: projectID,
  status: 'needs_review',
  current_version: 1,
  versions: [version(1)],
  assets,
  options: {
    brief: 'Mountain weekend',
    target_seconds: 45,
    aspect_ratio: '9:16',
    language: 'auto',
    mode: 'smart',
    preserve_order: false,
    captions: true
  },
  limits: {
    max_files: 20,
    max_file_bytes: 2 * 1024 ** 3,
    max_total_bytes: 10 * 1024 ** 3,
    max_source_seconds: 900,
    max_total_seconds: 3600
  }
}
await page.route('**/fixture/**', (route) => {
  const range = route
    .request()
    .headers()
    .range?.match(/bytes=(\d+)-(\d*)/)
  if (!range)
    return route.fulfill({
      body: media,
      contentType: 'video/mp4',
      headers: { 'Accept-Ranges': 'bytes' }
    })
  const start = Number(range[1])
  const end = range[2]
    ? Math.min(Number(range[2]), media.length - 1)
    : media.length - 1
  if (start >= media.length)
    return route.fulfill({
      status: 416,
      headers: { 'Content-Range': `bytes */${media.length}` }
    })
  return route.fulfill({
    status: 206,
    body: media.subarray(start, end + 1),
    contentType: 'video/mp4',
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${media.length}`
    }
  })
})
await page.route('**/v1/**', (route) =>
  route.fulfill({
    json: {
      access_token: 'synthetic-token',
      user: {
        id: userID,
        email: 'story-result@example.invalid',
        name: 'Test',
        credits: 100,
        plan: 'free',
        access_role: 'member'
      }
    }
  })
)
await page.route('**/api/**', (route) => {
  const path = new URL(route.request().url()).pathname
  if (path === '/api/stories')
    return route.fulfill({ json: { stories: [project] } })
  if (path === `/api/stories/${projectID}/generate`) {
    actions.push(route.request().postDataJSON())
    project = {
      ...project,
      current_version: 2,
      versions: [...project.versions, version(2)]
    }
    return route.fulfill({ json: project })
  }
  if (path === `/api/stories/${projectID}`) {
    if (route.request().method() === 'PATCH') {
      const { locks } = route.request().postDataJSON()
      for (const lock of locks)
        Object.assign(
          project.versions
            .at(-1)
            .plan.blocks.find((block) => block.id === lock.block_id),
          lock
        )
    }
    return route.fulfill({ json: project })
  }
  if (path === '/api/workspace-agent/runs')
    return route.fulfill({ json: { runs: [], has_more: false } })
  if (path === '/api/workspace-agent/suggestions')
    return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  return route.fulfill({ json: {} })
})
const sceneFile = new URL(
  '../src/components/story/story-scene.tsx',
  import.meta.url
)
let originalScene
try {
  await page.goto(`${origin}/dashboard/create?story=${projectID}`, {
    waitUntil: 'domcontentloaded', timeout: 180000
  })
  await page
    .getByRole('heading', { name: 'Video preview', exact: true })
    .waitFor()
  const scenes = page.getByTestId('story-block')
  const player = page.getByLabel('Story preview', { exact: true })
  await page.waitForFunction(
    () =>
      document.querySelector('video[aria-label="Story preview"]')?.readyState >=
      1
  )
  assert.equal(await scenes.count(), 17)
  assert.equal(await page.locator('.story-workspace [data-slot="card"] [data-slot="card"]').count(), 0,
    'Result content never nests cards')
  assert.equal(await scenes.first().evaluate((item) => Boolean(item.closest('[data-slot="card"]'))), false,
    'Scene rows sit in a plain section, without an outer card')
  assert.equal(await scenes.first().evaluate((item) => getComputedStyle(item).borderTopWidth), '1px')
  assert.equal(await page.getByTestId('story-processing').count(), 0)
  assert.equal(await page.getByTestId('story-review-topic').count(), 1)
  assert.equal(
    await page
      .getByRole('link', { name: 'Download draft', exact: true })
      .getAttribute('href'),
    mediaURL
  )
  const body = await page.locator('body').innerText()
  assert.doesNotMatch(
    body,
    /audio_score|lexical-token|Technical candidate reason|Internal raw reason/
  )
  assert.equal(await scenes.locator('details[open]').count(), 0)
  await page.screenshot({ path: `${output}/desktop-initial.png`, fullPage: true })
  const playerBox = await player.boundingBox()
  assert.ok(
    playerBox.y < 400,
    'Video is visible in the first screen of the result'
  )
  await scenes
    .nth(5)
    .getByRole('button', { name: /^View scene/ })
    .click()
  await page.waitForFunction(
    () =>
      Math.abs(
        document.querySelector('video[aria-label="Story preview"]')
          .currentTime - 12.5
      ) < 0.1
  )
  assert.ok(
    Math.abs((await player.evaluate((video) => video.currentTime)) - 12.5) < 0.1
  )
  assert.equal(await player.evaluate((video) => video.paused), true)
  await page
    .locator('summary')
    .filter({ hasText: 'View marked moments' })
    .click()
  await page
    .getByRole('button', { name: /^Review moment/ })
    .nth(3)
    .click()
  await page.waitForFunction(
    () =>
      Math.abs(
        document.querySelector('video[aria-label="Story preview"]')
          .currentTime - 7.5
      ) < 0.1
  )
  assert.ok(
    Math.abs((await player.evaluate((video) => video.currentTime)) - 7.5) < 0.1
  )
  await scenes.first().locator('summary').click()
  await scenes.first().getByRole('checkbox', { name: 'Entire scene', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[data-testid="story-block"] input[type="checkbox"]')?.checked)
  await scenes
    .first()
    .getByRole('button', { name: 'Rework this scene' })
    .waitFor()
  assert.equal(
    await scenes
      .first()
      .getByRole('button', { name: 'Rework this scene' })
      .isDisabled(),
    true
  )
  await scenes.first().getByRole('checkbox', { name: 'Entire scene', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="story-block"] input[type="checkbox"]')?.checked)

  // A component-only source update must preserve the mounted player and scene.
  const playerNode = await player.elementHandle()
  await player.evaluate((video) => {
    video.currentTime = 0.6
  })
  originalScene = await readFile(sceneFile, 'utf8')
  await writeFile(
    sceneFile,
    originalScene.replace(
      'Scene details and changes',
      'Scene details and changes (refresh check)'
    )
  )
  await scenes
    .first()
    .getByText('Scene details and changes (refresh check) 1', { exact: true })
    .waitFor()
  assert.equal(await playerNode.evaluate((node) => node.isConnected), true)
  assert.equal(await scenes.first().locator('details').getAttribute('open'), '')
  assert.ok(
    Math.abs((await player.evaluate((video) => video.currentTime)) - 0.6) < 0.1
  )
  await writeFile(sceneFile, originalScene)
  originalScene = undefined
  await scenes
    .first()
    .getByText('Scene details and changes 1', { exact: true })
    .waitFor()
  await scenes
    .first()
    .getByLabel('Use another take 1', { exact: true })
    .selectOption('candidate-1')
  await page.getByText(/Vertical · Version 2/).waitFor()
  assert.equal(actions.at(-1).action, 'alternate')
  assert.equal(actions.at(-1).block_id, 'block-0')
  await page.getByText('Technical report', { exact: true }).click()
  await page.getByText(/Candidate source-0 audio_score/).waitFor()
  await page.getByText('Technical report', { exact: true }).click()
  await scenes.first().locator('summary').click()
  await page.evaluate(() => scrollTo(0, 0))
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  )
  await page.screenshot({ path: `${output}/mobile.png`, fullPage: true })
  await page.goto(`${origin}/ro/dashboard/create?story=${projectID}`, {
    waitUntil: 'domcontentloaded', timeout: 180000
  })
  await page
    .getByRole('heading', { name: 'Înainte de publicare', exact: true })
    .waitFor()
  await page
    .getByRole('link', { name: 'Descarcă versiunea preliminară' })
    .waitFor()
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  )
  await page.screenshot({ path: `${output}/mobile-ro.png`, fullPage: true })
  assert.deepEqual(errors, [])
  console.log(
    'PASS: 17 compact scenes, grouped review, hidden diagnostics, primary download, real media seeking without autoplay, locks, alternate payload, component Fast Refresh preserves player/seek/open scene, EN/RO and mobile layout'
  )
} catch (error) {
  console.error({
    body: (await page.locator('body').innerText()).slice(0, 3000),
    errors,
    media: await page.locator('video').evaluateAll((videos) =>
      videos.map((video) => ({
        error: video.error?.message,
        state: video.readyState,
        duration: video.duration
      }))
    )
  })
  throw error
} finally {
  if (originalScene !== undefined) await writeFile(sceneFile, originalScene)
  await browser.close()
}
