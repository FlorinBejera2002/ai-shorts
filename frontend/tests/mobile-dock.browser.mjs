import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Phone bottom bar (canvas "Navigare mobil"): where it shows, where it goes, how it moves.
// Start Vite separately; every API read is mocked.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const output = new URL('../test-results/mobile-dock/', import.meta.url)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
const user = { id: '00000000-0000-4000-8000-000000005001', email: 'dock@example.invalid', name: 'Ana Pop', profile_pic: null, credits: 10, plan: 'pro', access_role: 'member' }
const clips = Array.from({ length: 24 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(5200 + index).padStart(12, '0')}`,
  folderId: null,
  title: `Clip ${index}`,
  duration: 30,
  aspectRatio: '9:16',
  hasSubtitles: true,
  hookText: null,
  thumbnailUrl: null,
  fileUrl: null,
  createdAt: new Date(Date.now() - (index + 1) * 3600000).toISOString()
}))

async function fixture(dark = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: dark ? 'dark' : 'light', hasTouch: false })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text())) errors.push(message.text())
  })
  await context.route('**/v1/**', (route) => route.fulfill({ json: { access_token: 'synthetic-dock', user } }))
  await context.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() !== 'GET') return route.fulfill({ status: 405, json: {} })
    if (path === '/api/projects') return route.fulfill({ json: { projects: [{ id: 'job', folders: [], clips }], collections: [] } })
    if (path === '/api/dashboard') return route.fulfill({ json: { metrics: { clipCount: 24, jobCount: 1, durationMinutes: 9, activity: [], statuses: {} }, recentClips: [] } })
    return route.fulfill({ json: {} })
  })
  return { page, close: () => context.close() }
}

const bar = (page) => page.locator('[data-mobile-dashboard-dock] nav')
async function inView(page) {
  // The bar slides below the viewport when hidden.
  return page.evaluate(() => {
    const box = document.querySelector('[data-mobile-dashboard-dock] nav')?.getBoundingClientRect()
    return Boolean(box && box.top < innerHeight - 4)
  })
}
async function until(check, message) {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.fail(message)
}

try {
  await mkdir(output, { recursive: true })
  for (const dark of [false, true]) {
    const f = await fixture(dark)
    const { page } = f
    try {
      await page.goto(`${origin}/ro/dashboard/clips`, { waitUntil: 'load' })
      await bar(page).waitFor()
      // Header: Sneep Cut mark, page name, no top-left menu.
      const header = page.locator('[data-workspace-mobile-header]')
      assert.match(await header.innerText(), /Clipuri/)
      assert.equal(await header.locator('button').count(), 0, 'No top-left menu on phones')
      assert.deepEqual(
        await bar(page).locator('a').evaluateAll((links) => links.map((link) => [link.getAttribute('aria-label'), link.getAttribute('href')])),
        [['Acasă', '/ro/dashboard'], ['Clipuri', '/ro/dashboard/clips'], ['Creează clipuri', '/ro/dashboard/create'], ['Publicare', '/ro/dashboard/publish']]
      )
      assert.equal(await bar(page).getByRole('link', { name: 'Clipuri' }).getAttribute('aria-current'), 'page')
      assert.equal(
        await bar(page).getByRole('link', { name: 'Creează clipuri' }).evaluate((element) => getComputedStyle(element).backgroundColor),
        dark ? 'rgb(142, 155, 176)' : 'rgb(11, 11, 12)',
        'Create is black in light, muted steel in dark'
      )
      assert.match(await bar(page).evaluate((element) => getComputedStyle(element).backdropFilter), /blur/, 'Liquid glass blur')
      await page.screenshot({ path: fileURLToPath(new URL(`clips${dark ? '-dark' : ''}.png`, output)) })

      // Scrolling down hides the bar, scrolling up brings it back.
      await page.mouse.wheel(0, 700)
      await until(async () => !(await inView(page)), 'Bar hides while scrolling down')
      await page.mouse.wheel(0, -300)
      await until(() => inView(page), 'Bar returns while scrolling up')

      // The lens follows the active tab after navigation.
      await page.evaluate(() => window.scrollTo(0, 0))
      await bar(page).getByRole('link', { name: 'Acasă' }).click()
      await page.waitForURL((url) => url.pathname === '/ro/dashboard')
      await until(async () => (await bar(page).getByRole('link', { name: 'Acasă' }).getAttribute('aria-current')) === 'page', 'Home becomes current')
      for (const [name, path] of [['Publicare', '/ro/dashboard/publish'], ['Creează clipuri', '/ro/dashboard/create'], ['Clipuri', '/ro/dashboard/clips']]) {
        await bar(page).getByRole('link', { name }).click()
        await page.waitForURL((url) => url.pathname === path)
        await until(() => inView(page), `Bar stays on main page ${path}`)
      }

      // Meniu opens the remaining pages.
      await bar(page).getByRole('button', { name: 'Meniu' }).click()
      const menu = page.locator('[data-mobile-menu-dialog]')
      await menu.waitFor()
      assert.deepEqual(await menu.getByRole('link').allInnerTexts(), ['Editor video', 'Scenarii', 'Identitate vizuală', 'Abonament', 'Setări'])
      await page.screenshot({ path: fileURLToPath(new URL(`menu${dark ? '-dark' : ''}.png`, output)) })
      await menu.getByRole('link', { name: 'Setări' }).click()
      await page.waitForURL((url) => url.pathname === '/ro/dashboard/settings')
      await menu.waitFor({ state: 'detached' })
      assert.equal(await bar(page).getByRole('button', { name: 'Meniu' }).getAttribute('data-open'), '', 'Meniu marks pages it holds')

      // Detail pages and modal sheets hide the bar.
      await page.goto(`${origin}/ro/dashboard/clips/${clips[0].id}`, { waitUntil: 'load' })
      await until(async () => !(await inView(page)), 'Hidden on a clip detail page')
      await page.goto(`${origin}/ro/dashboard/clips`, { waitUntil: 'load' })
      await page.locator('[data-clip-card]').first().waitFor()
      await until(() => inView(page), 'Back on a main page')
      await page.locator('[data-clip-card] button').first().click()
      await until(async () => !(await inView(page)), 'Hidden under the clip sheet')
      await page.keyboard.press('Escape')
      await until(() => inView(page), 'Returns when the sheet closes')
    } finally {
      await f.close()
    }
  }
  assert.deepEqual(errors, [])
  console.log('Phone bottom bar: header, items + destinations, black/steel create, glass, scroll hide/show, Meniu, hidden on detail pages and under sheets (light + dark) passed')
} finally {
  await browser.close()
}
