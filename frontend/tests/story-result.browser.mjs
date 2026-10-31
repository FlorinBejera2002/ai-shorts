import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

// Windows file watchers can hold a source file briefly during Fast Refresh.
async function writeSource(path, content) {
  for (let attempt = 0; ; attempt++) {
    try { return await writeFile(path, content) }
    catch (error) {
      if (attempt >= 9 || !['UNKNOWN', 'EBUSY', 'EPERM', 'EACCES'].includes(error.code)) throw error
      await delay(100)
    }
  }
}

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE')
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
const mutations = []
const studioRequests = []
let studioOrigin
page.on('pageerror', (error) => errors.push(error.message))
page.setDefaultTimeout(30000)
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5194'
const output = process.env.TEST_SCREENSHOT_DIR || 'test-results/story-result'
await mkdir(output, { recursive: true })

// Render disposable synthetic media; never use customer recordings as fixtures.
const ffmpeg = process.env.FFMPEG_BINARY
if (!ffmpeg) throw new Error('Set FFMPEG_BINARY to a local FFmpeg executable')
const temporaryRoot = resolve('../.cache/tmp')
await mkdir(temporaryRoot, { recursive: true })
const temporary = await mkdtemp(temporaryRoot + '/story-result-')
const headerFile = new URL('../src/components/story/story-result-header.tsx', import.meta.url)
let originalHeader
try {
  const fixturePath = resolve(temporary, 'preview.mp4')
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
  const exportURL = '/fixture/export-hdr.mp4'
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
    clip_id: '00000000-0000-4000-8000-000000000073',
    preview_url: mediaURL,
    export_url: exportURL,
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
    expected_state: 'synthetic-state-v1',
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
      max_files: 200,
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
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET') mutations.push(path)
    if (path === '/api/stories')
      return route.fulfill({ json: { stories: [project] } })
    if (path === '/api/user/brand')
      return route.fulfill({ json: { brandKit: { primaryColor: '#000000' } } })
    if (path === '/api/dashboard')
      return route.fulfill({
        json: {
          metrics: {
            credits: 100,
            plan: 'free',
            jobCount: 0,
            clipCount: 0,
            durationMinutes: 0,
            activity: [],
            statuses: {}
          },
          recentClips: []
        }
      })
    if (path === `/api/stories/${projectID}`) return route.fulfill({ json: project })
    if (path === '/api/workspace-agent/runs')
      return route.fulfill({ json: { runs: [], has_more: false } })
    if (path === '/api/workspace-agent/suggestions')
      return route.fulfill({ json: { suggestions: [], capabilities: [] } })
    return route.fulfill({ json: {} })
  })
  await page.route('**/sneepcut/**', (route) => {
    const url = new URL(route.request().url())
    studioOrigin = url.origin
    studioRequests.push({ path: url.pathname, method: route.request().method() })
    return route.fulfill({ json: url.pathname.endsWith('/session') ? { ok: true } : { project: { id: 'story-main-project', title: 'Mountain weekend' } } })
  })
  await page.route('**/*', (route) => {
    if (studioOrigin && new URL(route.request().url()).origin === studioOrigin && route.request().isNavigationRequest())
      return route.fulfill({ contentType: 'text/html', body: '<h1>Main Studio fixture</h1>' })
    return route.fallback()
  })
  await page.goto(`${origin}/dashboard/create?story=${projectID}`, {
    waitUntil: 'domcontentloaded',
    timeout: 180000
  })
  await page
    .getByRole('heading', { name: 'Video preview', exact: true })
    .waitFor()
  const player = page.getByLabel('Clip preview', { exact: true })
  await page.waitForFunction(
    () =>
      document.querySelector('video[aria-label="Clip preview"]')?.readyState >=
      1
  )
  assert.equal(
    await page.getByTestId('story-block').count(),
    0,
    'Clip cards absent from default result'
  )
  assert.equal(await page.getByTestId('story-processing').count(), 0)
  assert.equal(
    await page.getByTestId('story-review-issue').count(),
    0,
    'Minor/model coverage diagnostics are internal'
  )
  assert.equal(
    await page
      .getByRole('link', { name: 'Download draft', exact: true })
      .getAttribute('href'),
    exportURL
  )
  assert.doesNotMatch(
    await page.locator('body').innerText(),
    /Before you publish|Technical report|Media reviewer unavailable|audio_score|lexical-token|Internal raw reason/
  )
  await page.screenshot({
    path: `${output}/desktop-initial.png`,
    fullPage: true
  })
  assert.ok((await player.boundingBox()).y < 400)
  for (const name of ['Edit clips', 'Appearance', 'Faster pace', 'Smoother flow', 'Smoother transitions', 'Approve selected and rebuild captions'])
    assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0)
  assert.equal(await page.getByTestId('transcript-asset').count(), 0)
  assert.equal(await page.getByText('Compare audio', { exact: true }).count(), 0)
  assert.equal(await page.getByRole('link', { name: 'All clips', exact: true }).getAttribute('href'), '/dashboard/clips')
  if (process.env.RUN_FAST_REFRESH === '1') {
    const playerNode = await player.elementHandle()
    await player.evaluate((video) => { video.currentTime = 0.6 })
    originalHeader = await readFile(headerFile, 'utf8')
    await writeSource(headerFile, originalHeader.replace("'Video preview'", "'Video preview refresh check'"))
    await page.getByRole('heading', { name: 'Video preview refresh check', exact: true }).waitFor()
    assert.equal(await playerNode.evaluate((node) => node.isConnected), true)
    assert.ok(Math.abs(await player.evaluate((video) => video.currentTime) - 0.6) < 0.1)
    await writeSource(headerFile, originalHeader)
    originalHeader = undefined
    await page.getByRole('heading', { name: 'Video preview', exact: true }).waitFor()
  }
  const sidebar = page.locator('[data-slot="sidebar"]'),
    sidebarNode = await sidebar.elementHandle(),
    headerNode = await page.locator('header').first().elementHandle()
  const oldState = await sidebar.getAttribute('data-state')
  await page.locator('[data-sidebar="trigger"]').click()
  await page.waitForFunction(
    (old) =>
      document
        .querySelector('[data-slot="sidebar"]')
        ?.getAttribute('data-state') !== old,
    oldState
  )
  const state = await sidebar.getAttribute('data-state')
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await page.getByTestId('studio-dashboard').waitFor()
  await page.goBack()
  await page.getByTestId('story-result').waitFor()
  assert.equal(
    await sidebarNode.evaluate(
      (n) => n === document.querySelector('[data-slot="sidebar"]')
    ),
    true
  )
  assert.equal(
    await headerNode.evaluate((n) => n === document.querySelector('header')),
    true
  )
  assert.equal(await sidebar.getAttribute('data-state'), state)
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2)
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true
    )
    await page.screenshot({
      path: `${output}/mobile-${width}.png`,
      fullPage: true
    })
  }
  await page.goto(`${origin}/ro/dashboard/create?story=${projectID}`, {
    waitUntil: 'domcontentloaded'
  })
  await page
    .getByRole('link', { name: 'Descarcă versiunea preliminară' })
    .waitFor()
  assert.doesNotMatch(
    await page.locator('body').innerText(),
    /Înainte de publicare|Raport tehnic/
  )
  await page.screenshot({ path: `${output}/mobile-ro.png`, fullPage: true })
  assert.equal(await page.getByRole('link', { name: 'Toate clipurile', exact: true }).getAttribute('href'), '/ro/dashboard/clips')
  assert.deepEqual(mutations, [], 'Completed stories never issue local edit mutations')
  await page.getByTestId('story-result').getByRole('button').click()
  await page.waitForURL('**/#project/story-main-project')
  assert.equal(new URL(page.url()).origin, studioOrigin)
  assert.deepEqual(studioRequests, [
    { path: '/sneepcut/session', method: 'POST' },
    { path: '/sneepcut/clips/00000000-0000-4000-8000-000000000073/open', method: 'POST' }
  ])
  assert.deepEqual(errors, [])
  console.log(
    `PASS: read-only result, canonical clips library, main Studio clip handoff, no secondary editor, HDR download, sidebar/header DOM identity, desktop/mobile EN/RO; Fast Refresh ${process.env.RUN_FAST_REFRESH === '1' ? 'verified' : 'skipped (set RUN_FAST_REFRESH=1)'}`
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
  if (originalHeader !== undefined) await writeSource(headerFile, originalHeader)
  await browser.close()
  await rm(temporary, { recursive: true, force: true })
}
