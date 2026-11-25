import assert from 'node:assert/strict'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { restoreSourceTimes } from './source-probe-helpers.mjs'

// All authenticated reads and mutations stay in these synthetic fixtures.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const output = new URL('../test-results/credit-usage/', import.meta.url)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = [], checks = [], screenshots = []
const active = { status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: '2026-12-18T10:00:00Z' }

async function until(check, message, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.fail(message)
}

async function fixture(options = {}) {
  const context = await browser.newContext({
    viewport: { width: options.width ?? 1440, height: 900 },
    isMobile: Boolean(options.mobile), hasTouch: Boolean(options.mobile),
    reducedMotion: 'reduce', colorScheme: options.dark ? 'dark' : 'light',
    timezoneId: 'Europe/Bucharest'
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.setDefaultNavigationTimeout(180000)
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text())) errors.push(message.text())
  })
  let account = { credits: 2900, plan: 'pro', creditsUnlimited: false, ...options.account }
  let userId = '00000000-0000-4000-8000-000000009001'
  let fail = Boolean(options.fail), release
  const gate = new Promise(resolve => { release = resolve })
  const calls = { credits: 0, billing: 0, mutations: 0 }
  await context.route('**/v1/**', route => route.fulfill({ json: {
    access_token: 'synthetic-credit-token',
    user: { id: userId, name: 'Usage Tester', email: 'usage@example.invalid', ...account, access_role: account.creditsUnlimited ? 'admin' : 'member' }
  } }))
  await context.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path === '/api/testing/charge' && request.method() === 'POST') {
      calls.mutations++
      return route.fulfill({ json: { ok: true } })
    }
    assert.equal(request.method(), 'GET', `Unexpected real mutation: ${path}`)
    if (path === '/api/user/credits') {
      calls.credits++
      if (options.delayed) await gate
      return route.fulfill(fail ? { status: 503, json: { error: 'Synthetic outage' } } : { json: account })
    }
    if (path === '/api/stripe/billing') {
      calls.billing++
      return route.fulfill({ json: {
        account: { ...account, hasBillingProfile: account.plan !== 'free' },
        subscription: account.plan === 'free' ? null : options.subscription ?? active,
        invoices: [], providerAvailable: true, checkoutVerification: null
      } })
    }
    const responses = {
      '/api/clips/library': { clips: [], total: 0, hasMore: false },
      '/api/scripts/items': { scripts: [] },
      '/api/projects': { projects: [], collections: [] },
      '/api/brand-kits': { kits: [] },
      '/api/workspace-agent/preferences': { follow: false, recommendations: false },
      '/api/workspace-agent/runs': { runs: [], has_more: false },
      '/api/workspace-agent/suggestions': { suggestions: [], capabilities: [] },
      '/api/stripe/plans': { creator: { amount: 1900, currency: 'EUR' }, pro: { amount: 4900, currency: 'EUR' }, agency: { amount: 14900, currency: 'EUR' } }
    }
    return route.fulfill({ json: responses[path] ?? {} })
  })
  const placement = options.mobile ? 'header' : 'sidebar'
  const trigger = page.locator(`[data-credit-usage="${placement}"]`)
  const details = page.locator(`[data-credit-usage-details="${placement}"]`)
  return {
    page, context, trigger, details, calls, release,
    setAccount: value => { account = { ...account, ...value } },
    switchAccount: value => { userId = '00000000-0000-4000-8000-000000009002'; account = value },
    setFailure: value => { fail = value },
    async open() {
      await page.goto(`${origin}/dashboard/clips`, { waitUntil: 'load' })
      await trigger.waitFor()
    },
    async percentage(percent, timeout) {
      await until(() => trigger.getAttribute('aria-label').then(label => label === `Credit usage: ${percent}% remaining`), `Expected ${percent}% remaining`, timeout)
      assert.equal(await trigger.locator('circle[pathLength]').getAttribute('stroke-dasharray'), `${percent} 100`)
    },
    async inspect() {
      if (options.mobile) await trigger.tap()
      else await trigger.hover()
      await details.waitFor()
    },
    async refresh() {
      await page.evaluate(async () => {
        // Reuse Vite's exact HMR URL, avoiding a second auth singleton in the fixture.
        const url = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/lib/auth.ts')?.name
        if (!url) throw Error('Mounted auth module not found')
        const { apiFetch } = await import(url)
        const response = await apiFetch('/api/testing/charge', { method: 'POST' })
        if (!response.ok) throw Error('Fixture action failed')
      })
    },
    close: () => context.close()
  }
}

