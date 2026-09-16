// Local browser regression with synthetic API responses; no database writes.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
  : '../../.cache/deploy-browser/node_modules/playwright/index.mjs')
const base = process.env.SNEEPCUT_UI_ORIGIN ?? 'http://localhost:3000'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } })
  await context.route(/\/(?:api|v1)\//, async route => {
    const path = new URL(route.request().url()).pathname
    const data = {
      '/v1/auth/refresh': { access_token: 'synthetic', user: { id: '33333333-3333-4333-8333-333333333333', name: 'Navigation test', email: 'navigation@example.invalid', plan: 'free', credits: 100, access_role: 'member' } },
      '/api/clips/library': { clips: [], total: 0, currentPage: 1, totalPages: 1 },
      '/api/user/credits': { credits: 100, plan: 'free' },
      '/api/assistant/history': { messages: [] }
    }[path]
    if (data) await route.fulfill({ json: data })
    else await route.abort()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(60000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${base}/dashboard/clips`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.locator('#dashboard-shell').waitFor()
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  const selectors = ['#dashboard-shell', '[data-slot="sidebar"][data-state]', '.studio-topbar', '#dashboard-main', '.studio-page']
  await page.evaluate(selectors => {
    window.__navigationNodes = selectors.map(selector => document.querySelector(selector))
    window.__removedNavigationNodes = []
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const removed of record.removedNodes) {
          if (window.__navigationNodes.some(node => removed === node || removed.contains(node))) {
            window.__removedNavigationNodes.push(record.target.nodeName)
          }
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }, selectors)
  for (const path of ['/dashboard/script-generator', '/dashboard/clips']) {
    await page.locator(`#dashboard-navigation a[href="${path}"]`).click()
    await page.waitForURL(`${base}${path}`)
    await page.waitForLoadState('networkidle')
    assert.deepEqual(await page.evaluate(selectors => selectors.map((selector, index) => document.querySelector(selector) === window.__navigationNodes?.[index]), selectors), selectors.map(() => true))
    assert.deepEqual(await page.evaluate(() => window.__removedNavigationNodes), [])
    assert.equal(await page.locator('[data-slot="sidebar"][data-state]').getAttribute('data-state'), 'collapsed')
    assert.equal(await page.locator('#dashboard-shell > [role="status"]').count(), 0)
  }
  await page.goBack()
  await page.waitForURL(`${base}/dashboard/script-generator`)
  assert.deepEqual(await page.evaluate(selectors => selectors.map((selector, index) => document.querySelector(selector) === window.__navigationNodes?.[index]), selectors), selectors.map(() => true))
  assert.deepEqual(errors, [])
  console.log('PASS: sidebar, header, main and content container preserve DOM identity and collapsed state across sidebar navigation and Back; no global loader or page reload')
} finally {
  await browser.close()
}
