import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5199'
let browser
let server
const errors = []
const sourcePath = resolve('src/components/create/summary-card.tsx')
let originalSource

async function accountPage(admin) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(180000)
  page.on('pageerror', (error) => errors.push(error.message))
  const user = {
    id: '00000000-0000-4000-8000-000000000094',
    email: 'admin-entitlement-fixture@example.invalid', name: 'Entitlement Test',
    credits: 0, plan: 'free', access_role: admin ? 'admin' : 'member'
  }
  await page.route('**/v1/**', (route) => route.fulfill({
    json: { access_token: 'synthetic-token', user }
  }))
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    const fixtures = {
      '/api/user/credits': { credits: 0, creditsUnlimited: admin },
      '/api/user/brand': { plan: 'free', canWhiteLabel: admin, brandKit: {} },
      '/api/user/brand/fonts': { fonts: [] },
      '/api/stories': { stories: [] },
      '/api/jobs': { jobs: [] },
      '/api/dashboard': { metrics: { credits: 0, creditsUnlimited: admin, jobCount: 0, clipCount: 0, durationMinutes: 0, statuses: {}, activity: [] }, recentClips: [] },
      '/api/stripe/billing': { account: { credits: 0, creditsUnlimited: admin, plan: 'free', hasBillingProfile: false }, subscription: null, invoices: [], providerAvailable: true },
      '/api/workspace-agent/runs': { runs: [], has_more: false },
      '/api/workspace-agent/suggestions': { suggestions: [], capabilities: [] }
    }
    return route.fulfill({ json: fixtures[path] || {} })
  })
  await page.route(/https:\/\/(?:i\.ytimg\.com|www\.youtube\.com|www\.youtube-nocookie\.com)\//, (route) => route.abort())
  return { context, page }
}

try {
  if (process.env.TEST_START_SERVER === '1') {
    const { hostname, port } = new URL(origin)
    assert.ok(['127.0.0.1', 'localhost'].includes(hostname))
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', hostname, '--port', port], {
      cwd: process.cwd(), stdio: 'ignore', windowsHide: true
    })
    const deadline = Date.now() + 120000
    while (true) {
      if (server.exitCode !== null) throw new Error('Isolated Vite server exited before startup')
      try {
        if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) break
      } catch {}
      if (Date.now() > deadline) throw new Error('Isolated Vite server did not become ready')
      await delay(250)
    }
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const admin of [true, false]) {
    const { context, page } = await accountPage(admin)
    try {
      await page.goto(`${origin}/dashboard/create?mode=youtube`, { waitUntil: 'networkidle', timeout: 180000 })
      const url = page.locator('#youtube-url')
      await url.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      const generate = page.locator('.creation-generate-action button')
      await generate.waitFor()
      await page.waitForFunction((enabled) => {
        const button = document.querySelector('.creation-generate-action button')
        return button && button.disabled !== enabled
      }, admin)
      assert.equal(await generate.isEnabled(), admin)
      console.log(`${admin ? 'Admin' : 'Member'} generation gate verified at zero credits.`)
      const summary = page.locator('.creation-generate')
      if (admin) {
        assert.match(await summary.innerText(), /Unlimited credits/)
        assert.doesNotMatch(await summary.innerText(), /Not enough credits/)
        if (process.env.TEST_FAST_REFRESH === '1') {
          originalSource = await readFile(sourcePath, 'utf8')
          await page.evaluate(() => {
            window.__entitlementDocument = document
            window.__entitlementInput = document.querySelector('#youtube-url')
            window.__entitlementSummary = document.querySelector('.creation-generate')
          })
          await writeFile(sourcePath, originalSource.replace('creation-generate block', 'creation-generate admin-hmr-check block'))
          await page.locator('.admin-hmr-check').waitFor({ timeout: 60000 })
          assert.equal(await url.inputValue(), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
          assert.ok(await page.evaluate(() => window.__entitlementDocument === document &&
            window.__entitlementInput === document.querySelector('#youtube-url') &&
            window.__entitlementSummary === document.querySelector('.creation-generate')))
          await writeFile(sourcePath, originalSource)
          originalSource = undefined
          await page.locator('.admin-hmr-check').waitFor({ state: 'detached', timeout: 60000 })
          console.log('Fast Refresh preserved the document, component DOM and input state.')
        }
      } else {
        assert.match(await summary.innerText(), /Not enough credits/)
      }

      await page.goto(`${origin}/dashboard`, { waitUntil: 'networkidle' })
      assert.equal(await page.getByText('Unlimited credits', { exact: true }).count(), admin ? 1 : 0)
      await page.goto(`${origin}/dashboard/billing`, { waitUntil: 'networkidle' })
      await page.locator('#billing-overview-title').waitFor()
      assert.equal(await page.locator('[aria-labelledby="billing-plans-title"]').isVisible(), !admin)
      assert.equal(await page.getByText('Administrator · unlimited', { exact: true }).count(), admin ? 1 : 0)
      await page.goto(`${origin}/dashboard/brand`, { waitUntil: 'networkidle' })
      const badge = page.getByRole('switch', { name: 'sneepcut badge', exact: true })
      await badge.waitFor()
      assert.equal(await badge.isEnabled(), admin)
      console.log(`${admin ? 'Admin' : 'Member'} dashboard, billing and white-label screens verified.`)
    } finally {
      await context.close()
    }
  }
  assert.deepEqual(errors, [])
  console.log(`Admin/member zero-credit generation, dashboard, billing and white-label checks passed${process.env.TEST_FAST_REFRESH === '1' ? ', including Fast Refresh state preservation' : ''}.`)
} finally {
  if (originalSource !== undefined) await writeFile(sourcePath, originalSource)
  await browser?.close()
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once('exit', resolve))
    server.kill()
    await stopped
  }
}