async function capture(f, name) {
  await f.page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) })
  screenshots.push(name)
}

async function rememberShell(page) {
  await page.evaluate(() => {
    window.creditShell = {
      document, shell: document.querySelector('#dashboard-shell'),
      sidebar: document.querySelector('[data-app-sidebar]'),
      header: document.querySelector('header.studio-topbar'),
      state: document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')
    }
  })
}
async function assertShell(page) {
  assert.equal(await page.evaluate(() => {
    const p = window.creditShell
    return p.document === document && p.shell === document.querySelector('#dashboard-shell') &&
      p.sidebar === document.querySelector('[data-app-sidebar]') && p.header === document.querySelector('header.studio-topbar') &&
      p.state === document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')
  }), true, 'Mounted dashboard and sidebar state preserved')
}

async function desktop() {
  const f = await fixture()
  try {
    await f.open()
    await f.percentage(58)
    // Strict Mode may cancel the first mount's request before remounting observers.
    assert.ok(f.calls.credits <= 2, 'Hidden mobile and desktop share a balance query without extra requests')
    const ring = await f.trigger.boundingBox(), profile = await f.page.locator('[data-sidebar-account]').boundingBox()
    assert.ok(ring.x < 240 && ring.y > 600 && ring.y + ring.height <= profile.y)
    await f.inspect()
    await until(() => f.details.innerText().then(text => text.includes('Next renewal: Dec 18')), 'Confirmed date loads')
    assert.match(await f.details.innerText(), /2,900 credits available/)
    assert.equal(await f.details.evaluate(el => getComputedStyle(el).borderRadius), '14px')
    await capture(f, 'desktop-hover')
    // Pointer travel into the popup keeps it open and its Billing link usable.
    await f.details.hover()
    await f.page.waitForTimeout(250)
    assert.equal(await f.details.isVisible(), true)
    const focusBeforeHoverClose = await f.page.evaluate(() => document.activeElement.tagName)
    await f.page.mouse.move(700, 400)
    await f.details.waitFor({ state: 'hidden' })
    await f.page.waitForTimeout(250) // Radix restores focus after the closing content unmounts.
    assert.equal(await f.page.evaluate(() => document.activeElement.tagName), focusBeforeHoverClose, 'Mouse hover does not move keyboard focus')
    await f.trigger.hover()
    await f.details.waitFor()
    await f.page.keyboard.press('Escape')
    await f.details.waitFor({ state: 'hidden' })
    await f.page.mouse.move(700, 400)
    await f.page.keyboard.press('Tab')
    await f.trigger.focus()
    await f.details.waitFor()
    await f.details.getByRole('link', { name: 'View billing' }).focus()
    await f.page.keyboard.press('Escape')
    await f.details.waitFor({ state: 'hidden' })
    await until(() => f.trigger.evaluate(el => el === document.activeElement), 'Escape returns keyboard focus to the usage trigger')
    await f.page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click()
    await rememberShell(f.page)
    assert.equal(await f.trigger.isVisible(), true, 'Ring remains available in collapsed sidebar')
    await f.trigger.hover()
    await f.details.waitFor()
    await f.details.getByRole('link', { name: 'View billing' }).click()
    await f.page.waitForURL('**/dashboard/billing')
    await assertShell(f.page)
    assert.equal(await f.page.locator('[data-billing-usage]').getAttribute('data-billing-usage'), '42')
    checks.push('Desktop footer, hover, keyboard/Escape, collapsed rail, Billing agreement and mounted navigation')
  } finally { await f.close() }
}

