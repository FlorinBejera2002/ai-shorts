import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } })
page.setDefaultTimeout(30000)
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5173'
const output = process.env.TEST_SCREENSHOT_DIR || 'test-results/job-load-recovery'
const id = '00000000-0000-4000-8000-000000000097'
let unavailable = true
let jobRequests = 0
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

try {
  await mkdir(output, { recursive: true })
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  await page.route('**/v1/**', (route) => route.fulfill({ json: {
    access_token: 'synthetic-token',
    user: {
      id: '00000000-0000-4000-8000-000000000098',
      email: 'job-load@example.invalid', name: 'Job fixture',
      credits: 100, plan: 'free', access_role: 'member'
    }
  } }))
  await page.route('**/api/**', (route) => {
    assert.equal(route.request().method(), 'GET', 'Loading recovery never mutates a job')
    const path = new URL(route.request().url()).pathname
    if (path === `/api/jobs/${id}`) {
      jobRequests++
      return unavailable
        ? route.fulfill({ status: 404, json: {} })
        : route.fulfill({ json: { job: {
            id, status: 'rendering', progress: 64,
            progress_message: 'Synthetic render in progress', processing_active: true
          } } })
    }
    if (path === '/api/workspace-agent/runs')
      return route.fulfill({ json: { runs: [], has_more: false } })
    if (path === '/api/workspace-agent/suggestions')
      return route.fulfill({ json: { suggestions: [], capabilities: [] } })
    return route.fulfill({ json: {} })
  })

  await page.goto(`${origin}/dashboard/jobs/${id}`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('alert').filter({ hasText: 'Could not load job' }).waitFor()
  assert.equal(await page.getByRole('progressbar').count(), 0, 'A failed initial load has no invented percentage')
  assert.equal(await page.locator('.job-processing').count(), 0, 'A failed initial load has no invented stage')
  assert.equal(await page.getByRole('button', { name: 'Cancel processing', exact: true }).count(), 0)
  await page.screenshot({ path: `${output}/desktop-unavailable.png`, fullPage: true })

  unavailable = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await page.locator('.job-processing[data-stage="rendering"]').waitFor()
  assert.ok(jobRequests >= 2)
  assert.equal(await page.getByRole('alert').count(), 0)
  assert.equal(await page.locator('.job-header-progress [role="progressbar"]').getAttribute('aria-valuenow'), '64')
  assert.equal(await page.getByRole('button', { name: 'Cancel processing', exact: true }).isEnabled(), true)
  await page.screenshot({ path: `${output}/desktop-loaded.png`, fullPage: true })

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: `${output}/mobile-${width}.png`, fullPage: true })
  }
  assert.deepEqual(errors, [])
  console.log('PASS: initial job load error shows no invented stage/progress, Try again loads real status, existing pipeline and mobile layout remain available')
} finally {
  await browser.close()
}
