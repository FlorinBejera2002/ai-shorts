// Local UI verification with mocked APIs; no real account, job or database is used.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
)
const base = process.env.SNEEPCUT_UI_ORIGIN ?? 'http://localhost:3000'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const output = 'test-results/job-processing'
await mkdir(output, { recursive: true })
const user = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Preview',
  email: 'preview@example.invalid',
  credits: 100,
  plan: 'free',
  access_role: 'member'
}
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }
  })
  await context.addInitScript(() => localStorage.setItem('theme', 'light'))
  let job = {
    id: 'preview-job',
    status: 'analyzing',
    progress: 48,
    progress_message: 'Finding your best moments'
  }
  let jobRequests = 0
  await context.route(/\/(?:api|v1)\//, async (route) => {
    const path = new URL(route.request().url()).pathname
    let data
    if (path === '/v1/auth/refresh') data = { access_token: 'synthetic', user }
    else if (path.startsWith('/api/jobs/')) {
      data = { job }
      jobRequests++
    } else if (path === '/api/dashboard/review') data = { clips: [] }
    else if (path === '/api/user/credits') data = { credits: 100, plan: 'free' }
    else return route.abort()
    await route.fulfill({ json: data })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const visit = async (locale = 'ro') => {
    await page.goto(`${base}/${locale}/dashboard/jobs/preview-job`, {
      waitUntil: 'networkidle',
      timeout: 120000
    })
    try {
      await page.locator('.job-processing').waitFor()
    } catch (error) {
      await page.screenshot({ path: `${output}/failure.png`, fullPage: true })
      console.error(page.url(), await page.locator('body').innerText(), errors)
      throw error
    }
  }
  await visit()
  assert.equal(
    await page.locator('.job-stage-map li[data-state="done"]').count(),
    3
  )
  assert.equal(await page.locator('[aria-current="step"]').count(), 1)
  assert.equal(
    await page
      .locator('.job-processing [role="progressbar"]')
      .getAttribute('aria-valuenow'),
    '48'
  )
  assert.equal(
    await page.locator('.studio-workbench-header [role="progressbar"]').count(),
    1
  )
  const headerBounds = await page
    .locator('.studio-workbench-header')
    .boundingBox()
  const dialBounds = await page
    .locator('.studio-workbench-header [role="progressbar"]')
    .boundingBox()
  assert.ok(
    dialBounds.x > headerBounds.x + headerBounds.width / 2,
    'Progress sits on the right of the dark header'
  )
  assert.ok(
    (await page.locator('.job-processing').boundingBox()).height < 560,
    'Focused processing panel stays compact'
  )
  assert.equal(await page.locator('.job-ai-core').count(), 1)
  assert.equal(await page.locator('.job-stage-activity i').count(), 3)
  assert.match(await page.locator('.job-stage-copy').innerText(), /Analiză/)
  assert.match(
    await page.locator('.job-thinking-line').innerText(),
    /Finding your best moments/
  )
  await page.screenshot({
    path: `${output}/active-desktop.png`,
    fullPage: true
  })

  // A live polling update must move the active stage and progress without navigation.
  job = {
    ...job,
    status: 'rendering',
    progress: 86,
    progress_message: 'Rendering your clips'
  }
  await page.waitForFunction(
    () =>
      document
        .querySelector('.job-processing [role="progressbar"]')
        ?.getAttribute('aria-valuenow') === '86'
  )
  await page
    .locator('.job-stage-copy')
    .getByText('Randare', { exact: true })
    .waitFor()
  assert.equal(
    await page.locator('.job-stage-map li[data-state="done"]').count(),
    5
  )
  assert.match(await page.locator('.job-stage-copy').innerText(), /Randare/)

  job = {
    ...job,
    status: 'failed',
    progress: 5,
    error_message: 'video duration 10834.0s exceeds max 7200s'
  }
  await visit()
  assert.match(
    await page.locator('.job-processing-description').innerText(),
    /181.*120/
  )
  assert.equal(await page.locator('[aria-current="step"]').count(), 0)
  assert.equal(
    await page.locator('.job-processing').getAttribute('data-running'),
    'false'
  )
  assert.equal(
    await page.locator('.job-stage-activity').count(),
    0,
    'Failed jobs have no live activity indicator'
  )
  assert.equal(
    await page
      .locator('.job-ai-orbit-one')
      .evaluate((el) => getComputedStyle(el).animationName),
    'none'
  )
  await page.getByText('Detalii tehnice', { exact: true }).click()
  assert.equal(await page.locator('details').getAttribute('open'), '')
  assert.equal(
    await page.locator('.job-processing-result a').getAttribute('href'),
    '/ro/dashboard/create'
  )
  await page.screenshot({
    path: `${output}/failed-desktop.png`,
    fullPage: true
  })
  const requestsAtFailure = jobRequests
  await page.waitForTimeout(5500)
  assert.equal(
    jobRequests,
    requestsAtFailure,
    'Terminal jobs must stop polling'
  )
  // Optional development check: a component edit preserves the existing page and details.
  if (process.env.SNEEPCUT_CHECK_HMR === '1') {
    const component = new URL(
      '../src/components/jobs/job-processing-panel.tsx',
      import.meta.url
    )
    const original = await readFile(component, 'utf8')
    const marker = `job-hmr-${Date.now()}`
    const changed = original.replace(
      'className="job-processing"',
      `className="job-processing" data-hmr-probe="${marker}"`
    )
    assert.notEqual(original, changed)
    await page.evaluate(() => {
      window.__jobPageSentinel = 'preserved'
    })
    try {
      await writeFile(component, changed)
      await page
        .locator(`[data-hmr-probe="${marker}"]`)
        .waitFor({ timeout: 60000 })
      assert.equal(
        await page.evaluate(() => window.__jobPageSentinel),
        'preserved'
      )
      assert.equal(await page.locator('details').getAttribute('open'), '')
      assert.equal(
        jobRequests,
        requestsAtFailure,
        'Component refresh preserves parent polling state'
      )
    } finally {
      const current = await readFile(component, 'utf8')
      await writeFile(
        component,
        current.replace(` data-hmr-probe="${marker}"`, '')
      )
    }
    console.info(
      'PASS: component Fast Refresh preserves page, details and polling state'
    )
  }
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      `No overflow at ${width}px`
    )
    await page.screenshot({
      path: `${output}/failed-${width}.png`,
      fullPage: true
    })
  }
  job = { ...job, status: 'completed', progress: 98 }
  await visit('en')
  assert.equal(
    await page
      .locator('.job-processing [role="progressbar"]')
      .getAttribute('aria-valuenow'),
    '100'
  )
  assert.equal(
    await page.locator('.job-stage-map li[data-state="done"]').count(),
    7
  )
  assert.equal(
    await page.locator('.job-processing-result a').getAttribute('href'),
    '/dashboard/clips'
  )

  job = { ...job, status: 'cancelled', progress: -5 }
  await visit()
  assert.equal(
    await page
      .locator('.job-processing [role="progressbar"]')
      .getAttribute('aria-valuenow'),
    '0'
  )
  assert.equal(await page.locator('[aria-current="step"]').count(), 0)

  job = { ...job, status: 'transcribing', progress: 25 }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visit()
  assert.equal(
    await page
      .locator('.job-ai-orbit-one')
      .evaluate((el) => getComputedStyle(el).animationName),
    'none'
  )
  assert.equal(
    await page
      .locator('.job-stage-activity i')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
    'none'
  )
  assert.deepEqual(errors, [])
  console.info(
    'PASS: live stage updates, progress, failure details, terminal polling, success, cancellation, mobile overflow, reduced motion, no page errors'
  )
} finally {
  await browser.close()
}
