// After deployment, from frontend/: PLAYWRIGHT_MODULE=/absolute/playwright/index.mjs
// node tests/production-ui.browser.mjs
// Real production HTML/assets; every authenticated API response is synthetic.
// Fresh contexts contain no production identity, cookies or saved browser state.
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generatedSnapshot, libraryRecords, scriptId } from './fixtures/scripts-workspace.mjs'
import { createBillingFixture, filterBillingSubscriptions } from '../../admin/tests/billing-fixture.mjs'

assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const frontend = 'https://sneepcut.com'
const admin = 'https://admin.sneepcut.com'
const approved = new Set([frontend, admin, 'https://api.sneepcut.com'])
const output = new URL('../test-results/production-ui/', import.meta.url)
const diagnostic = process.env.PRODUCTION_UI_DIAGNOSTIC === '1'
const report = {
  startedAt: new Date().toISOString(), expectedCommit: process.env.PRODUCTION_EXPECTED_COMMIT || null,
  diagnostic,
  origins: [...approved], checks: [], screenshots: [], assets: [], mockedApiRequests: 0,
  unexpectedMutations: [], blockedExternalRequests: [], blockedWebSockets: [],
  unknownSyntheticReads: [], runtimeErrors: [], unauthenticated: [], passed: false
}
const isApi = path => /^\/(api|v1)(\/|$)/.test(path)
const user = {
  id: '00000000-0000-4000-8000-000000004299', name: 'Alex Morgan',
  email: 'production-ui@example.invalid', credits: 1000, plan: 'pro', access_role: 'member'
}
const fontAssets = new URL('../../backend/internal/captions/assets/', import.meta.url)
const fontCatalog = JSON.parse(await readFile(new URL('catalog.json', fontAssets), 'utf8'))
const settings = {
  preferences: { locale: 'en', theme: 'system', timezone: 'Europe/Bucharest',
    defaultAspectRatio: '9:16', defaultClipCount: 3, emailSecurity: true,
    emailProduct: true, emailMarketing: false, inAppProcessing: true, inAppPublishing: true },
  sessions: [], mfa: { enabled: false }, securityEvents: [], exports: []
}
const routes = [
  ['home', '/dashboard', '[data-home-workspace]'],
  ['scripts', '/dashboard/script-generator', '[data-script-library]'],
  ['clips', '/dashboard/clips', '[data-clips-workspace]'],
  ['publish', '/dashboard/publish', '[data-publishing-workspace]'],
  ['brand', '/dashboard/brand', '[data-brand-workspace]'],
  ['billing', '/dashboard/billing', '[data-billing-workspace]'],
  ['settings', '/dashboard/settings', '[data-settings-workspace]']
]

function commonReads(identity) {
  return {
    '/api/dashboard': { metrics: { clipCount: 0, jobCount: 0, durationMinutes: 0,
      credits: 1000, creditsUnlimited: false, plan: 'pro', activity: [], statuses: {} }, recentClips: [] },
    '/api/projects': { projects: [] }, '/api/stories': { stories: [] },
    '/api/clips/library': { clips: [], total: 0, hasMore: false },
    '/api/publishing': { providers: [], accounts: [], clips: [], posts: [] },
    '/api/calendar': { posts: [], clips: [] },
    '/api/user/brand': { brandKit: {}, plan: 'pro', canWhiteLabel: true },
    '/api/user/brand/fonts': { fonts: fontCatalog.map(({ id, family, category, weights }) =>
      ({ id, family, category, weights, romanian: true })) },
    '/api/user/profile': { profile: { ...identity, image: null, provider: 'credentials',
      canChangePassword: true, recentlyAuthenticated: true,
      emailVerified: '2026-10-01T09:00:00Z', createdAt: '2026-10-01T09:00:00Z' } },
    '/api/user/settings': settings,
    '/api/workspace-agent/runs': { runs: [], has_more: false },
    '/api/workspace-agent/suggestions': { suggestions: [], capabilities: [] },
    '/api/workspace-agent/preferences': { follow: false, recommendations: false },
    '/api/stripe/billing': { mode: 'test', account: { credits: 1000, plan: 'pro', hasBillingProfile: true },
      subscription: { status: 'active', currentPeriodEnd: '2026-11-23T00:00:00Z', cancelAtPeriodEnd: false },
      invoices: [], providerAvailable: true, checkoutVerification: null },
    '/api/stripe/plans': { creator: { amount: 1900, currency: 'EUR' },
      pro: { amount: 4900, currency: 'EUR' }, agency: { amount: 14900, currency: 'EUR' } }
  }
}

