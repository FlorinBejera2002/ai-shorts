import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createBillingFixture, filterBillingSubscriptions } from './billing-fixture.mjs'

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const adminDirectory = fileURLToPath(new URL('..', import.meta.url))
const origin = process.env.ADMIN_TEST_ORIGIN || 'http://127.0.0.1:3213'
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname), 'Verification requires an isolated loopback mock origin')
const children = []
const fixture = createBillingFixture()
const preview = process.env.ADMIN_TEST_PREVIEW === '1' || process.env.VERIFY_ADMIN_FAST_REFRESH !== '1'
let browser

async function assertPortUnused(port) {
  const server = createServer()
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  await new Promise((resolve) => server.close(resolve))
}

function startServer(args, env = {}) {
  const child = spawn(process.execPath, args, { cwd: adminDirectory, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (data) => { output += data })
  child.stderr.on('data', (data) => { output += data })
  children.push(child)
  return { child, output: () => output }
}

async function waitForServer(server, address) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.child.exitCode !== null) throw new Error(`Server exited: ${server.output()}`)
    try { await fetch(address, { signal: AbortSignal.timeout(2000) }); return }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)) }
  }
  throw new Error(`Server did not start: ${server.output()}`)
}

async function openBilling(page) {
  await page.getByRole('button', { name: 'Facturare', exact: true }).click()
  await page.getByRole('heading', { name: 'Facturare Stripe', exact: true }).first().waitFor()
}

async function assertShell(page) {
  assert.equal(await page.evaluate(() => document.querySelector('.app-shell') === window.billingShell.root
    && document.querySelector('aside.sidebar') === window.billingShell.sidebar
    && document.querySelector('header.topbar') === window.billingShell.header), true, 'Shared dashboard DOM remains mounted')
}

