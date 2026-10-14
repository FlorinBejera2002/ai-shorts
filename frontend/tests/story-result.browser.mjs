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
let failAction = false
let releaseAction
let actionGate
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
  if (path === '/api/stories')
    return route.fulfill({ json: { stories: [project] } })
  if (path === `/api/stories/${projectID}/generate`) {
    actions.push(route.request().postDataJSON())
    if (actionGate) await actionGate
    if (failAction)
      return route.fulfill({
        status: 503,
        json: { detail: 'Synthetic render failure' }
      })
    project = {
      ...project,
      current_version: project.current_version + 1,
      versions: [...project.versions, version(project.current_version + 1)]
    }
    return route.fulfill({ json: project })
  }
  if (path === `/api/stories/${projectID}/rollback`) {
    project.current_version = route.request().postDataJSON().version
    return route.fulfill({ json: project })
  }
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
    waitUntil: 'domcontentloaded',
    timeout: 180000
  })
  await page
    .getByRole('heading', { name: 'Video preview', exact: true })
    .waitFor()
  const player = page.getByLabel('Story preview', { exact: true })
  await page.waitForFunction(
    () =>
      document.querySelector('video[aria-label="Story preview"]')?.readyState >=
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
    mediaURL
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
  await page.getByRole('button', { name: 'Edit clips', exact: true }).click()
  assert.equal(
    await page.getByTestId('story-block').count(),
    1,
    'Only selected clip controls mounted'
  )
  await page.getByRole('button', { name: /^Clip 6 / }).click()
  assert.ok(
    Math.abs((await player.evaluate((v) => v.currentTime)) - 12.5) < 0.1
  )
  assert.equal(await player.evaluate((v) => v.paused), true)
  await page.getByRole('button', { name: /^Clip 1 / }).click()
  const scene = page.getByTestId('story-block')
  await scene.locator('summary').click()
  await scene
    .getByRole('checkbox', { name: 'Entire scene', exact: true })
    .click()
  await page.waitForFunction(
    () =>
      document.querySelector(
        '[data-testid="story-block"] input[type="checkbox"]'
      )?.checked
  )
  assert.equal(
    await scene.getByRole('button', { name: 'Rework this scene' }).isDisabled(),
    true
  )
  await scene
    .getByRole('checkbox', { name: 'Entire scene', exact: true })
    .click()
  await page.waitForFunction(
    () =>
      !document.querySelector(
        '[data-testid="story-block"] input[type="checkbox"]'
      )?.checked
  )
  const playerNode = await player.elementHandle()
  await player.evaluate((v) => {
    v.currentTime = 0.6
  })
  originalScene = await readFile(sceneFile, 'utf8')
  await writeFile(
    sceneFile,
    originalScene.replace(
      'Scene details and changes',
      'Scene details and changes (refresh check)'
    )
  )
  await scene
    .getByText('Scene details and changes (refresh check) 1', { exact: true })
    .waitFor()
  assert.equal(await playerNode.evaluate((n) => n.isConnected), true)
  assert.equal(await scene.locator('details').getAttribute('open'), '')
  assert.ok(Math.abs((await player.evaluate((v) => v.currentTime)) - 0.6) < 0.1)
  await writeFile(sceneFile, originalScene)
  originalScene = undefined
  await scene
    .getByText('Scene details and changes 1', { exact: true })
    .waitFor()
  await scene
    .getByLabel('Use another take 1', { exact: true })
    .selectOption('candidate-1')
  await page.getByText(/Vertical · Version 2/).waitFor()
  assert.equal(actions.at(-1).action, 'alternate')
  assert.equal(actions.at(-1).block_id, 'block-0')
  await page.getByLabel('Compare versions', { exact: true }).selectOption('1')
  await page
    .getByText('Watching a previous version.', { exact: true })
    .waitFor()
  assert.equal(
    await page
      .getByRole('button', { name: 'Faster pace', exact: true })
      .isDisabled(),
    true
  )
  await page
    .getByRole('button', { name: 'Back to current', exact: true })
    .click()
  await page.getByRole('button', { name: 'Edit clips', exact: true }).click()
  actionGate = new Promise((resolve) => {
    releaseAction = resolve
  })
  await page.getByRole('button', { name: 'Faster pace', exact: true }).click()
  await page
    .getByTestId('story-operation')
    .filter({ hasText: 'Processing' })
    .waitFor()
  assert.equal(
    await page
      .getByRole('button', { name: 'Faster pace', exact: true })
      .isDisabled(),
    true
  )
  assert.equal(actions.length, 2)
  releaseAction()
  actionGate = undefined
  await page
    .getByTestId('story-operation')
    .filter({ hasText: 'New version saved' })
    .waitFor()
  for (const [label, action] of [
    ['Smoother flow', 'improve_flow'],
    ['Smoother transitions', 'improve_transitions']
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await page
      .getByTestId('story-operation')
      .filter({ hasText: 'New version saved' })
      .waitFor()
    assert.equal(actions.at(-1).action, action)
  }
  failAction = true
  await page.getByRole('button', { name: 'Faster pace', exact: true }).click()
  await page
    .getByRole('alert')
    .filter({ hasText: 'The action could not finish' })
    .waitFor()
  assert.equal(
    await page
      .getByRole('link', { name: 'Download draft', exact: true })
      .count(),
    1,
    'Earlier export remains usable after failure'
  )
  failAction = false
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await page.getByRole('combobox', { name: 'Brand kit', exact: true }).click()
  await page.getByRole('option', { name: 'My brand kit', exact: true }).click()
  await page
    .getByRole('button', { name: 'Apply appearance', exact: true })
    .click()
  await page
    .getByTestId('story-operation')
    .filter({ hasText: 'New version saved' })
    .waitFor()
  assert.equal(actions.at(-1).action, 'restyle')
  assert.equal(actions.at(-1).style.use_brand_kit, true)
  assert.equal(actions.at(-1).expected_state, project.expected_state)
  assert.equal(actions.at(-1).style.caption_style, undefined)
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  // A worker failure keeps a playable ready version but must survive refresh.
  project.operation_status = 'failed'
  project.message =
    'The edit could not finish; the previous reviewed version is retained'
  await page.reload()
  await page
    .getByTestId('story-operation')
    .filter({ hasText: 'The action could not finish' })
    .waitFor()
  assert.equal(
    await page
      .getByRole('link', { name: 'Download draft', exact: true })
      .count(),
    1
  )
  assert.equal(
    await page
      .getByTestId('story-operation')
      .getByRole('button', { name: 'Retry', exact: true })
      .count(),
    0,
    'Unknown failed operation is never replayed as a different edit'
  )
  project.operation_status = 'unchanged'
  project.message = ''
  await page.reload()
  await page.getByTestId('story-result').waitFor()
  assert.equal(await page.getByTestId('story-operation').count(), 0)
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
  assert.deepEqual(errors, [])
  console.log(
    'PASS: player-led result, no default scenes/reports, compact timeline, real media seeking, locks, alternate and all improvements, duplicate prevention, failure retains export, version comparison, sidebar/header DOM identity, component-scoped Fast Refresh, desktop/mobile EN/RO'
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
