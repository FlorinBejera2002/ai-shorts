// UI-only regression checks. API traffic is fulfilled in the browser; no database is touched.
// PLAYWRIGHT_MODULE may point to an external Playwright installation.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const origin = process.env.SNEEPCUT_UI_ORIGIN ?? 'http://localhost:3000'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
const output = 'test-results/dashboard-overview'
await mkdir(output, { recursive: true })
const activity = Array.from({ length: 90 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 5, 10 + i)).toISOString().slice(0, 10),
  clips: i % 5 + 1, projects: 1
}))
const clips = Array.from({ length: 6 }, (_, i) => ({
  id: `synthetic-clip-${i}`, title: ['Finding your creative rhythm', 'A fresh perspective',
    'The moment that matters', 'Make room for good ideas', 'Behind the scenes', 'One small change'][i],
  duration: 24 + i * 3, viralScore: 8, fileUrl: null, thumbnailUrl: null,
  resolution: '1080x1920'
}))
const user = { id: 'synthetic-dashboard-user', email: 'dashboard@example.invalid',
  name: 'Alex', profile_pic: null, credits: 120, plan: 'free', access_role: 'user' }
let empty = false
let queueError = false
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  await context.addInitScript(() => localStorage.setItem('theme', 'light'))
  const unexpected = []
  await context.route(/\/(api|v1)\//, async route => {
    const path = new URL(route.request().url()).pathname
    let data
    if (path === '/v1/auth/refresh') data = { access_token: 'synthetic', user }
    else if (path === '/api/dashboard') data = {
      metrics: { activity: empty ? activity.map(day => ({ ...day, clips: 0, projects: 0 })) : activity,
        statuses: { completed: empty ? 0 : 18, active: empty ? 0 : 1, failed: empty ? 0 : 1, cancelled: 0, other: 0 },
        clipCount: empty ? 0 : 64, jobCount: empty ? 0 : 20, durationMinutes: empty ? 0 : 38,
        credits: 120, plan: 'free' }, recentClips: empty ? [] : clips
    }
    else if (path === '/api/jobs') {
      if (queueError) return route.fulfill({ status: 503, json: { error: 'Synthetic unavailable' } })
      data = { jobs: empty ? [] : [{ id: 'synthetic-job', source_url: null,
        source_file_path: 'Studio interview.mp4', status: 'rendering', progress: 68, progress_message: null }] }
    } else { unexpected.push(path); return route.abort() }
    await route.fulfill({ json: data })
  })
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(120000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/dashboard`, { waitUntil: 'networkidle' })
  await page.getByTestId('studio-dashboard').waitFor().catch(async error => {
    console.log({ url: page.url(), body: await page.locator('body').innerText(), errors, unexpected })
    await page.screenshot({ path: `${output}/failure.png`, fullPage: true })
    throw error
  })
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true })
  console.log(await page.locator('main').innerText())
  if (process.env.SNEEPCUT_UI_INSPECT === '1') process.exitCode = 0
  else {
    await page.getByRole('button', { name: 'Quick navigation', exact: true }).click()
    const navigationDialog = page.getByRole('dialog')
    await navigationDialog.getByRole('textbox', { name: 'Quick navigation' }).fill('zzzz-no-page')
    await navigationDialog.getByRole('status').filter({ hasText: 'No pages found.' }).waitFor()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+k')
    await navigationDialog.getByRole('textbox', { name: 'Quick navigation' }).fill('Home')
    assert.equal(await navigationDialog.getByRole('link').count(), 1)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('href')), '/dashboard')
    await page.keyboard.press('Enter')
    await navigationDialog.waitFor({ state: 'hidden' })
    const clipSearch = page.getByRole('textbox', { name: 'Search recent clips' })
    await clipSearch.fill('creative rhythm')
    assert.equal(await page.locator('main a[href^="/dashboard/clips/synthetic-"]').count(), 1)
    await clipSearch.fill('')
    await page.getByRole('button', { name: 'List view', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: 'List view', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.screenshot({ path: `${output}/list-view.png`, fullPage: true })
    await page.getByRole('button', { name: 'Grid view', exact: true }).click()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    assert.equal(await page.locator('.studio-page-enter').evaluate(element => getComputedStyle(element).animationName), 'studio-arrive')
    await page.getByRole('button', { name: 'List view', exact: true }).click()
    await page.getByRole('button', { name: 'Grid view', exact: true }).click()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    assert.equal(await page.locator('.studio-page-enter').evaluate(element => getComputedStyle(element).animationName), 'none')
    const insights = page.getByTestId('dashboard-insights')
    const summary = insights.locator(':scope > summary')
    assert.equal(await insights.getAttribute('open'), null)
    await summary.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: '7 days', exact: true }).click()
    assert.equal(await page.getByTestId('range-clips').innerText(), String(activity.slice(-7).reduce((n, day) => n + day.clips, 0)))
    assert.equal(await page.getByTestId('range-projects').innerText(), '7')
    await page.getByRole('button', { name: '90 days', exact: true }).click()
    assert.equal(await page.getByTestId('range-projects').innerText(), '90')
    await page.getByText('View chart data', { exact: true }).click()
    assert.equal(await page.getByTestId('activity-card').locator('tbody tr').count(), 90)
    await page.screenshot({ path: `${output}/activity.png`, fullPage: true })
    await summary.click()
    assert.equal(await insights.getAttribute('open'), null)
    for (const mode of ['upload', 'youtube', 'batch']) {
      assert.equal(await page.locator(`main a[href="/dashboard/create?mode=${mode}"]`).count(), 1)
    }
    assert.equal(await page.locator('main a[href^="/dashboard/clips/synthetic-"]').count(), 6)
    await page.getByRole('button', { name: 'Preferences', exact: true }).click()
    await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click()
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
    await page.waitForFunction(() => [...document.images].filter(image => image.getClientRects().length).every(image => image.complete))
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await page.screenshot({ path: `${output}/dark.png`, fullPage: true })
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 900 })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await summary.click()
      await page.getByRole('button', { name: '30 days', exact: true }).click()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await summary.click()
    }
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
    await page.screenshot({ path: `${output}/mobile.png`, fullPage: true })
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
    await page.getByRole('dialog').waitFor()
    await page.keyboard.press('Escape')
    await page.goto(`${origin}/ro/dashboard`, { waitUntil: 'networkidle' })
    await page.getByTestId('studio-dashboard').waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.getByTestId('dashboard-insights').locator(':scope > summary').click()
    await page.getByRole('button', { name: '7 zile', exact: true }).click()
    assert.equal(await page.getByTestId('range-projects').innerText(), '7')
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
    await page.screenshot({ path: `${output}/romanian.png`, fullPage: true })
    empty = true
    await context.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: origin }])
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${origin}/dashboard`, { waitUntil: 'networkidle' })
    await page.getByText('Your next great clip starts here.', { exact: true }).waitFor()
    await page.screenshot({ path: `${output}/empty.png`, fullPage: true })
    queueError = true
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText('Could not load projects. Retrying automatically.', { exact: true }).waitFor()
    assert.deepEqual(errors, [])
    assert.deepEqual(unexpected, [])
    console.log('PASS: command navigation and keyboard shortcut, recent clip search/grid/list, keyboard disclosure, range totals, accessible data table, clip/action links, mobile navigation, EN/RO, light/dark, empty/error states and responsive overflow.')
  }
} finally {
  await browser.close()
}
