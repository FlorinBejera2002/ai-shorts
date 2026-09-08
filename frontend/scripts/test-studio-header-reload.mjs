// Local development only. API calls are mocked; no account or database is used.
// Run from frontend with PLAYWRIGHT_MODULE set if Playwright is installed elsewhere.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const base = process.env.SNEEPCUT_UI_ORIGIN ?? 'http://localhost:3000'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const output = 'test-results/studio-header-reload'
await mkdir(output, { recursive: true })
const cssFile = new URL('../src/components/dashboard/studio-shell.css', import.meta.url)
const marker = `reload-${Date.now()}`
const probe = (value) => `\n/* ${marker} */\n#dashboard-main .studio-workbench-header { --studio-reload-probe: ${value}; }\n`
const user = { id: '33333333-3333-4333-8333-333333333333', name: 'Preview', email: 'preview@example.invalid', credits: 100, plan: 'free', access_role: 'member' }
const browser = await chromium.launch({ headless: true })
let appended = ''
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  await context.addInitScript(() => localStorage.setItem('theme', 'light'))
  await context.route(/\/(?:api|v1)\//, async route => {
    const path = new URL(route.request().url()).pathname
    let data
    if (path === '/v1/auth/refresh') data = { access_token: 'synthetic', user }
    else if (path === '/api/clips/library') data = { clips: [], total: 0, currentPage: 1, totalPages: 1 }
    else if (path === '/api/dashboard/review') data = { clips: [] }
    else if (path === '/api/user/credits') data = { credits: 100, plan: 'free' }
    else return route.abort()
    await route.fulfill({ json: data })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/ro/dashboard/clips`, { waitUntil: 'networkidle', timeout: 120000 })
  const header = page.locator('.studio-workbench-header')
  await header.waitFor({ timeout: 60000 })
  const shadow = await header.evaluate(el => getComputedStyle(el).boxShadow)
  const edge = await header.evaluate(el => {
    const style = getComputedStyle(el, '::before')
    return { left: style.left, bottom: style.bottom, radius: style.borderBottomLeftRadius, color: style.backgroundColor }
  })
  assert.deepEqual(edge, { left: '-4px', bottom: '-4px', radius: '14px', color: 'rgb(0, 0, 0)' })
  assert.doesNotMatch(shadow, /inset/, 'Black edge must remain outside the panel')
  await page.screenshot({ path: `${output}/desktop.png` })
  const assets = await page.locator('link[rel="stylesheet"]').evaluateAll(links => links.map(link => link.href))
  assert.ok(assets.length)
  for (const url of assets) {
    const response = await context.request.get(url)
    assert.equal(response.status(), 200)
    const cache = response.headers()['cache-control'] ?? ''
    assert.match(cache, /no-cache|no-store|max-age=0/)
    assert.doesNotMatch(cache, /immutable|max-age=31536000/)
  }
  const missing = await context.request.get(`${base}/_next/static/css/nonexistent-${marker}.css`)
  assert.equal(missing.status(), 404)
  assert.doesNotMatch(missing.headers()['cache-control'] ?? '', /immutable|max-age=31536000/)
  console.log('PASS: lower 3D edge and revalidation headers, including missing assets')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: `${output}/mobile.png` })
  // Prove consecutive source edits reach the existing page without a reload.
  await page.evaluate(() => { window.__studioReloadSentinel = 'preserved' })
  for (const value of ['first', 'second']) {
    const current = await readFile(cssFile, 'utf8')
    const next = probe(value)
    await writeFile(cssFile, (appended ? current.replace(appended, '') : current) + next)
    appended = next
    await page.waitForFunction(value => {
      const el = document.querySelector('.studio-workbench-header')
      return el && getComputedStyle(el).getPropertyValue('--studio-reload-probe').trim() === value
    }, value, { timeout: 60000 })
    assert.equal(await page.evaluate(() => window.__studioReloadSentinel), 'preserved')
  }
  assert.deepEqual(errors, [])
  console.log('PASS: two CSS edits applied through Nginx HMR without page/container restart; mobile fits')

} finally {
  if (appended) {
    const current = await readFile(cssFile, 'utf8')
    await writeFile(cssFile, current.replace(appended, ''))
  }
  await browser.close()
}
