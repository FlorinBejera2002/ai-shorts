import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5208'
const policyOnly = process.env.TEST_BILLING_POLICY_ONLY === '1'
const redirectOnly = process.env.TEST_BILLING_REDIRECT_ONLY === '1'
const coverageOnly = process.env.TEST_BILLING_COVERAGE_ONLY === '1'
const modeOnly = process.env.TEST_BILLING_MODE_ONLY === '1'
const fullRun = !policyOnly && !redirectOnly && !coverageOnly && !modeOnly
const sourcePath = resolve('src/components/billing/checkout-button.tsx')
let originalSource
let server
let browser
const errors = []

function billing(overrides = {}) {
  return {
    account: { credits: 1000, plan: 'free', hasBillingProfile: true },
    subscription: null,
    invoices: [],
    providerAvailable: true,
    checkoutVerification: null,
    ...overrides
  }
}

async function fixturePage(initial, options = {}) {
  const context = await browser.newContext({ viewport: options.mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.setDefaultNavigationTimeout(180000)
  const pendingRequests = new Set()
  page.on('request', (request) => pendingRequests.add(request))
  page.on('requestfinished', (request) => pendingRequests.delete(request))
  page.on('requestfailed', (request) => pendingRequests.delete(request))
  page.on('pageerror', (error) => errors.push(error.message))
  let current = initial
  let billingReads = 0
  let reconciliations = 0
  let authRefreshes = 0
  let checkouts = 0
  let releaseCheckout
  const checkoutGate = new Promise((resolve) => { releaseCheckout = resolve })
  await page.route('**/v1/**', (route) => {
    authRefreshes += 1
    return route.fulfill({ json: {
      access_token: 'synthetic-token',
      user: { id: '00000000-0000-4000-8000-000000000097', email: 'billing-fixture@example.invalid', name: 'Billing Test', profile_pic: null, credits: current.account.credits, plan: current.account.plan, access_role: 'member' }
    } })
  })
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/stripe/billing') {
      billingReads += 1
      if (options.billingUnavailableAfterInitial && billingReads > 1) {
        return route.fulfill({ status: 503, json: { error: 'billing_unavailable' } })
      }
      return route.fulfill({ json: current })
    }
    if (path === '/api/stripe/reconcile') {
      reconciliations += 1
      assert.equal(route.request().method(), 'POST')
      assert.deepEqual(route.request().postDataJSON(), {})
      if (options.reconcileUnavailable || reconciliations <= (options.reconcileFailures || 0)) return route.fulfill({ status: 503, json: { error: 'billing_provider_unavailable' } })
      if (options.reconciled) current = options.reconciled
      return route.fulfill({ json: { reconciled: true } })
    }
    if (path === '/api/stripe/checkout') {
      checkouts += 1
      if (options.holdCheckout) await checkoutGate
      return route.fulfill({ json: options.checkoutResponse || { kind: 'checkout', url: 'https://checkout.stripe.com.attacker.invalid/session' } })
    }
    const fixtures = {
      '/api/stripe/plans': { creator: { amount: 1900, currency: 'EUR' }, pro: { amount: 4900, currency: 'EUR' }, agency: { amount: 14900, currency: 'EUR' } },
      '/api/workspace-agent/runs': { runs: [], has_more: false },
      '/api/workspace-agent/suggestions': { suggestions: [], capabilities: [] },
      '/api/user/brand': { brandKit: {} },
      '/api/dashboard': { metrics: { credits: current.account.credits, plan: current.account.plan, activity: [], statuses: {}, jobCount: 0, clipCount: 0, durationMinutes: 0 }, recentClips: [] }
    }
    return route.fulfill({ json: fixtures[path] || {} })
  })
  return {
    page, context,
    async navigate(url) {
      try {
        await page.goto(url, { waitUntil: 'networkidle' })
      } catch (error) {
        console.error('Pending test request paths:', [...pendingRequests].map((request) => new URL(request.url()).pathname))
        console.error('Rendered test text:', (await page.locator('body').innerText({ timeout: 1000 }).catch(() => '')).slice(0, 700))
        throw error
      }
    },
    counts: () => ({ billingReads, reconciliations, authRefreshes, checkouts }),
    releaseCheckout,
    setBilling: (next) => { current = next }
  }
}