async function accountStates() {
  for (const [name, account, percent] of [
    ['free', { credits: 400, plan: 'free' }, 40],
    ['creator', { credits: 750, plan: 'creator' }, 50],
    ['agency', { credits: 15000, plan: 'agency' }, 75],
    ['empty', { credits: 0, plan: 'pro' }, 0],
    ['rollover', { credits: 7200, plan: 'pro' }, 100],
    ['admin', { credits: 0, plan: 'free', creditsUnlimited: true }, null]
  ]) {
    const f = await fixture({ account })
    try {
      await f.open()
      if (percent !== null) await f.percentage(percent)
      else await until(() => f.trigger.getAttribute('aria-label').then(label => label === 'Credit usage: Unlimited credits'), 'Admin unlimited state')
      await f.inspect()
      const text = await f.details.innerText()
      if (name === 'free') assert.match(text, /no scheduled reset/)
      if (name === 'rollover') assert.match(text, /7,200 credits available[\s\S]*additional credits/)
      if (name === 'admin') {
        assert.equal(await f.trigger.locator('circle[pathLength]').getAttribute('stroke-dasharray'), '100 100')
        assert.doesNotMatch(text, /0%|renewal|Plan allowance/)
      }
      checks.push(`${name} account balance`)
    } finally { await f.close() }
  }
}

async function loadingAndRecovery() {
  const f = await fixture({ delayed: true })
  try {
    await f.open()
    assert.equal(await f.trigger.getAttribute('data-usage-state'), 'loading')
    assert.equal(await f.trigger.locator('circle[pathLength]').count(), 0)
    f.release()
    await f.percentage(58)
    f.setFailure(true)
    await f.refresh()
    await f.inspect()
    await f.details.getByRole('status').waitFor()
    assert.match(await f.details.innerText(), /last known balance/)
    await f.percentage(58)
    f.setFailure(false)
    f.setAccount({ credits: 3500 })
    await f.details.getByRole('button', { name: 'Try again' }).click()
    await f.percentage(70)
    checks.push('Loading is indeterminate; refresh outage retains balance; retry recovers')
  } finally { await f.close() }
  const empty = await fixture({ fail: true })
  try {
    await empty.open()
    await until(() => empty.trigger.getAttribute('data-usage-state').then(value => value === 'error'), 'Unavailable balance')
    assert.equal(await empty.trigger.locator('circle[pathLength]').count(), 0, 'No invented empty/full balance')
    await empty.inspect()
    empty.setFailure(false)
    await empty.details.getByRole('button', { name: 'Try again' }).click()
    await empty.percentage(58)
    checks.push('Initial balance error and recovery')
  } finally { await empty.close() }
}

async function liveBalance() {
  const f = await fixture()
  try {
    await f.open()
    await f.percentage(58)
    f.setAccount({ credits: 2000 })
    await f.refresh()
    await f.percentage(40)
    await f.page.waitForLoadState('networkidle')
    f.setAccount({ credits: 2500 })
    await f.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      window.dispatchEvent(new Event('visibilitychange'))
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
      window.dispatchEvent(new Event('visibilitychange'))
    })
    await f.percentage(50)
    f.setAccount({ credits: 3000 })
    await f.percentage(60, 40000) // Real polling exercises asynchronous worker refunds/charges.
    f.switchAccount({ credits: 400, plan: 'free', creditsUnlimited: false })
    await f.page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').find(entry => new URL(entry.name).pathname === '/src/lib/auth.ts')?.name
      if (!url) throw Error('Mounted auth module not found')
      const { authClient } = await import(url)
      await authClient.refresh()
    })
    await f.percentage(40)
    await f.inspect()
    assert.match(await f.details.innerText(), /400 credits available/)
    assert.doesNotMatch(await f.details.innerText(), /3,000|Next renewal/)
    checks.push('Mutation invalidation, window refocus, real 30-second polling and account-switch isolation')
  } finally { await f.close() }
}