async function fixture(browser, { mobile = false, administrative = false } = {}) {
  const identity = { ...user, access_role: administrative ? 'admin' : 'member' }
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1488, height: 1058 },
    timezoneId: 'Europe/Bucharest', colorScheme: 'dark', reducedMotion: 'reduce', serviceWorkers: 'block'
  })
  const records = structuredClone(libraryRecords()), billing = createBillingFixture()
  const calls = { create: [], save: [], generate: [] }
  const reads = commonReads(identity)
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method()
    if (!approved.has(url.origin)) {
      report.blockedExternalRequests.push(`${method} ${url.origin}${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    if (!isApi(url.pathname)) {
      if (method === 'GET' || method === 'HEAD') return route.continue()
      report.unexpectedMutations.push(`${method} ${url.origin}${url.pathname}`)
      return route.abort('blockedbyclient')
    }
    report.mockedApiRequests += 1
    const headers = {
      'Access-Control-Allow-Origin': request.headers().origin || (administrative ? admin : frontend),
      'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS, POST, PATCH, DELETE', 'Cache-Control': 'no-store'
    }
    const respond = (body, status = 200) => route.fulfill({ status, headers, json: body })
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
    const path = url.pathname
    if (path === '/v1/auth/refresh' && method === 'POST')
      return respond({ access_token: 'synthetic-production-ui-token', user: identity })
    if (path === '/api/scripts/items' && method === 'GET') {
      const query = (url.searchParams.get('query') || '').toLowerCase()
      return respond({ scripts: records.filter(record =>
        (url.searchParams.get('archived') === 'true' || !record.archived) &&
        `${record.title} ${record.topic}`.toLowerCase().includes(query)) })
    }
    if (path === '/api/scripts/items' && method === 'POST') {
      const data = request.postDataJSON()
      calls.create.push(data)
      const record = { ...structuredClone(data), id: scriptId(100 + calls.create.length),
        targetDurationSeconds: data.target_duration_seconds, revision: 1, archived: false,
        createdAt: '2026-10-23T07:00:00Z', updatedAt: '2026-10-23T07:00:00Z' }
      records.unshift(record)
      return respond({ script: record })
    }
    if (path === '/api/scripts/generate' && method === 'POST') {
      calls.generate.push(request.postDataJSON())
      return respond({ script: generatedSnapshot() })
    }
    const item = path.match(/^\/api\/scripts\/items\/([^/]+)$/)
    if (item && method === 'PATCH') {
      const data = request.postDataJSON(), record = records.find(itemRecord => itemRecord.id === item[1])
      assert.ok(record, 'Only synthetic script IDs can be saved')
      assert.equal(data.revision, record.revision, 'Autosave retains optimistic revision checks')
      calls.save.push(data)
      Object.assign(record, structuredClone(data), {
        targetDurationSeconds: data.target_duration_seconds, revision: record.revision + 1,
        updatedAt: '2026-10-23T08:00:00Z'
      })
      return respond({ script: record })
    }
    if (method !== 'GET' && method !== 'HEAD') {
      report.unexpectedMutations.push(`${method} ${url.origin}${path}`)
      return respond({ error: 'Unknown mutation blocked by production UI synthetic fixture' }, 405)
    }
    if (path === '/api/user/brand/font-file') {
      const font = fontCatalog.find(item => item.id === url.searchParams.get('id')) || fontCatalog[0]
      const filename = font.files[url.searchParams.get('weight')] || Object.values(font.files)[0]
      return route.fulfill({ headers, contentType: 'font/ttf', body: await readFile(new URL(filename, fontAssets)) })
    }
    if (path === '/api/admin/overview') return respond({ usersTotal: 27, usersActive: 26,
      usersSuspended: 1, newUsersSevenDays: 3, jobsTotal: 10, jobsActive: 0,
      jobsFailed: 1, clipsTotal: 24, creditsOutstanding: 40000 })
    if (path === '/api/admin/billing/overview') return respond(billing.overview)
    if (path === '/api/admin/billing/subscriptions') return respond(filterBillingSubscriptions(billing, url.searchParams))
    if (path === '/api/admin/billing/events') return respond(billing.events)
    if (Object.hasOwn(reads, path)) return respond(reads[path])
    report.unknownSyntheticReads.push(path)
    return respond({})
  })
  if (typeof context.routeWebSocket === 'function') {
    await context.routeWebSocket(/.*/, socket => {
      report.blockedWebSockets.push(new URL(socket.url()).pathname)
      socket.close({ code: 1000, reason: 'Synthetic production verification' })
    })
  }
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  page.setDefaultNavigationTimeout(60000)
  page.on('pageerror', error => report.runtimeErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') report.runtimeErrors.push(message.text())
  })
  page.on('response', response => {
    const request = response.request(), url = new URL(response.url())
    if (!isApi(url.pathname) && ['script', 'stylesheet', 'font'].includes(request.resourceType())) {
      report.assets.push({ url: `${url.origin}${url.pathname}`, status: response.status(), type: request.resourceType() })
    }
  })
  return { page, context, records, calls, mobile }
}

async function until(predicate, message) {
  const deadline = Date.now() + 30000
  while (!predicate()) {
    assert.ok(Date.now() < deadline, message)
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}

async function capture(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0) })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow`)
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: false })
  report.screenshots.push(name)
}

