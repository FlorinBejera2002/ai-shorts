import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
page.setDefaultTimeout(60000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const userID = '00000000-0000-4000-8000-000000000001'
const fileCount = Number(process.env.TEST_FILE_COUNT || 5)
assert.ok([5, 10].includes(fileCount))
const uploads = new Map()
const registrations = new Map()
const generations = []
let activeUploads = 0
let maxUploads = 0
let polls = 0
let locked = false
let project
let releaseValidation
const validationGate = new Promise((resolve) => {
  releaseValidation = resolve
})
const coverage = {
  plan: true,
  file: true,
  audio: true,
  visual: false,
  captions: true,
  semantics: true,
  boundaries: true,
  incomplete: ['A visual reviewer was unavailable.']
}

function makeVersion(number, candidate = 'candidate-1') {
  return {
    number,
    parent: number - 1,
    accepted: true,
    plan: {
      title: 'A story from five recordings',
      summary: 'One complete source-backed story.',
      gaps: [],
      blocks: [
        {
          id: 'block-1',
          candidate_id: candidate,
          role: 'hook',
          reason: 'The complete introduction.',
          alternatives: ['candidate-2'],
          locked: false,
          lock_text: false,
          lock_order: false,
          lock_crop: false
        }
      ]
    },
    timeline: [
      {
        block_id: 'block-1',
        output_in: 0,
        output_out: number === 1 ? 8 : 10,
        video: { source_id: project.assets[0].id, in: 1, out: 9 },
        audio: { source_id: project.assets[0].id, in: 1, out: 9 }
      }
    ],
    report: {
      status: 'needs_review',
      coverage,
      issues: [
        {
          id: 'visual-1',
          type: 'review_incomplete',
          severity: 'major',
          start: 0,
          end: 8,
          evidence: 'Verify the final framing.',
          resolved: false
        },
        {
          id: 'captions-1',
          type: 'caption_text',
          severity: 'major',
          start: 1,
          end: 4,
          evidence: 'A spoken number is transcribed incorrectly.',
          repair_note: 'Caption words require correction; changing timing cannot fix them.',
          resolved: false
        }
      ]
    }
  }
}

await page.route('**/v1/**', (route) =>
  route.fulfill({
    json: {
      access_token: 'synthetic-token',
      user: {
        id: userID,
        email: 'story@example.invalid',
        name: 'Test',
        credits: 100,
        plan: 'free',
        access_role: 'member'
      }
    }
  })
)
await page.route('**/api/**', async (route) => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  const method = request.method()
  if (path === '/api/workspace-agent/runs')
    return route.fulfill({ json: { runs: [], has_more: false } })
  if (path === '/api/workspace-agent/suggestions')
    return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  if (path === '/api/upload/authorize')
    return route.fulfill({ json: { uploadUrl: '/api/upload', token: null } })
  if (path === '/api/upload') {
    const body = request.postDataBuffer()?.toString() ?? ''
    const name = /filename="([^"]+)"/.exec(body)?.[1]
    assert.ok(
      name,
      'XHR sends the File as multipart without reading it into JavaScript memory'
    )
    uploads.set(name, (uploads.get(name) ?? 0) + 1)
    activeUploads++
    maxUploads = Math.max(maxUploads, activeUploads)
    await new Promise((resolve) => setTimeout(resolve, 150))
    activeUploads--
    if (name === 'clip-3.mp4' && uploads.get(name) === 1)
      return route.fulfill({ status: 503, json: { error: 'Temporary upload failure' } })
    return route.fulfill({ json: { file_path: `uploads/${name}` } })
  }
  if (path === '/api/stories') {
    if (method === 'GET')
      return route.fulfill({ json: { stories: project ? [project] : [] } })
    const body = request.postDataJSON()
    project = {
      id: body.id,
      options: body.options,
      status: 'draft',
      assets: [],
      versions: [],
      current_version: 0,
      limits: {
        max_files: 20,
        max_file_bytes: 2 * 1024 ** 3,
        max_total_bytes: 10 * 1024 ** 3,
        max_source_seconds: 900,
        max_total_seconds: 3600
      }
    }
    return route.fulfill({ json: project })
  }
  if (path.endsWith('/assets') && method === 'POST') {
    const body = request.postDataJSON()
    registrations.set(body.name, (registrations.get(body.name) ?? 0) + 1)
    if (body.name === 'clip-1.mp4') await validationGate
    assert.equal(
      body.order,
      Number(/clip-(\d+)/.exec(body.name)[1]) - 1,
      'Selection order survives concurrent validation'
    )
    const asset = {
      id: body.id,
      name: body.name,
      size: 20,
      duration: 12,
      role: 'auto',
      include: 'auto',
      order: body.order,
      source_url: `/original/${body.name}`,
      candidates: []
    }
    if (body.name === 'clip-1.mp4')
      asset.candidates = [
        {
          id: 'candidate-1',
          source_id: body.id,
          in: 1,
          out: 9,
          text: 'The original complete sentence.',
          confidence: 0.95,
          reason: 'Clear audio.'
        },
        {
          id: 'candidate-2',
          source_id: body.id,
          in: 1,
          out: 11,
          text: 'Another complete take.',
          confidence: 0.95,
          reason: 'Clearer delivery.'
        }
      ]
    project.assets.push(asset)
    project.assets.sort((a, b) => a.order - b.order)
    return route.fulfill({ json: project })
  }
  if (path.endsWith('/generate')) {
    const body = request.postDataJSON()
    generations.push(body)
    if (!body.action) {
      assert.deepEqual(
        [...body.asset_ids].sort(),
        project.assets.map((asset) => asset.id).sort()
      )
      assert.equal(body.asset_ids.length, fileCount)
      project.versions = [makeVersion(1)]
      project.current_version = 1
    } else {
      assert.equal(body.action, 'alternate')
      assert.equal(body.candidate_id, 'candidate-2')
      assert.equal(body.version, 1)
      project.versions.push(makeVersion(2, 'candidate-2'))
      project.current_version = 2
    }
    project.status = 'reviewing'
    polls = 0
    return route.fulfill({ status: 202, json: { status: 'pending' } })
  }
  if (path.endsWith('/rollback')) {
    project.current_version = request.postDataJSON().version
    project.status = 'needs_review'
    return route.fulfill({ json: project })
  }
  if (project && path === `/api/stories/${project.id}`) {
    if (method === 'PATCH') {
      const body = request.postDataJSON()
      assert.equal('request_id' in body, false, 'PATCH uses the strict settings schema')
      if (body.options) project.options = body.options
      if (body.locks) {
        assert.equal(body.version, project.current_version)
        Object.assign(
          project.versions.find((version) => version.number === body.version).plan
            .blocks[0],
          body.locks[0]
        )
        locked = body.locks[0].locked
      }
      return route.fulfill({ json: project })
    }
    if (project.status === 'reviewing' && ++polls >= 2) project.status = 'needs_review'
    return route.fulfill({ json: project })
  }
  return route.fulfill({ json: {} })
})