async function mobile() {
  for (const [width, dark] of [[320, false], [390, true], [768, false]]) {
    const f = await fixture({ mobile: true, width, dark })
    try {
      await f.open()
      await f.percentage(58)
      const ring = await f.trigger.boundingBox(), agent = await f.page.locator('[data-agent-trigger]').boundingBox()
      assert.ok(ring.y >= 0 && ring.y + ring.height <= 64)
      const overlaps = ring.x < agent.x + agent.width && agent.x < ring.x + ring.width && ring.y < agent.y + agent.height && agent.y < ring.y + ring.height
      assert.equal(overlaps, false, 'Circle does not overlap the Ana & Radu launcher')
      await f.inspect()
      assert.match(await f.details.innerText(), /2,900 credits available/)
      const popup = await f.details.boundingBox()
      assert.ok(popup.x >= 0 && popup.x + popup.width <= width)
      assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      assert.equal(await f.details.evaluate(el => getComputedStyle(el).backgroundColor), dark ? 'rgb(24, 31, 43)' : 'rgb(255, 255, 255)')
      await capture(f, `mobile-${width}-${dark ? 'dark' : 'light'}`)
      await f.page.keyboard.press('Escape')
      await f.details.waitFor({ state: 'hidden' })
      await f.page.locator('[data-agent-trigger]').tap()
      await f.page.locator('#workspace-agent-panel').waitFor({ state: 'visible' })
      checks.push(`${width}px mobile touch, theme, popup bounds and Ana & Radu`)
    } finally { await f.close() }
  }
}

async function fastRefresh() {
  if (process.env.RUN_FAST_REFRESH !== '1') return
  const f = await fixture()
  const sourcePath = new URL('../src/components/dashboard/credit-usage-indicator.tsx', import.meta.url)
  try {
    await f.open()
    await f.percentage(58)
    await f.page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click()
    await rememberShell(f.page)
    await f.inspect()
    const original = await readFile(sourcePath), metadata = await stat(sourcePath, { bigint: true })
    const anchor = 'data-credit-usage={placement}'
    assert.equal(original.toString().split(anchor).length, 2)
    try {
      await writeFile(sourcePath, original.toString().replace(anchor, `data-credit-refresh-probe="updated" ${anchor}`))
      await f.page.locator('[data-credit-refresh-probe="updated"]').first().waitFor({ state: 'attached', timeout: 60000 })
      await assertShell(f.page)
      assert.equal(await f.details.isVisible(), true, 'Open details survives component Fast Refresh')
      await f.percentage(58)
      checks.push('Component Fast Refresh preserves open popup, balance, dashboard DOM and collapsed sidebar')
    } finally {
      try {
        await writeFile(sourcePath, original)
        await f.page.locator('[data-credit-refresh-probe]').first().waitFor({ state: 'detached', timeout: 60000 })
        assert.deepEqual(await readFile(sourcePath), original)
      } finally { await restoreSourceTimes(sourcePath, metadata) }
    }
  } finally { await f.close() }
}

try {
  await mkdir(output, { recursive: true })
  const selected = (process.env.CREDIT_USAGE_GROUP || 'desktop,accounts,recovery,live,mobile,refresh').split(',')
  for (const [name, run] of Object.entries({ desktop, accounts: accountStates, recovery: loadingAndRecovery, live: liveBalance, mobile, refresh: fastRefresh })) {
    if (!selected.includes(name)) continue
    console.log(`Checking ${name} usage`)
    await run()
  }
  assert.deepEqual(errors, [], 'No browser runtime errors')
  const reportName = selected.length === 6 ? 'report.json' : `report-${selected.join('-')}.json`
  await writeFile(new URL(reportName, output), JSON.stringify({ checks, screenshots, errors, fixtureOnly: true }, null, 2))
  console.log(`Credit usage browser checks passed: ${checks.length} groups, ${screenshots.length} captures`)
} finally { await browser.close() }