async function rememberLayout(page) {
  await page.evaluate(() => {
    window.__billingDocument = document
    window.__billingSidebar = document.querySelector('[data-slot="sidebar"]')
    window.__billingHeader = document.querySelector('.studio-topbar')
    if (!window.__billingSidebar || !window.__billingHeader) throw new Error('Shared dashboard layout is missing')
  })
}
async function assertLayoutPreserved(page) {
  assert.ok(await page.evaluate(() => document === window.__billingDocument &&
    document.querySelector('[data-slot="sidebar"]') === window.__billingSidebar &&
    document.querySelector('.studio-topbar') === window.__billingHeader))
}

try {
  if (process.env.TEST_START_SERVER === '1') {
    const { hostname, port } = new URL(origin)
    assert.ok(['127.0.0.1', 'localhost'].includes(hostname))
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', hostname, '--port', port, '--strictPort'], { cwd: process.cwd(), stdio: 'ignore', windowsHide: true })
    const deadline = Date.now() + 120000
    while (true) {
      if (server.exitCode !== null) throw new Error('Isolated Vite server exited')
      try { if ((await fetch(origin)).ok) break } catch {}
      if (Date.now() > deadline) throw new Error('Isolated Vite server did not start')
      await delay(250)
    }
  }
  browser = await chromium.launch({ headless: true })
  console.log('Isolated browser launched; loading the billing dashboard.')
  const confirmed = billing({
    account: { credits: 1300, plan: 'creator', hasBillingProfile: true },
    subscription: { status: 'active', currentPeriodEnd: '2026-11-21T00:00:00Z', cancelAtPeriodEnd: false },
    checkoutVerification: { status: 'complete', planId: 'creator' }
  })
  if (fullRun) {
    const f = await fixturePage(billing({ checkoutVerification: { status: 'pending', planId: 'creator' } }), { reconciled: confirmed, reconcileFailures: 1 })
    try {
      await f.page.goto(`${origin}/dashboard/billing?checkout_session_id=cs_test_fixture`, { waitUntil: 'networkidle' })
      await f.page.getByText("We're confirming your checkout.", { exact: false }).waitFor()
      assert.match(await f.page.locator('[aria-labelledby="billing-overview-title"]').innerText(), /Free/)
      const collapse = f.page.getByRole('button', { name: 'Collapse sidebar', exact: true })
      await collapse.click()
      await rememberLayout(f.page)
      await f.page.getByText('Payment confirmed. Your plan and credits are up to date.', { exact: true }).waitFor({ timeout: 20000 })
      assert.match(await f.page.locator('[aria-labelledby="billing-overview-title"]').innerText(), /Creator/)
      assert.ok(f.counts().authRefreshes >= 2, 'confirmed plan/credits refresh authenticated account')
      assert.equal(f.counts().reconciliations, 2)
      await f.page.getByRole('button', { name: 'Expand sidebar', exact: true }).waitFor()
      await assertLayoutPreserved(f.page)
      console.log('Delayed Checkout: no early access, authoritative reconciliation, auth refresh, stable dashboard/sidebar.')
    } finally { await f.context.close() }
  }
  if (fullRun) {
    const f = await fixturePage(confirmed, { reconciled: billing({
      account: { credits: 1300, plan: 'creator', hasBillingProfile: true },
      subscription: { status: 'active', currentPeriodEnd: '2026-11-21T00:00:00Z', cancelAtPeriodEnd: true }
    }) })
    try {
      await f.page.goto(`${origin}/dashboard/billing?portal_return=true`, { waitUntil: 'networkidle' })
      await f.page.getByText('Cancellation is scheduled for the date shown.', { exact: false }).waitFor()
      await f.page.getByText('Ends on', { exact: true }).waitFor()
      assert.equal(await f.page.getByText('Renews on', { exact: true }).count(), 0)
      assert.equal(f.counts().reconciliations, 1)
      console.log('Portal return reconciles before displaying scheduled cancellation and renewal state.')
    } finally { await f.context.close() }
  }
  if (fullRun) {
    const f = await fixturePage(billing({ checkoutVerification: { status: 'invalid', planId: null } }))
    try {
      await f.page.goto(`${origin}/dashboard/billing?checkout_session_id=cs_test_other_account`, { waitUntil: 'networkidle' })
      await f.page.getByText("We couldn't verify this checkout for your account.", { exact: false }).waitFor()
      assert.match(await f.page.locator('[aria-labelledby="billing-overview-title"]').innerText(), /Free/)
      assert.equal(f.counts().reconciliations, 1)
      console.log('Invalid/foreign Checkout return displays verification error and grants no plan.')
    } finally { await f.context.close() }
  }
  if (fullRun) {
    const f = await fixturePage(billing({ checkoutVerification: { status: 'pending', planId: 'creator' } }), { billingUnavailableAfterInitial: true })
    try {
      await f.page.clock.install()
      await f.page.goto(`${origin}/dashboard/billing?checkout_session_id=cs_test_delayed`, { waitUntil: 'networkidle' })
      await f.page.getByText("We're confirming your checkout.", { exact: false }).waitFor()
      for (let attempt = 1; attempt < 10; attempt += 1) {
        await f.page.clock.runFor(4500)
        const deadline = Date.now() + 5000
        while (f.counts().billingReads < attempt + 1 && Date.now() < deadline) await delay(25)
        assert.equal(f.counts().billingReads, attempt + 1)
        await delay(100)
      }
      await f.page.getByText('Confirmation is taking longer than expected.', { exact: false }).waitFor()
      await f.page.clock.runFor(30000)
      await delay(100)
      assert.equal(f.counts().billingReads, 10, 'failed GET requests cannot bypass the confirmation attempt limit')
      assert.equal(f.counts().reconciliations, 10)
      assert.match(await f.page.locator('[aria-labelledby="billing-overview-title"]').innerText(), /Free/)
      console.log('Delayed/error confirmation stops after ten attempts, preserves saved access and exposes manual recovery.')
    } finally { await f.context.close() }
  }
  if (fullRun) {
    const f = await fixturePage({ ...confirmed, account: { ...confirmed.account, credits: 1000 } }, {
      reconciled: { ...confirmed, account: { ...confirmed.account, credits: 2500 } }
    })
    try {
      await f.navigate(`${origin}/dashboard/billing?checkout_session_id=cs_test_active_uncredited`)
      await f.page.getByText('Payment confirmed. Your plan and credits are up to date.', { exact: true }).waitFor()
      assert.match(await f.page.locator('[aria-labelledby="billing-overview-title"]').innerText(), /2,500/)
      assert.equal(f.counts().reconciliations, 1)
      assert.equal(f.counts().billingReads, 1)
      assert.ok(f.counts().authRefreshes >= 2)
      console.log('First Checkout return recovers invoice credits even when the subscription was already active.')
    } finally { await f.context.close() }
  }
  if (fullRun) {
    const f = await fixturePage(billing(), { holdCheckout: true })
    try {
      await f.page.goto(`${origin}/dashboard/billing`, { waitUntil: 'networkidle' })
      const upgrades = f.page.getByRole('button', { name: 'Upgrade', exact: true })
      await upgrades.first().waitFor()
      await upgrades.first().click()
      await f.page.getByRole('button', { name: 'Opening checkout…', exact: true }).waitFor()
      assert.equal(await f.page.getByRole('button', { name: 'Upgrade', exact: true }).first().isDisabled(), true)
      assert.equal(await f.page.getByRole('button', { name: 'Manage billing', exact: true }).isDisabled(), true)
      assert.equal(f.counts().checkouts, 1)
      f.releaseCheckout()
      await f.page.getByRole('alert').filter({ hasText: 'Could not start checkout.' }).waitFor()
      assert.equal(new URL(f.page.url()).origin, origin)
      assert.equal(await f.page.getByRole('button', { name: 'Manage billing', exact: true }).isEnabled(), true)
      if (process.env.TEST_FAST_REFRESH === '1') {
        originalSource = await readFile(sourcePath, 'utf8')
        await rememberLayout(f.page)
        await writeFile(sourcePath, originalSource.replace('className={`flex h-9', 'className={`billing-hmr-check flex h-9'))
        await f.page.locator('.billing-hmr-check').first().waitFor({ timeout: 60000 })
        await f.page.getByRole('alert').filter({ hasText: 'Could not start checkout.' }).waitFor()
        await assertLayoutPreserved(f.page)
        await writeFile(sourcePath, originalSource)
        originalSource = undefined
        await f.page.locator('.billing-hmr-check').first().waitFor({ state: 'detached', timeout: 60000 })
      }
      console.log('Cross-plan/portal duplicate guard, invalid hosted destination rejection, error recovery and component Fast Refresh passed.')
    } finally { f.releaseCheckout(); await f.context.close() }
  }
  if (!redirectOnly && !coverageOnly && !modeOnly) {
    const f = await fixturePage(billing({
      account: { credits: 20000, plan: 'agency', hasBillingProfile: true, creditsUnlimited: false },
      subscription: { status: 'active', currentPeriodEnd: '2026-11-21T00:00:00Z', cancelAtPeriodEnd: false }
    }))
    try {
      await f.page.goto(`${origin}/dashboard/billing`, { waitUntil: 'networkidle' })
      const summary = f.page.locator('[aria-labelledby="billing-overview-title"]')
      await summary.waitFor()
      assert.match(await summary.innerText(), /20,000/)
      assert.doesNotMatch(await summary.innerText(), /∞|Unlimited/)
      for (const [plan, allowance] of [['creator', '1500'], ['pro', '5000'], ['agency', '20,000']]) {
        assert.match(await f.page.locator(`[aria-labelledby="plan-${plan}"]`).innerText(), new RegExp(`${allowance} credits/month`))
      }
      await f.page.getByText('Plan changes apply immediately without prorated charges or credits.', { exact: false }).waitFor()
      await f.page.getByText('There is no grace period for overdue payments.', { exact: false }).waitFor()
      await f.page.goto(`${origin}/pricing`, { waitUntil: 'networkidle' })
      const agencyCard = f.page.getByRole('article').filter({ has: f.page.getByRole('heading', { name: 'Agency', exact: true }) })
      assert.match(await agencyCard.innerText(), /20,?000 credits\/month/)
      assert.match(await agencyCard.innerText(), /€149/)
      assert.doesNotMatch(await agencyCard.innerText(), /[Uu]nlimited/)
      await f.page.getByRole('button', { name: 'What happens when I change plans?', exact: true }).click()
      await f.page.getByText('The new plan applies immediately without prorated charges or credits.', { exact: false }).waitFor()
      console.log('Paid allowance policy: finite Agency balance,1500/5000/20000 credits, Stripe-backed EUR pricing and immediate/no-proration FAQ.')
    } finally { await f.context.close() }
  }
  if (fullRun) {
    const f = await fixturePage(billing({
      account: { credits: 1300, plan: 'free', hasBillingProfile: true },
      subscription: { status: 'canceled', currentPeriodEnd: '2026-10-20T00:00:00Z', cancelAtPeriodEnd: false },
      providerAvailable: false
    }), { reconcileUnavailable: true })
    try {
      await f.page.goto(`${origin}/dashboard/billing`, { waitUntil: 'networkidle' })
      await rememberLayout(f.page)
      assert.equal(await f.page.getByText('Renews on', { exact: true }).count(), 0)
      await f.page.getByText('This subscription has ended and will not renew.', { exact: false }).waitFor()
      await f.page.getByRole('button', { name: 'Retry', exact: true }).click()
      await f.page.getByText("We couldn't refresh billing with Stripe.", { exact: false }).waitFor()
      assert.equal(f.counts().reconciliations, 1)
      assert.equal(f.counts().billingReads, 2)
      await assertLayoutPreserved(f.page)
      console.log('Provider outage preserves saved state; invoice retry refetches without remount/reload; ended subscriptions show no renewal.')
    } finally { await f.context.close() }
  }
  if (!redirectOnly && !coverageOnly && !modeOnly) {
    const f = await fixturePage(billing({
      account: { credits: 1000, plan: 'free', hasBillingProfile: true },
      subscription: { status: 'incomplete', currentPeriodEnd: null, cancelAtPeriodEnd: false }
    }), { mobile: true })
    try {
      await f.page.goto(`${origin}/ro/dashboard/billing?canceled=true`, { waitUntil: 'networkidle' })
      await f.page.getByText('Plata necesită atenție.', { exact: false }).waitFor()
      await f.page.getByText('Plata a fost anulată.', { exact: false }).waitFor()
      await f.page.getByText('Schimbarea planului se aplică imediat, fără taxe sau credite proporționale.', { exact: false }).waitFor()
      assert.equal(await f.page.getByText('Se reînnoiește la', { exact: true }).count(), 0)
      assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
      await mkdir(resolve('test-results'), { recursive: true })
      await f.page.screenshot({ path: resolve('test-results/billing-mobile.png'), fullPage: true })
      console.log('Romanian/mobile canceled Checkout and payment/authentication guidance render without horizontal overflow.')
    } finally { await f.context.close() }
  }
  if (!policyOnly && !coverageOnly && !modeOnly) {
    const portalUrl = 'https://billing.stripe.com/p/session/test_existing_subscription'
    for (const [response, navigates] of [
      [{ kind: 'portal', url: portalUrl }, true],
      [{ kind: 'unknown', url: 'https://checkout.stripe.com/c/pay/cs_test_unknown' }, false],
      [{ kind: 'portal', url: 'https://checkout.stripe.com/c/pay/cs_test_mismatched' }, false]
    ]) {
      const f = await fixturePage(billing(), { checkoutResponse: response })
      try {
        await f.page.route('https://billing.stripe.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<main>Mock Stripe billing portal</main>' }))
        await f.navigate(`${origin}/dashboard/billing`)
        await f.page.getByRole('button', { name: 'Upgrade', exact: true }).first().click()
        if (navigates) {
          await f.page.waitForURL(portalUrl)
          await f.page.getByText('Mock Stripe billing portal', { exact: true }).waitFor()
        } else {
          await f.page.getByRole('alert').filter({ hasText: 'Could not start checkout.' }).waitFor()
          assert.equal(new URL(f.page.url()).origin, origin)
        }
        assert.equal(f.counts().checkouts, 1)
      } finally { await f.context.close() }
    }
    console.log('Stale local checkout safely opens the existing subscription portal; unknown and mismatched destination kinds are rejected.')
  }
  if (fullRun || coverageOnly) {
    for (const currentPeriodEnd of ['2026-10-20T00:00:00Z', null]) {
      const f = await fixturePage(billing({
        account: { credits: 1300, plan: 'free', hasBillingProfile: true },
        subscription: { status: 'active', currentPeriodEnd, cancelAtPeriodEnd: false }
      }), { reconciled: { ...confirmed, checkoutVerification: null } })
      try {
        await f.navigate(`${origin}/dashboard/billing`)
        await f.page.getByText('Paid access is not currently confirmed.', { exact: false }).waitFor()
        const summary = f.page.locator('[aria-labelledby="billing-overview-title"]')
        assert.match(await summary.innerText(), /Free/)
        assert.equal(await summary.getByText('Renews on', { exact: true }).count(), 0)
        await rememberLayout(f.page)
        await f.page.getByRole('button', { name: 'Refresh billing status', exact: true }).click()
        await summary.getByText('Creator', { exact: true }).waitFor()
        await summary.getByText('Renews on', { exact: true }).waitFor()
        assert.equal(await f.page.getByText('Paid access is not currently confirmed.', { exact: false }).count(), 0)
        assert.match(await summary.innerText(), /1,300/)
        assert.equal(f.counts().reconciliations, 1)
        await assertLayoutPreserved(f.page)
      } finally { await f.context.close() }
    }
    console.log('Expired/missing Stripe coverage shows effective Free access and confirmation guidance; manual reconciliation restores paid access without losing credits/layout.')
  }
  if (fullRun || modeOnly) {
    for (const [mode, locale, mobile] of [
      ['test', 'en', false],
      ['test', 'ro', true],
      ['live', 'en', false],
      [undefined, 'en', false]
    ]) {
      const f = await fixturePage(billing({ mode }), { mobile })
      try {
        await f.navigate(`${origin}/${locale === 'ro' ? 'ro/' : ''}dashboard/billing`)
        const overview = f.page.locator('[aria-labelledby="billing-overview-title"]')
        await overview.waitFor()
        const notice = f.page.locator('[aria-labelledby="billing-test-mode-title"]')
        if (mode === 'test') {
          await notice.waitFor({ state: 'visible' })
          const text = await notice.innerText()
          assert.match(text, locale === 'ro' ? /nu se fac încasări reale/ : /no real charges are made/)
          assert.match(text, locale === 'ro' ? /doar carduri de test Stripe; nu introduce un card real/ : /only Stripe test cards; do not enter a real card/)
          const noticeBounds = await notice.boundingBox()
          const overviewBounds = await overview.boundingBox()
          assert.ok(noticeBounds.y + noticeBounds.height <= overviewBounds.y)
          if (mobile) {
            assert.ok(noticeBounds.y + noticeBounds.height <= 844, 'test payment warning is visible in the initial mobile viewport')
            assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
            await mkdir(resolve('test-results'), { recursive: true })
            await f.page.screenshot({ path: resolve('test-results/billing-test-mode-mobile.png') })
          }
        } else {
          assert.equal(await notice.count(), 0)
        }
      } finally { await f.context.close() }
    }
    console.log('Stripe test warning is clear in English and Romanian, visible above mobile billing, and absent for live/legacy responses.')
  }
  assert.deepEqual(errors, [])
  const scope = policyOnly ? 'policy-focused ' : redirectOnly ? 'redirect-focused ' : coverageOnly ? 'coverage-focused ' : modeOnly ? 'mode-focused ' : ''
  console.log(`All ${scope}mocked billing browser checks passed. These checks do not exercise Stripe itself.`)
} finally {
  if (originalSource !== undefined) await writeFile(sourcePath, originalSource)
  await browser?.close()
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server.once('exit', resolve))
    server.kill()
    await stopped
  }
}