async function rememberShell(page, mobile) {
  await page.evaluate(isMobile => {
    window.productionShellProbe = { document, main: document.querySelector('main'),
      header: document.querySelector('header.studio-topbar'),
      sidebar: isMobile ? null : document.querySelector('[data-slot="sidebar"]'),
      state: document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state'),
      dock: document.querySelector('[data-mobile-dashboard-dock]') }
  }, mobile)
}

async function assertShell(page, mobile, stage = 'navigation') {
  const fields = await page.evaluate(isMobile => {
    const probe = window.productionShellProbe, sidebar = document.querySelector('[data-slot="sidebar"]')
    return { probeExists: Boolean(probe), document: probe?.document === document,
      main: probe?.main === document.querySelector('main'),
      header: probe?.header === document.querySelector('header.studio-topbar'),
      navigation: isMobile ? probe?.dock === document.querySelector('[data-mobile-dashboard-dock]') : probe?.sidebar === sidebar,
      state: isMobile || probe?.state === sidebar?.getAttribute('data-state'),
      initialState: probe?.state, currentState: sidebar?.getAttribute('data-state'),
      oldSidebarConnected: probe?.sidebar?.isConnected,
      oldSidebarTag: probe?.sidebar?.tagName, currentSidebarTag: sidebar?.tagName,
      sidebarCount: document.querySelectorAll('[data-slot="sidebar"]').length,
      oldSidebarHtml: probe?.sidebar?.outerHTML.slice(0, 220), currentSidebarHtml: sidebar?.outerHTML.slice(0, 220) }
  }, mobile)
  report.shellDiagnostics ??= []
  report.shellDiagnostics.push({ url: page.url(), stage, ...fields })
  const preserved = ['probeExists', 'document', 'main', 'header', 'navigation', 'state'].every(key => fields[key])
  if (!preserved && diagnostic) return
  assert.ok(preserved,
    `Dashboard document, shell DOM and navigation state stay mounted: ${JSON.stringify(fields)}`)
}

async function navigate(f, entry) {
  const [, path, selector] = entry
  if (f.mobile) {
    const primary = f.page.locator(`[data-mobile-dashboard-dock] a[href="${path}"]`).filter({ visible: true })
    if (await primary.count()) await primary.click()
    else {
      const headerTrigger = f.page.locator('[data-workspace-mobile-header] button[aria-controls="dashboard-navigation"]').filter({ visible: true })
      if (await headerTrigger.count()) {
        await headerTrigger.first().click()
        const sidebar = f.page.locator('[data-slot="sidebar"][data-mobile="true"]')
        await sidebar.locator(`a[href="${path}"]`).click()
        await sidebar.waitFor({ state: 'hidden' })
      } else {
        await f.page.locator('[data-mobile-menu-trigger]').filter({ visible: true }).click()
        await f.page.locator(`[data-mobile-menu-dialog] a[href="${path}"]`).click()
        await f.page.locator('[data-mobile-menu-dialog]').waitFor({ state: 'hidden' })
      }
    }
  } else await f.page.locator(`[data-slot="sidebar"] a[href="${path}"]`).filter({ visible: true }).first().click()
  await f.page.waitForURL(url => url.origin === frontend && url.pathname === path)
  await f.page.locator(selector).waitFor({ state: 'visible' })
  if (path === '/dashboard/script-generator') {
    await f.page.waitForFunction(count => document.querySelectorAll('[data-script-card]').length === count,
      f.records.filter(record => !record.archived).length)
  }
  await assertShell(f.page, f.mobile)
}

