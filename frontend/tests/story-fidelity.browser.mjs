import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE)
  throw Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } })
page.setDefaultTimeout(30000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const optionsPath = new URL(
  '../src/components/story/story-options.tsx',
  import.meta.url
)
const optionsSource = readFileSync(optionsPath, 'utf8')
const projects = []
const submissions = []
let uploads = 0
let failRegistration = true
let failSubmission = true
let failProcessing = true
const video = process.env.TEST_VIDEO
  ? readFileSync(process.env.TEST_VIDEO)
  : null
const limits = {
  max_files: 20,
  max_file_bytes: 2 * 1024 ** 3,
  max_total_bytes: 10 * 1024 ** 3,
  max_source_seconds: 900,
  max_total_seconds: 3600
}
const userID = '00000000-0000-4000-8000-000000000082'
const originalBrief =
  'Use all dialogue captions. Keep the original sequence. No music.'
let project
let hotEdited = false

await page.route('**/v1/**', (route) =>
  route.fulfill({
    json: {
      access_token: 'synthetic-token',
      user: {
        id: userID,
        email: 'story-fidelity@example.invalid',
        name: 'Fidelity fixture',
        credits: 100,
        plan: 'free',
        access_role: 'member'
      }
    }
  })
)
await page.route('**/fixture.mp4', (route) =>
  video
    ? route.fulfill({ contentType: 'video/mp4', body: video })
    : route.fulfill({ status: 204 })
)
await page.route('**/api/**', async (route) => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  const method = request.method()
  const body =
    method === 'GET' || path === '/api/upload' ? null : request.postDataJSON()
  if (path === '/api/workspace-agent/runs')
    return route.fulfill({ json: { runs: [], has_more: false } })
  if (path === '/api/workspace-agent/suggestions')
    return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  if (path === '/api/upload/authorize')
    return route.fulfill({ json: { uploadUrl: '/api/upload', token: null } })
  if (path === '/api/upload') {
    uploads++
    return route.fulfill({
      json: { file_path: `uploads/source-${uploads}.mp4` }
    })
  }
  if (path === '/api/stories') {
    if (method === 'GET')
      return route.fulfill({ json: { stories: projects, limits } })
    project = {
      id: body.id,
      options: body.options,
      status: 'draft',
      assets: [],
      versions: [],
      current_version: 0,
      limits
    }
    projects.push(project)
    return route.fulfill({ json: project })
  }
  if (path.endsWith('/assets')) {
    if (failRegistration) {
      failRegistration = false
      return route.fulfill({
        status: 503,
        json: { error: 'Validation temporarily unavailable. Retry this clip.' }
      })
    }
    project.assets.push({
      id: body.id,
      name: body.name,
      size: 12000,
      duration: 12,
      order: body.order,
      role: 'auto',
      include: 'auto',
      kind: 'video',
      source_url: '/fixture.mp4'
    })
    return route.fulfill({ json: project })
  }
  if (path.endsWith('/generate')) {
    submissions.push({
      ...body,
      mode: project.options.caption_mode,
      brief: project.options.brief
    })
    assert.deepEqual(
      body.asset_ids,
      project.assets.map((asset) => asset.id)
    )
    if (failSubmission) {
      failSubmission = false
      return route.fulfill({
        status: 503,
        json: {
          error: 'Submission interrupted. Retry without uploading again.'
        }
      })
    }
    if (failProcessing) {
      failProcessing = false
      project.status = 'failed'
      project.error = 'Synthetic worker interruption. Your clips are saved.'
    } else {
      project.status = 'ready'
      project.current_version = 1
      project.versions = [
        {
          number: 1,
          parent: 0,
          accepted: true,
          preview_url: '/fixture.mp4',
          plan: { title: 'Fixture', summary: '', blocks: [] },
          timeline: [],
          report: {
            status: 'ready',
            coverage: {
              plan: true,
              file: true,
              audio: true,
              visual: true,
              captions: true,
              semantics: true,
              boundaries: true
            }
          }
        }
      ]
    }
    return route.fulfill({ json: project })
  }
  if (project && path === `/api/stories/${project.id}`) {
    if (method === 'PATCH' && body.options) {
      if (
        body.options.brief === originalBrief &&
        body.options.caption_mode !== 'all'
      )
        return route.fulfill({
          status: 422,
          json: {
            error:
              'Caption choice conflicts with the brief. Select all dialogue or edit the request.'
          }
        })
      project.options = body.options
      if (project.status === 'failed') {
        project.status = 'draft'
        project.error = ''
      }
    }
    return route.fulfill({ json: project })
  }
  return route.fulfill({ json: {} })
})
const wizard = page.getByTestId('story-wizard')
const brief = page.getByRole('textbox', {
  name: 'Describe your video (optional)',
  exact: true
})
const build = page.getByRole('button', { name: 'Build my story', exact: true })
const next = async (step) => {
  await wizard.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByTestId(`story-step-${step}`).waitFor({ state: 'visible' })
}
const chooseStep = async (index) => {
  await wizard.locator('nav button').nth(index).click()
  await page.getByTestId(`story-step-${index}`).waitFor({ state: 'visible' })
}
const upload = async () => {
  await page.getByLabel('Upload story clips', { exact: true }).setInputFiles({
    name: 'source.mp4',
    mimeType: 'video/mp4',
    buffer: video ?? Buffer.from('synthetic clip')
  })
}
const inspectLayout = async (stage) => {
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 960 })
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      ),
      true,
      `${stage} fits the ${width}px viewport`
    )
    if (process.env.TEST_SCREENSHOT)
      await page.screenshot({
        path: process.env.TEST_SCREENSHOT.replace(
          /\.png$/,
          `-${stage}-${width}.png`
        ),
        fullPage: true,
        animations: 'disabled'
      })
  }
  await page.setViewportSize({ width: 1280, height: 960 })
}
try {
  const origin = process.env.TEST_ORIGIN || 'http://localhost:3000'
  await page.goto(`${origin}/dashboard/create`, {
    waitUntil: 'networkidle',
    timeout: 180000
  })
  await upload()
  await page
    .getByRole('button', { name: 'Retry failed uploads', exact: true })
    .click()
  await page.getByTestId('validated-source').waitFor()
  assert.equal(
    uploads,
    1,
    'Server validation retry reuses the already transferred bytes'
  )
  await inspectLayout('sources')
  await next(1)
  await brief.fill(originalBrief)
  await inspectLayout('brief')
  const textarea = await brief.elementHandle()
  const sidebar = await page.locator('[data-slot="sidebar"]').elementHandle()
  const header = await page.locator('header').first().elementHandle()
  const documentMarker = await page.evaluate(
    () => (window.storyFidelityDocument = crypto.randomUUID())
  )
  writeFileSync(
    optionsPath,
    optionsSource.replace(
      /<fieldset(\s+)disabled=\{disabled\}/,
      '<fieldset data-story-refresh="verified"$1disabled={disabled}'
    )
  )
  hotEdited = true
  await page
    .locator('[data-story-refresh="verified"]')
    .first()
    .waitFor({ state: 'attached', timeout: 60000 })
  assert.equal(
    await page.evaluate(() => window.storyFidelityDocument),
    documentMarker,
    'Component edit never reloads the document'
  )
  assert.equal(
    await brief.inputValue(),
    originalBrief,
    'Fast Refresh preserves the unsaved original request'
  )
  assert.equal(await textarea.evaluate((node) => node.isConnected), true)
  assert.equal(
    await sidebar.evaluate(
      (node) => node === document.querySelector('[data-slot="sidebar"]')
    ),
    true
  )
  assert.equal(
    await header.evaluate((node) => node === document.querySelector('header')),
    true
  )
  writeFileSync(optionsPath, optionsSource)
  hotEdited = false
  assert.equal(
    await page
      .getByRole('radio', { name: 'No captions', exact: true })
      .isChecked(),
    true
  )
  await wizard.getByRole('button', { name: 'Continue', exact: true }).click()
  await page
    .getByRole('alert')
    .filter({ hasText: 'caption choice conflicts' })
    .waitFor()
  await chooseStep(1)
  assert.equal(
    await brief.inputValue(),
    originalBrief,
    'Validation preserves the full original request'
  )
  await page.getByRole('radio', { name: 'All dialogue', exact: true }).check()
  await inspectLayout('captions')
  await next(2)
  await inspectLayout('generate')
  await build.click()
  await page
    .getByRole('alert')
    .filter({ hasText: 'The action could not finish' })
    .waitFor()
  await build.click()
  await page
    .getByRole('alert')
    .filter({ hasText: 'The action could not finish' })
    .waitFor()
  assert.equal(
    submissions[0].request_id,
    submissions[1].request_id,
    'An uncertain submission retries with the same request identity'
  )
  assert.equal(uploads, 1)
  await chooseStep(1)
  assert.equal(
    await brief.isEditable(),
    true,
    'A failed project can correct its request'
  )
  assert.equal(await brief.inputValue(), originalBrief)
  assert.equal(
    await page
      .getByRole('radio', { name: 'All dialogue', exact: true })
      .isChecked(),
    true
  )
  await next(2)
  await build.click()
  await page
    .getByRole('link', { name: 'Download video', exact: true })
    .waitFor()
  assert.equal(uploads, 1, 'Worker retry preserves registered source files')
  if (video) {
    await page.waitForFunction(
      () =>
        document.querySelector('video[aria-label="Story preview"]')
          ?.readyState >= 2
    )
    await page
      .getByLabel('Story preview', { exact: true })
      .evaluate((node) => node.play())
    await page.waitForFunction(
      () =>
        document.querySelector('video[aria-label="Story preview"]')
          ?.currentTime > 0
    )
  }
  await inspectLayout('result')
  for (const [mode, label] of [
    ['selective', 'Only hard-to-hear speech'],
    ['off', 'No captions']
  ]) {
    await page.getByRole('button', { name: 'New story', exact: true }).click()
    await upload()
    await page.getByTestId('validated-source').waitFor()
    await next(1)
    await brief.fill('Keep the original order and audio. No added music.')
    await page.getByRole('radio', { name: label, exact: true }).check()
    await next(2)
    await build.click()
    await page
      .getByRole('link', { name: 'Download video', exact: true })
      .waitFor()
    assert.equal(submissions.at(-1).mode, mode)
    assert.equal(project.options.captions, mode !== 'off')
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS: all caption modes, original request fidelity, conflict recovery, validation/submission/worker retries without re-upload, stable idempotency, component Fast Refresh and shared layout identity, preview/download' +
      (video
        ? ', actual video playback'
        : ' (playback skipped: TEST_VIDEO not supplied)')
  )
} finally {
  if (hotEdited) writeFileSync(optionsPath, optionsSource)
  await browser.close()
}