async function select(page, name, option) {
  await page.getByRole('combobox', { name, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

try {
  console.log('Starting isolated admin billing verification')
  if (!process.env.ADMIN_TEST_ORIGIN) {
    await assertPortUnused(8089)
    await assertPortUnused(3213)
    const api = startServer(['tests/mock-api.mjs'])
    await waitForServer(api, 'http://127.0.0.1:8089')
    const vite = startServer(['node_modules/vite/bin/vite.js', ...(preview ? ['preview'] : []), '--host', '127.0.0.1', '--port', '3213', '--strictPort'], { VITE_DEV_API_TARGET: 'http://127.0.0.1:8089' })
    await waitForServer(vite, origin)
  }
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
  page.setDefaultTimeout(15000)
  const errors = []
  const billingRequests = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/admin/billing/')) billingRequests.push(request) })
  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.getByLabel('Email administrativ').fill('billing-admin@example.invalid')
  await page.getByLabel('Parolă', { exact: true }).fill('synthetic-fixture-password')
  await page.getByRole('button', { name: 'Intră în consolă' }).click()
  await page.getByRole('heading', { name: 'Platform overview', exact: true }).waitFor()
  await page.evaluate(() => { window.billingShell = { root: document.querySelector('.app-shell'), sidebar: document.querySelector('aside.sidebar'), header: document.querySelector('header.topbar') } })
  let releaseOverview
  const heldOverview = new Promise((resolve) => { releaseOverview = resolve })
  await page.route('**/api/admin/billing/overview', async (route) => { await heldOverview; await route.continue() })
  await openBilling(page)
  await page.getByText('Se încarcă datele de facturare…', { exact: true }).first().waitFor()
  await assertShell(page)
  releaseOverview()
  await page.getByText('billing1@example.invalid', { exact: true }).waitFor()
  await page.getByText('invoice.paid', { exact: true }).waitFor()
  await page.getByText('Mod test Stripe activ', { exact: true }).waitFor()
  await page.unroute('**/api/admin/billing/overview')
  if (preview) assert.equal(await page.getByRole('button', { name: 'Actualizează datele', exact: true }).evaluate((button) => getComputedStyle(button).height), '36px', 'Production build includes shared utility styles')
  assert.equal(await page.getByRole('link', { name: /reconcile:/ }).count(), 0, 'Internal reconciliation ledger IDs never link to Stripe')
  assert.equal(await page.getByRole('button', { name: 'Facturare', exact: true }).getAttribute('aria-current'), 'page')
  assert.equal(await page.getByRole('link', { name: 'Deschide Stripe', exact: true }).getAttribute('href'), 'https://dashboard.stripe.com/acct_SyntheticTest/test/dashboard')
  assert.equal(await page.getByRole('link', { name: /^cus_Synthetic1\s*Deschide în Stripe$/ }).getAttribute('href'), 'https://dashboard.stripe.com/acct_SyntheticTest/test/customers/cus_Synthetic1')
  const pastDue = page.getByRole('row').filter({ hasText: 'billing2@example.invalid' })
  assert.match(await pastDue.textContent(), /free.*Plată restantă.*Plan înregistrat: pro/)
  assert.match(await page.getByRole('row').filter({ hasText: 'billing1@example.invalid' }).textContent(), /Anulare programată la termen/)
  await assertShell(page)
  console.log('Read-only overview, effective access, scheduled cancellation and account-scoped sandbox links passed')

  await page.getByRole('button', { name: 'Pagina următoare de abonamente', exact: true }).click()
  await page.getByText('billing26@example.invalid', { exact: true }).waitFor()
  assert.equal(await page.getByText('billing1@example.invalid', { exact: true }).count(), 0)
  await select(page, 'Starea abonamentului', 'Plată restantă')
  await page.getByText('billing2@example.invalid', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Pagina anterioară de abonamente', exact: true }).isEnabled(), false)
  await select(page, 'Planul efectiv', 'Free')
  await page.getByText('billing2@example.invalid', { exact: true }).waitFor()
  const filtered = billingRequests.at(-1)
  const filteredParams = new URL(filtered.url()).searchParams
  assert.equal(filteredParams.get('status'), 'past_due')
  assert.equal(filteredParams.get('plan'), 'free')
  assert.equal(filteredParams.get('page'), '1')
  await select(page, 'Starea abonamentului', 'Toate stările')
  await select(page, 'Planul efectiv', 'Toate planurile')
  const search = page.getByRole('textbox', { name: 'Caută profiluri Stripe', exact: true })
  await search.fill('no-such-synthetic-user')
  await page.getByText('Niciun profil Stripe găsit pentru aceste filtre.', { exact: true }).waitFor()
  await search.fill('cus_Synthetic27')
  await page.getByText('billing27@example.invalid', { exact: true }).waitFor()
  console.log('Pagination, query, status/effective-plan filters, page reset and empty state passed')

  await page.route('**/api/admin/billing/subscriptions?*', async (route) => {
    const params = new URL(route.request().url()).searchParams
    if (params.get('q') === 'older') {
      await new Promise((resolve) => setTimeout(resolve, 800))
      await route.fulfill({ json: { items: [{ ...fixture.subscriptions[0], email: 'stale@example.invalid' }], total: 1, page: 1, pageSize: 25 } }).catch(() => {})
    } else if (params.get('q') === 'newer') {
      await route.fulfill({ json: { items: [{ ...fixture.subscriptions[0], email: 'fresh@example.invalid' }], total: 1, page: 1, pageSize: 25 } })
    } else await route.continue()
  })
  await search.fill('older')
  await page.waitForRequest((request) => new URL(request.url()).searchParams.get('q') === 'older')
  await search.fill('newer')
  await page.getByText('fresh@example.invalid', { exact: true }).waitFor()
  await page.waitForTimeout(950)
  assert.equal(await page.getByText('stale@example.invalid', { exact: true }).count(), 0, 'Late aborted results cannot overwrite newer filters')
  await page.unroute('**/api/admin/billing/subscriptions?*')
  await search.fill('billing2')
  await page.getByText('billing2@example.invalid', { exact: true }).waitFor()
  console.log('Out-of-order responses are canceled without stale account data')

  const subscriptions = page.getByRole('region', { name: 'Conturi și abonamente', exact: true })
  await page.route('**/api/admin/billing/subscriptions?*', (route) => route.fulfill({ status: 503, json: { error: 'Synthetic subscriptions unavailable' } }))
  await page.getByRole('button', { name: 'Actualizează datele', exact: true }).click()
  await subscriptions.getByText('Synthetic subscriptions unavailable', { exact: true }).waitFor()
  assert.equal(await search.inputValue(), 'billing2')
  await page.unroute('**/api/admin/billing/subscriptions?*')
  await subscriptions.getByRole('button', { name: 'Reîncearcă încărcarea', exact: true }).click()
  await page.getByText('billing2@example.invalid', { exact: true }).waitFor()
  await page.route('**/api/admin/billing/overview', (route) => route.fulfill({ status: 503, json: { error: 'Synthetic overview unavailable' } }))
  await page.getByRole('button', { name: 'Actualizează datele', exact: true }).click()
  await page.getByText('Synthetic overview unavailable', { exact: true }).waitFor()
  await page.getByText('billing2@example.invalid', { exact: true }).waitFor()
  assert.equal(await page.getByRole('link', { name: /Deschide în Stripe/ }).count(), 0, 'Unknown server configuration disables all provider links')
  await assertShell(page)
  await page.unroute('**/api/admin/billing/overview')
  await page.getByRole('button', { name: 'Reîncearcă încărcarea', exact: true }).click()
  await page.getByRole('link', { name: 'Deschide Stripe', exact: true }).waitFor()
  console.log('Independent failures and retries preserve filters and shared shell; missing mode disables Stripe links')

  const events = page.getByRole('region', { name: 'Ultimele evenimente procesate', exact: true })
  await page.route('**/api/admin/billing/events?*', (route) => route.fulfill({ status: 503, json: { error: 'Synthetic event ledger unavailable' } }))
  await page.getByRole('button', { name: 'Actualizează datele', exact: true }).click()
  await events.getByText('Synthetic event ledger unavailable', { exact: true }).waitFor()
  await page.unroute('**/api/admin/billing/events?*')
  await page.route('**/api/admin/billing/events?*', (route) => route.fulfill({ json: { items: [] } }))
  await events.getByRole('button', { name: 'Reîncearcă încărcarea', exact: true }).click()
  await events.getByText('Nu există evenimente Stripe procesate.', { exact: true }).waitFor()
  await page.unroute('**/api/admin/billing/events?*')
  console.log('Processed-event ledger handles failure, retry and empty data without implying zero failures')

  await page.route('**/api/admin/billing/overview', (route) => route.fulfill({ json: { ...fixture.overview, configuration: { ...fixture.overview.configuration, mode: 'live' } } }))
  await page.getByRole('button', { name: 'Actualizează datele', exact: true }).click()
  const dashboard = page.getByRole('link', { name: 'Deschide Stripe', exact: true })
  await dashboard.waitFor()
  assert.equal(await dashboard.getAttribute('href'), 'https://dashboard.stripe.com/acct_SyntheticTest/dashboard')
  await page.getByText('billing2@example.invalid', { exact: true }).waitFor()
  assert.equal(await page.getByRole('link', { name: /^cus_Synthetic2\s*Deschide în Stripe$/ }).getAttribute('href'), 'https://dashboard.stripe.com/acct_SyntheticTest/customers/cus_Synthetic2')
  await page.unroute('**/api/admin/billing/overview')
  await page.route('**/api/admin/billing/subscriptions?*', (route) => route.fulfill({ json: { items: [{ ...fixture.subscriptions[0], customerId: 'cus_bad/../../escape', subscriptionId: 'https://evil.example/sub_bad' }], total: 1, page: 1, pageSize: 25 } }))
  await page.getByRole('button', { name: 'Actualizează datele', exact: true }).click()
  await page.getByText('cus_bad/../../escape', { exact: true }).waitFor()
  assert.equal(await page.locator('a[href*="evil.example"], a[href*="escape"]').count(), 0)
  await page.unroute('**/api/admin/billing/subscriptions?*')
  await page.getByRole('button', { name: 'Actualizează datele', exact: true }).click()
  await page.getByText('billing2@example.invalid', { exact: true }).waitFor()
  console.log('Live Dashboard URLs omit /test/ and malformed provider IDs never become links')

  if (!preview && process.env.VERIFY_ADMIN_FAST_REFRESH === '1') {
    const componentPath = new URL('../src/billing/billing-subscriptions.tsx', import.meta.url)
    const original = await readFile(componentPath, 'utf8')
    const anchor = '<section aria-labelledby="billing-subscriptions-heading">'
    const probe = '<section data-billing-refresh-probe="updated" aria-labelledby="billing-subscriptions-heading">'
    assert.ok(original.includes(anchor))
    try {
      await writeFile(componentPath, original.replace(anchor, probe))
      await page.locator('[data-billing-refresh-probe="updated"]').waitFor()
      assert.equal(await search.inputValue(), 'billing2', 'Component Fast Refresh preserves its search state')
      await page.getByText('billing2@example.invalid', { exact: true }).waitFor()
      await assertShell(page)
      console.log('Component-scoped Fast Refresh retains filters and the shared layout')
    } finally {
      const current = await readFile(componentPath, 'utf8')
      if (current.includes(probe)) await writeFile(componentPath, current.replace(probe, anchor))
    }
  }

  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Mobile page has no horizontal overflow')
  const nav = await page.getByRole('button', { name: 'Facturare', exact: true }).boundingBox()
  assert.ok(nav && nav.x >= 0 && nav.x + nav.width <= 391, 'Mobile billing navigation remains visible')
  await select(page, 'Planul efectiv', 'Free')
  await page.getByText('billing2@example.invalid', { exact: true }).waitFor()
  await mkdir(new URL('../../frontend/test-results/', import.meta.url), { recursive: true })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: fileURLToPath(new URL('../../frontend/test-results/admin-billing-mobile.png', import.meta.url)), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1100 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: fileURLToPath(new URL('../../frontend/test-results/admin-billing-desktop.png', import.meta.url)), fullPage: true })
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await page.getByRole('heading', { name: 'Platform overview', exact: true }).waitFor()
  await openBilling(page)
  await page.getByText('billing1@example.invalid', { exact: true }).waitFor()
  await assertShell(page)
  assert.ok(billingRequests.length > 0)
  assert.ok(billingRequests.every((request) => request.method() === 'GET'), 'Billing UI performs reads only')
  assert.deepEqual(errors, [])
  console.log('390px responsive layout, navigation DOM identity, admin-only GET calls and zero runtime errors passed')
  console.log('Admin Stripe billing browser verification passed (synthetic in-memory API; no real Stripe mutations)')
} finally {
  await browser?.close()
  for (const child of children.reverse()) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      await new Promise((resolve) => child.once('exit', resolve))
    }
  }
}
