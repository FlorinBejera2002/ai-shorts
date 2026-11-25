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
      // A logo makes the logo summary card (the entry to the logo screen that holds the white-label switch) render.
      '/api/user/brand': { plan: 'free', canWhiteLabel: admin, brandKit: { logoUrl: '/illustrations/load-error.webp' } },
      '/api/user/brand/fonts': { fonts: [] },
      '/api/stories': { stories: [] },
      '/api/jobs': { jobs: [] },
      // A returning account (jobs and clips present) renders the Home overview with the stats strip; a zero-job account shows the first-run view instead.
      '/api/dashboard': { metrics: { credits: 0, creditsUnlimited: admin, jobCount: 1, clipCount: 1, durationMinutes: 2, statuses: { completed: 1 }, activity: [] }, recentClips: [] },
      '/api/dashboard/history': { jobs: [] },
      '/api/stripe/billing': { account: { credits: 0, creditsUnlimited: admin, plan: 'free', hasBillingProfile: false }, subscription: null, invoices: [], providerAvailable: true },
      '/api/youtube/channel': { enabled: true, connected: true, account: { channel_id: 'UCsynthetic', title: 'Synthetic channel', avatar_url: null } },
      // One public video on the connected channel; the list is the only YouTube source.
      '/api/youtube/channel/videos': { videos: [{ id: 'dQw4w9WgXcQ', title: 'Synthetic clip', duration_seconds: 212, published_at: '2026-11-01T10:00:00Z', visibility: 'public', thumbnail_url: null, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }], next_page_token: null },
      '/api/youtube/imports': { imports: [] },
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
      await page.getByRole('checkbox', { name: /Synthetic clip/ }).click()
      // Generate stays disabled until the Google export disclosure is ticked; the real cause of the stuck button.
      // A zero-credit member sees the limit block instead of the card, so there is no disclosure to tick.
      if (admin) await page.getByRole('checkbox', { name: /chosen videos are exported/ }).check({ force: true })
      const generate = page.getByRole('button', { name: 'Generate clips', exact: true })
      const viewPlans = page.getByRole('link', { name: 'View plans', exact: true })
      // Auto is priced at one clip per video, so a zero-credit member gets the canvas limit block
      // (no Generate action); an administrator keeps Generate enabled and never sees the block.
      if (admin) {
        await generate.waitFor()
        await page.waitForFunction(() => {
          const button = [...document.querySelectorAll('button')].find((node) => node.textContent?.trim() === 'Generate clips')
          return button && !button.disabled
        })
        assert.equal(await generate.isEnabled(), true)
        assert.equal(await viewPlans.count(), 0, 'Administrators are never shown the limit block')
      } else {
        await viewPlans.waitFor()
        assert.equal(await generate.count(), 0, 'The limit block replaces Generate for a zero-credit member')
      }
      assert.equal(await page.getByRole('checkbox', { name: /Synthetic clip/ }).getAttribute('aria-checked'), 'true', 'The chosen video stays selected')
      console.log(`${admin ? 'Admin' : 'Member'} generation gate verified at zero credits.`)

      await page.goto(`${origin}/dashboard`, { waitUntil: 'networkidle' })
      await page.locator('[data-home-stats]').waitFor()
      assert.equal(await page.getByText('Unlimited credits', { exact: true }).count(), 0)
      await page.goto(`${origin}/dashboard/billing`, { waitUntil: 'networkidle' })
      await page.locator('#billing-overview-title').waitFor()
      // Plans are a separate view opened from "Choose plan"; administrators have no plan picker at all.
      const choosePlan = page.locator('[data-billing-choose-plan]')
      if (admin) {
        assert.equal(await choosePlan.count(), 0)
      } else {
        await choosePlan.waitFor()
        await choosePlan.click()
        await page.locator('[data-billing-plans]').waitFor()
      }
      assert.equal(await page.getByText('Administrator · unlimited', { exact: true }).count(), admin ? 1 : 0)
      // /dashboard/brand is now the kits list; the white-label control lives in the default kit's editor.
      await page.goto(`${origin}/dashboard/brand/default`, { waitUntil: 'networkidle' })
      // White-label control: the Sneep Cut ending switch on the logo screen (replaces the former "sneepcut badge" switch).
      await page.locator('[data-brand-logo-summary]').click()
      const badge = page.getByRole('switch', { name: 'Sneep Cut ending', exact: true })
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