try {
  const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5191'
  await page.goto(`${origin}/dashboard/create`, {
    waitUntil: 'domcontentloaded',
    timeout: 180000
  })
  await page
    .getByRole('heading', { name: 'Multi-Clip Story Builder' })
    .waitFor({ timeout: 30000 })
  const fileInput = page.getByLabel('Upload story clips')
  assert.equal(await page.locator('#youtube-url').count(), 0, 'Legacy import mounts only when opened')
  await fileInput.setInputFiles(
    Array.from({ length: fileCount }, (_, index) => ({
      name: `clip-${index + 1}.mp4`,
      mimeType: 'video/mp4',
      buffer: Buffer.from(`synthetic video fixture ${index}`)
    }))
  )
  await page
    .getByRole('status')
    .filter({ hasText: 'Validating on server' })
    .first()
    .waitFor()
  assert.equal(
    await page.getByRole('button', { name: 'Build my story' }).isDisabled(),
    true
  )
  releaseValidation()
  await page
    .getByRole('button', { name: 'Retry failed uploads', exact: true })
    .waitFor()
  await page.getByRole('button', { name: 'Retry failed uploads', exact: true }).click()
  const confirmation = page.getByRole('checkbox', {
    name: 'All my clips are uploaded. Use this complete set.'
  })
  await confirmation.waitFor()
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll('[data-testid="validated-source"]').length === count,
    fileCount
  )
  assert.equal(maxUploads <= 2, true, 'Concurrency is bounded at two')
  assert.equal(uploads.get('clip-3.mp4'), 2)
  assert.equal(uploads.get('clip-1.mp4'), 1)
  assert.equal(registrations.get('clip-1.mp4'), 1)
  assert.equal(
    await page.getByRole('button', { name: 'Build my story' }).isDisabled(),
    true
  )
  await confirmation.check()
  await page.getByRole('button', { name: 'Build my story', exact: true }).click()
  await page.getByRole('heading', { name: 'Story timeline' }).waitFor()
  await page
    .getByRole('status')
    .filter({ hasText: 'Needs review' })
    .waitFor({ timeout: 15000 })
  assert.equal(generations.length, 1, 'Multiple files produce one story job')
  await page.getByText('A visual reviewer was unavailable.').waitFor()
  await page.getByText('Caption words require correction; changing timing cannot fix them.').waitFor()
  await page.getByRole('checkbox', { name: 'Entire section', exact: true }).click()
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="story-block"] input[type="checkbox"]')
        ?.checked
  )
  assert.equal(locked, true)
  assert.equal(
    await page.getByRole('button', { name: 'Regenerate this section' }).isDisabled(),
    true
  )
  await page.getByRole('checkbox', { name: 'Entire section', exact: true }).click()
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-testid="story-block"] input[type="checkbox"]')
        ?.checked
  )
  const alternate = page.getByLabel('Use another take 1', { exact: true })
  await alternate.selectOption('candidate-2')
  await page.getByText('Version 2', { exact: false }).first().waitFor()
  await page
    .getByRole('status')
    .filter({ hasText: 'Needs review' })
    .waitFor({ timeout: 15000 })
  await page.getByLabel('Restore version', { exact: true }).selectOption('1')
  await page.getByText('Natural · Version 1', { exact: true }).waitFor()
  await page.reload()
  await page.getByRole('heading', { name: 'Story timeline' }).waitFor()
  assert.equal(
    await page.locator('[data-testid="validated-source"]').count(),
    fileCount,
    'Reload restores successful uploads'
  )
  const storyHeading = await page.getByRole('heading', { name: 'Story timeline' }).elementHandle()
  await page.getByRole('button', { name: 'Import a video or link' }).click()
  await page.locator('#youtube-url').fill('draft source link to preserve')
  await page.getByRole('tab', { name: 'Batch', exact: true }).click()
  const batchInput = page.getByRole('textbox', { name: 'YouTube URL 1', exact: true })
  await batchInput.fill('draft batch source to preserve')
  const legacyInput = await batchInput.elementHandle()
  const legacySlider = page.getByRole('slider', { name: 'Clips per video' })
  await legacySlider.focus()
  await legacySlider.press('ArrowRight')
  const selectedClipCount = await legacySlider.getAttribute('aria-valuenow')
  await page.getByRole('button', { name: 'Multi-clip story', exact: true }).click()
  assert.equal(await legacyInput.evaluate((node) => node.isConnected), true, 'Legacy import stays mounted while hidden')
  assert.equal(await storyHeading.evaluate((node) => node.isConnected), true, 'Story editor keeps its mounted state')
  await page.getByText('Natural · Version 1', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Import a video or link' }).click()
  assert.equal(await page.getByRole('tab', { name: 'Batch', exact: true }).getAttribute('aria-selected'), 'true')
  assert.equal(await batchInput.inputValue(), 'draft batch source to preserve')
  assert.equal(await legacySlider.getAttribute('aria-valuenow'), selectedClipCount)
  await page.getByRole('tab', { name: 'YouTube', exact: true }).click()
  assert.equal(await page.locator('#youtube-url').inputValue(), 'draft source link to preserve')
  await page.getByRole('button', { name: 'Multi-clip story', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    ),
    true
  )
  assert.deepEqual(errors, [])
  if (process.env.TEST_SCREENSHOT)
    await page.screenshot({ path: process.env.TEST_SCREENSHOT, fullPage: true })
  console.log(
    `PASS: bounded ${fileCount}-file upload, selection order, server validation, failed-only retry, exact set confirmation, one generation, repair explanations, locks, alternate take, rollback, restoration, both modes preserve state, and mobile layout`
  )
} catch (error) {
  console.error(error)
  console.error({
    url: page.url(),
    errors,
    body: (await page.locator('body').innerText()).slice(0, 7000)
  })
  throw error
} finally {
  releaseValidation()
  await browser.close()
}