async function scriptsFlow(f, prefix) {
  const { page } = f
  await navigate(f, routes[1])
  const workspace = page.locator('[data-script-workspace]')
  await workspace.getByRole('button', { name: 'New script', exact: true }).first().click()
  await page.locator('[data-script-editor]').waitFor()
  assert.equal(f.calls.create.length, 1)
  const record = f.records[0]
  await page.locator('#script-topic').fill('A calm morning routine for busy creators')
  await until(() => record.topic === 'A calm morning routine for busy creators', 'New draft autosave missing')
  await capture(page, `${prefix}-scripts-brief`)
  await workspace.getByRole('button', { name: 'Generate script', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('[data-script-scene]').length === 3)
  await until(() => record.snapshot.scenes.length === 3, 'Generated script was not saved in the synthetic fixture')
  assert.equal(f.calls.generate.length, 1)
  await page.locator('#script-hook').fill('A calm start from the deployed UI.')
  const first = page.locator('[data-script-scene="1"]')
  const toggle = first.locator('button[aria-controls$="-fields"]')
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
  await first.getByLabel('Dialogue', { exact: true }).fill('One small action is enough.')
  await until(() => record.snapshot.hook === 'A calm start from the deployed UI.' &&
    record.snapshot.scenes[0].dialogue === 'One small action is enough.', 'Edited hook/dialogue autosave missing')
  await workspace.getByText(/^Saved.*v\d+/).first().waitFor()
  await capture(page, `${prefix}-scripts-document`)
  await workspace.getByRole('button', { name: /shooting coach/i }).filter({ visible: true }).first().click()
  const coach = page.locator('[data-shooting-coach]')
  await coach.waitFor({ state: 'visible' })
  assert.equal(await coach.locator('dl > div').count(), 7)
  for (const view of ['director', 'camera', 'top']) {
    await coach.locator(`[data-coach-view="${view}"]`).click()
    assert.equal(await coach.locator('[data-coach-stage]').getAttribute('data-view'), view)
    await capture(page, `${prefix}-coach-${view}`)
  }
  await coach.getByRole('button', { name: 'Mute preview', exact: true }).click()
  await coach.getByRole('button', { name: 'Unmute preview', exact: true }).waitFor()
  await coach.getByRole('button', { name: 'Play preview', exact: true }).click()
  await page.waitForFunction(() => parseFloat(document.querySelector('[data-coach-scene="0"] span[style]')?.style.width || '0') > 1)
  await coach.getByRole('button', { name: 'Pause preview', exact: true }).click()
  await coach.locator('[data-coach-scene="1"]').click()
  await coach.locator('[data-coach-scene="1"]').press('ArrowRight')
  assert.equal(await coach.locator('[data-coach-scene="2"]').getAttribute('aria-pressed'), 'true')
  await coach.getByRole('button', { name: 'Restart preview', exact: true }).click()
  assert.equal(await coach.locator('[data-coach-scene="0"]').getAttribute('aria-pressed'), 'true')
  await coach.getByRole('button', { name: 'Pause preview', exact: true }).click()
  await workspace.getByRole('button', { name: 'Edit script', exact: true }).click()
  await coach.waitFor({ state: 'hidden' })
  await assertShell(page, f.mobile)
  report.checks.push(`${prefix}: synthetic New/generate/edit/autosave, three coach views, playback, mute, keyboard timeline and restart`)
}

async function dashboardFlow(browser, mobile) {
  const f = await fixture(browser, { mobile }), prefix = mobile ? 'mobile' : 'desktop'
  try {
    await f.page.goto(`${frontend}/dashboard`, { waitUntil: 'networkidle' })
    await f.page.locator(routes[0][2]).waitFor()
    if (!mobile) {
      await f.page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click()
      await f.page.waitForFunction(() => document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state') === 'collapsed')
    }
    await rememberShell(f.page, mobile)
    for (const route of routes) {
      if (route !== routes[0]) await navigate(f, route)
      await capture(f.page, `${prefix}-${route[0]}`)
      await assertShell(f.page, mobile, `after ${route[0]} screenshot`)
    }
    report.checks.push(`${prefix}: Home/Scripts/Clips/Publish/Brand/Billing/Settings navigation, mounted shell/state and overflow`)
    await scriptsFlow(f, prefix)
  } finally { await f.context.close() }
}

async function adminFlow(browser) {
  const f = await fixture(browser, { administrative: true })
  try {
    await f.page.goto(admin, { waitUntil: 'networkidle' })
    await f.page.getByRole('heading', { name: 'Platform overview', exact: true }).waitFor()
    await f.page.evaluate(() => { window.productionAdminShell = {
      root: document.querySelector('.app-shell'), sidebar: document.querySelector('aside.sidebar'), header: document.querySelector('header.topbar') } })
    await f.page.getByRole('button', { name: 'Facturare', exact: true }).click()
    await f.page.getByText('billing1@example.invalid', { exact: true }).waitFor()
    await f.page.getByText('invoice.paid', { exact: true }).waitFor()
    assert.equal(await f.page.evaluate(() => {
      const p = window.productionAdminShell
      return p.root === document.querySelector('.app-shell') && p.sidebar === document.querySelector('aside.sidebar') && p.header === document.querySelector('header.topbar')
    }), true, 'Admin shell stays mounted entering Billing')
    await capture(f.page, 'admin-billing')
    report.checks.push('Admin deployed assets, synthetic session/overview/billing ledger and mounted shell')
  } finally { await f.context.close() }
}

async function unauthenticatedFlow(browser) {
  const context = await browser.newContext({ viewport: { width: 1488, height: 1058 }, serviceWorkers: 'block' })
  // No fake responses here. Only GET/HEAD can leave this fresh context; auth
  // refresh POSTs attempted by the UI are aborted before reaching production.
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url())
    return approved.has(url.origin) && ['GET', 'HEAD'].includes(request.method())
      ? route.continue() : route.abort('blockedbyclient')
  })
  if (typeof context.routeWebSocket === 'function') await context.routeWebSocket(/.*/, socket => socket.close())
  try {
    for (const url of [
      `${frontend}/api/user/profile`, `${frontend}/api/scripts/items`,
      `${frontend}/api/stripe/billing`, `${admin}/api/admin/billing/overview`
    ]) {
      const response = await context.request.get(url, { maxRedirects: 0 })
      assert.equal(response.status(), 401, `Unauthenticated GET ${url} must be rejected`)
      report.unauthenticated.push({ url, method: 'GET', status: response.status() })
    }
    const page = await context.newPage()
    await page.goto(`${frontend}/login`, { waitUntil: 'networkidle' })
    await page.locator('input[type="email"]').waitFor()
    await capture(page, 'real-unauthenticated-login')
    await page.goto(admin, { waitUntil: 'networkidle' })
    await page.getByLabel('Email administrativ').waitFor()
    await capture(page, 'real-unauthenticated-admin-login')
    report.checks.push('Real unauthenticated GET401 on profile/scripts/billing/Admin and real frontend/Admin login screens; no production writes')
  } finally { await context.close() }
}

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  await dashboardFlow(browser, false)
  await dashboardFlow(browser, true)
  await adminFlow(browser)
  await unauthenticatedFlow(browser)
  assert.deepEqual(report.unexpectedMutations, [], 'No unhandled fixture mutations')
  assert.deepEqual(report.blockedExternalRequests, [], 'All resources stay on approved production origins')
  assert.deepEqual(report.runtimeErrors, [], 'No runtime or console errors in authenticated fixture flows')
  assert.ok(report.assets.some(asset => asset.type === 'script' && asset.status === 200), 'Real deployed JavaScript loaded')
  assert.ok(report.assets.some(asset => asset.type === 'stylesheet' && asset.status === 200), 'Real deployed CSS loaded')
  assert.ok(report.assets.every(asset => asset.status < 400), 'All observed deployed assets loaded successfully')
  report.diagnosticComplete = diagnostic
  report.passed = !diagnostic
} catch (error) {
  report.failure = error.stack || error.message
  process.exitCode = 1
} finally {
  report.finishedAt = new Date().toISOString()
  await browser.close()
  report.assets = [...new Map(report.assets.map(asset => [asset.url, asset])).values()]
  report.unknownSyntheticReads = [...new Set(report.unknownSyntheticReads)]
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks, screenshots: report.screenshots,
    assets: report.assets.length, mockedApiRequests: report.mockedApiRequests,
    runtimeErrors: report.runtimeErrors, failure: report.failure || null,
    report: fileURLToPath(new URL('report.json', output)) }, null, 2))
}
