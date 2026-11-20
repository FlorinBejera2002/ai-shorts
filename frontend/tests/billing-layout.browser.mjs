import assert from 'node:assert/strict'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Start Vite separately. A stateful in-page fake of the billing API (/api/stripe/*) backs every
// read and action; Stripe hosts are intercepted, so no real Stripe request is ever made.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const output = new URL('../test-results/billing-layout/', import.meta.url)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const runtimeErrors = [],
  unexpected = [],
  reports = []

const PERIOD_END = '2026-12-18T10:00:00Z'
const CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_synthetic'
const PORTAL_URL = 'https://billing.stripe.com/p/session/test_synthetic'
// Shared toast region: result toasts are announced here, not in the page body.
const TOAST = '[data-toast-region="corner"] [data-toast]'
const TOAST_ERROR = '[data-toast-region="corner"] [data-toast="error"]'
const TOAST_SUCCESS = '[data-toast-region="corner"] [data-toast="success"]'
const TOAST_INFO = '[data-toast-region="corner"] [data-toast="info"]'
const PLANS = {
  creator: { amount: 1900, currency: 'EUR' },
  pro: { amount: 4900, currency: 'EUR' },
  agency: { amount: 14900, currency: 'EUR' }
}
const invoice = (index, status = 'paid') => ({
  id: `in_test_${index}`,
  number: `SNEEP-000${index}`,
  status,
  createdAt: `2026-${String(7 + index).padStart(2, '0')}-18T09:00:00Z`,
  amount: 1900,
  currency: 'eur',
  hostedUrl: `https://invoice.stripe.com/i/test_${index}`,
  pdfUrl: `https://pay.stripe.com/invoice/test_${index}/pdf`
})
const INVOICES = [invoice(4), invoice(3), invoice(2), invoice(1), invoice(0, 'void')]
const subscription = (overrides = {}) => ({ status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: PERIOD_END, ...overrides })

/** Billing responses for each canvas state. Credits only feed the usage percentage. */
const SCENARIOS = {
  main: { account: { credits: 870, plan: 'creator', hasBillingProfile: true }, subscription: subscription(), invoices: INVOICES },
  free: { account: { credits: 650, plan: 'free', hasBillingProfile: false }, subscription: null, invoices: [] },
  pastDue: { account: { credits: 870, plan: 'creator', hasBillingProfile: true }, subscription: subscription({ status: 'past_due' }), invoices: INVOICES },
  cancelScheduled: { account: { credits: 870, plan: 'creator', hasBillingProfile: true }, subscription: subscription({ cancelAtPeriodEnd: true }), invoices: INVOICES },
  success: {
    account: { credits: 4800, plan: 'pro', hasBillingProfile: true },
    subscription: subscription(),
    invoices: INVOICES,
    checkoutVerification: { status: 'complete', planId: 'pro' }
  },
  pending: {
    account: { credits: 650, plan: 'free', hasBillingProfile: true },
    subscription: null,
    invoices: [],
    checkoutVerification: { status: 'pending', planId: 'pro' }
  },
  unavailable: { account: { credits: 870, plan: 'creator', hasBillingProfile: true }, subscription: subscription(), invoices: [], providerAvailable: false },
  admin: { account: { credits: 0, plan: 'agency', hasBillingProfile: true, creditsUnlimited: true }, subscription: null, invoices: [] },
  testMode: { mode: 'test', account: { credits: 650, plan: 'free', hasBillingProfile: false }, subscription: null, invoices: [] },
  invalidReturn: {
    account: { credits: 870, plan: 'creator', hasBillingProfile: true },
    subscription: subscription(),
    invoices: [],
    checkoutVerification: { status: 'invalid', planId: null }
  },
  // Stripe still reports an active subscription, but the server no longer grants paid access.
  unconfirmed: { account: { credits: 1300, plan: 'free', hasBillingProfile: true }, subscription: subscription({ currentPeriodEnd: '2026-10-20T00:00:00Z' }), invoices: [] }
}
const billing = (name) => ({ mode: 'live', providerAvailable: true, checkoutVerification: null, ...structuredClone(SCENARIOS[name]) })

async function fixture(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 900 },
    timezoneId: 'Europe/Bucharest',
    colorScheme: options.dark ? 'dark' : 'light',
    reducedMotion: 'reduce'
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(60000)
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text())) runtimeErrors.push(message.text())
  })
  let state = billing(options.scenario || 'main')
  const calls = { reads: [], reconciles: 0, checkouts: [], portals: [], stripe: [] }
  let failRead = Boolean(options.failRead),
    releaseRead
  const gate = new Promise((resolve) => (releaseRead = resolve))
  const identity = {
    id: '00000000-0000-4000-8000-000000003001',
    email: 'billing-layout@example.invalid',
    name: 'Ana Creator',
    profile_pic: null,
    credits: state.account.credits,
    plan: state.account.plan,
    access_role: state.account.creditsUnlimited ? 'admin' : 'member'
  }
  await context.route('**/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path !== '/v1/auth/refresh') {
      unexpected.push(`${route.request().method()} ${path}`)
      return route.fulfill({ status: 405, json: {} })
    }
    return route.fulfill({ json: { access_token: 'synthetic-billing-token', user: identity } })
  })
  // Hosted Stripe pages and invoice links never leave the machine.
  for (const host of ['checkout.stripe.com', 'billing.stripe.com', 'invoice.stripe.com', 'pay.stripe.com']) {
    await context.route(`https://${host}/**`, (route) => {
      calls.stripe.push(route.request().url())
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>${host}</title><p>${host}</p>` })
    })
  }
  await context.route('**/api/**', async (route) => {
    const request = route.request(),
      method = request.method(),
      url = new URL(request.url()),
      path = url.pathname
    if (method === 'GET' && path === '/api/stripe/billing') {
      calls.reads.push(url.search)
      if (options.holdRead) await gate
      if (failRead) return route.fulfill({ status: 503, json: { error: 'billing_unavailable' } })
      return route.fulfill({ json: state })
    }
    if (method === 'GET' && path === '/api/stripe/plans') return route.fulfill({ json: PLANS })
    if (method === 'POST' && path === '/api/stripe/reconcile') {
      calls.reconciles += 1
      assert.deepEqual(request.postDataJSON(), {})
      if (options.reconciled) state = billing(options.reconciled)
      return route.fulfill({ json: { reconciled: true } })
    }
    if (method === 'POST' && path === '/api/stripe/checkout') {
      calls.checkouts.push(request.postDataJSON())
      return route.fulfill({ json: options.checkoutResponse || { kind: 'checkout', url: CHECKOUT_URL } })
    }
    if (method === 'POST' && path === '/api/stripe/portal') {
      calls.portals.push(request.postDataJSON())
      return route.fulfill({ json: options.portalResponse || { url: PORTAL_URL } })
    }
    if (method !== 'GET') {
      unexpected.push(`${method} ${path}`)
      return route.fulfill({ status: 405, json: {} })
    }
    const responses = {
      '/api/user/profile': { profile: { ...identity, image: null, provider: 'credentials', createdAt: '2026-10-01T09:00:00Z' } },
      '/api/user/settings': { preferences: { locale: 'en', theme: 'system', timezone: 'UTC' }, sessions: [], mfa: { enabled: false }, securityEvents: [], exports: [] },
      '/api/workspace-agent/runs': { runs: [], has_more: false },
      '/api/workspace-agent/suggestions': { suggestions: [], capabilities: [] }
    }
    return route.fulfill({ json: responses[path] || {} })
  })
  return {
    page,
    calls,
    root: page.locator('[data-billing-workspace]'),
    release: () => releaseRead(),
    fail: (value) => (failRead = value),
    setScenario: (name) => (state = billing(name)),
    async open(search = '', wait = true) {
      await page.goto(`${origin}/${options.ro ? 'ro/' : ''}dashboard/billing${search}`, {
        waitUntil: options.holdRead ? 'domcontentloaded' : 'networkidle'
      })
      // First paint can be slow while the shared machine runs other builds.
      if (wait) await page.locator('[data-billing-workspace]').waitFor({ timeout: 60000 })
    },
    close: async () => {
      releaseRead()
      await context.close()
    }
  }
}

async function capture(f, name) {
  await f.page.evaluate(() => window.scrollTo(0, 0))
  await noOverflow(f.page, name)
  await f.page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true })
  reports.push(name)
}
async function noOverflow(page, name) {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
    `${name}: no horizontal overflow`
  )
}
/** Polls until the locator's text matches, so assertions never race a re-render. */
async function textMatches(locator, pattern, message) {
  const deadline = Date.now() + 10000
  let text = ''
  while (Date.now() < deadline) {
    text = await locator.innerText().catch(() => '')
    if (pattern.test(text)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.match(text, pattern, message)
}
async function until(check, message) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.fail(message)
}
async function view(f, name) {
  await f.page.locator(`[data-billing-workspace][data-view="${name}"]`).waitFor()
}
async function rememberShell(page) {
  await page.evaluate(() => {
    window.billingShellProbe = {
      document,
      shell: document.querySelector('#dashboard-shell'),
      main: document.querySelector('#dashboard-main'),
      sidebar: document.querySelector('[data-slot="sidebar"]')
    }
  })
}
async function assertShell(page) {
  assert.equal(
    await page.evaluate(() => {
      const probe = window.billingShellProbe
      return Boolean(
        probe &&
          probe.document === document &&
          probe.shell === document.querySelector('#dashboard-shell') &&
          probe.main === document.querySelector('#dashboard-main') &&
          probe.sidebar === document.querySelector('[data-slot="sidebar"]')
      )
    }),
    true,
    'Dashboard shell stays mounted'
  )
}
async function noCredits(f, name) {
  assert.equal(await f.root.getByText(/credit/i).count(), 0, `${name}: usage is shown as percentages, never credits`)
}

// ---------------------------------------------------------------- canvas reference states (RO)
async function references() {
  for (const dark of [false, true]) {
    const mode = dark ? 'dark' : 'light'
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const mobile = viewport.width < 1024
      const prefix = `${mobile ? 'mobile' : 'desktop'}-${mode}`
      const f = await fixture({ dark, viewport, ro: true })
      try {
        await f.open()
        await f.root.locator('[data-billing-summary]').waitFor()
        const summary = f.root.locator('[data-billing-summary]')
        await textMatches(summary, /Plan curent[\s\S]*Creator[\s\S]*Activ/, `${prefix}: plan and state`)
        await textMatches(summary, /19\s€ \/ lună[\s\S]*Utilizare standard[\s\S]*Se reînnoiește la 18 dec\. 2026/, `${prefix}: plan facts`)
        await textMatches(summary, /Utilizare lunară[\s\S]*42%[\s\S]*folosit[\s\S]*58% rămas[\s\S]*Se resetează la 18 dec\. 2026/, `${prefix}: usage meter`)
        assert.equal(await summary.getByRole('progressbar').getAttribute('aria-valuenow'), '42')
        await noCredits(f, prefix)
        const primary = f.root.getByRole('button', { name: 'Schimbă planul' })
        assert.equal(
          await primary.evaluate((element) => getComputedStyle(element).backgroundColor),
          dark ? 'rgb(142, 155, 176)' : 'rgb(11, 11, 12)',
          `${prefix}: primary action is black / muted steel`
        )
        const rows = f.root.locator('[data-billing-invoices="recent"] [data-billing-invoice]')
        assert.equal(await rows.count(), 3, `${prefix}: overview lists the latest three invoices`)
        await textMatches(rows.first(), /18 nov\. 2026[\s\S]*SNEEP-0004[\s\S]*19,00\s€[\s\S]*Plătită/, `${prefix}: invoice row`)
        assert.equal(await f.root.getByRole('link', { name: 'Meniu' }).isVisible(), mobile, `${prefix}: phone back to the menu`)
        assert.equal(await f.root.locator('[data-billing-refresh]').isVisible(), !mobile, `${prefix}: refresh on desktop`)
        await capture(f, `${prefix}-main`)

        await primary.click()
        await view(f, 'plans')
        const plans = f.root.locator('[data-billing-plan]')
        assert.equal(await plans.count(), 4)
        assert.deepEqual(await plans.evaluateAll((items) => items.map((item) => item.dataset.billingPlan)), ['free', 'creator', 'pro', 'agency'])
        assert.equal(await f.root.locator('[data-billing-plan="pro"]').getAttribute('data-selected'), 'true', 'Next plan up is preselected')
        await textMatches(f.root.locator('[data-billing-plan="creator"]'), /Creator[\s\S]*Plan curent[\s\S]*19\s€\/lună[\s\S]*Utilizare standard/)
        await textMatches(f.root.locator('[data-billing-plan="pro"]'), /49\s€\/lună[\s\S]*3× mai multă utilizare[\s\S]*Tablou de analiză/)
        await textMatches(f.root.locator('[data-billing-plan="agency"]'), /149\s€\/lună[\s\S]*13× mai multă utilizare/)
        await textMatches(f.root.locator('[data-billing-plan="free"]'), /Fără cost[\s\S]*Utilizare de probă/)
        for (const plan of ['free', 'creator', 'pro', 'agency'])
          assert.equal(await f.root.locator(`[data-billing-plan="${plan}"] img`).getAttribute('src'), `/illustrations/plan-${plan}.webp`)
        await until(() => f.root.locator('[data-billing-plan] img').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0)), 'Plan illustrations load')
        await capture(f, `${prefix}-plans`)
        await f.root.locator('[data-billing-back]').click()
        await view(f, 'overview')

        await f.root.getByRole('button', { name: 'Vezi toate' }).click()
        await view(f, 'invoices')
        assert.equal(await f.root.locator('[data-billing-invoice]').count(), 5)
        await textMatches(f.root.locator('[data-billing-invoice]').last(), /18 iul\. 2026[\s\S]*SNEEP-0000[\s\S]*Anulată/)
        await capture(f, `${prefix}-invoices`)
        await f.root.locator('[data-billing-back]').click()
        await view(f, 'overview')

        await (mobile ? f.root.locator('[data-billing-details-mobile]') : f.root.locator('[data-billing-details-topic="usage"]')).click()
        await view(f, 'details')
        await textMatches(f.root.locator('[data-billing-details]'), /Utilizare[\s\S]*Acces plătit[\s\S]*Modificări și anulare[\s\S]*Gestionează facturarea/)
        await capture(f, `${prefix}-details`)
      } finally {
        await f.close()
      }

      for (const [state, scenario, search, expected] of [
        ['free', 'free', '', /Acces curent[\s\S]*Gratuit[\s\S]*Niciun abonament activ[\s\S]*Utilizare de probă · nu se resetează[\s\S]*5 clipuri \/ generare · 720p[\s\S]*Alege planul[\s\S]*35%[\s\S]*65% rămas[\s\S]*Nu se resetează/],
        ['past-due', 'pastDue', '', /Plata necesită atenție[\s\S]*Utilizarea rămasă este păstrată[\s\S]*Plată restantă[\s\S]*Se reînnoiește la 18 dec\. 2026/],
        ['cancel-scheduled', 'cancelScheduled', '', /nu se va reînnoi automat[\s\S]*continuă până la 18 dec\. 2026[\s\S]*Anulare programată[\s\S]*Se încheie la 18 dec\. 2026/],
        ['success', 'success', '?checkout_session_id=cs_test_synthetic', /Pro[\s\S]*Activ[\s\S]*3× mai multă utilizare[\s\S]*4%[\s\S]*96% rămas/]
      ]) {
        const g = await fixture({ dark, viewport, ro: true, scenario })
        try {
          await g.open(search)
          await textMatches(g.root, expected, `${prefix}-${state}`)
          await noCredits(g, `${prefix}-${state}`)
          if (state === 'free') {
            await textMatches(g.root.locator('[data-billing-invoices]'), /Nicio factură încă/)
            assert.equal(await g.root.locator('[data-billing-view-all]').count(), 0)
          }
          if (state === 'success') await g.page.locator('[data-toast-region="corner"] [data-toast="success"]').filter({ hasText: 'Plată confirmată' }).waitFor()
          if (state === 'past-due') {
            assert.equal(await g.root.getByRole('button', { name: 'Schimbă planul' }).count(), 0, 'Past due: billing portal only')
            const manage = g.root.locator('[data-billing-summary-actions] [data-billing-hosted="portal"]')
            assert.equal(await manage.evaluate((element) => getComputedStyle(element).backgroundColor), dark ? 'rgb(142, 155, 176)' : 'rgb(11, 11, 12)')
          }
          await capture(g, `${prefix}-${state}`)
        } finally {
          await g.close()
        }
      }
      for (const [state, options] of [
        ['error', { failRead: true }],
        ['loading', { holdRead: true }]
      ]) {
        const g = await fixture({ dark, viewport, ro: true, ...options })
        try {
          await g.open()
          await g.root.locator(`[data-billing-initial="${state}"]`).waitFor()
          if (state === 'error') {
            await textMatches(g.root, /Pagina nu a putut fi încărcată\.[\s\S]*Încearcă din nou/)
            await until(() => g.root.locator('[data-billing-initial] img').evaluate((image) => image.complete && image.naturalWidth > 0), 'Error illustration loads')
          }
          await capture(g, `${prefix}-${state}`)
        } finally {
          await g.close()
        }
      }
    }
  }
  console.log('Billing canvas states captured: main, plans, invoices, details, free, past due, cancel scheduled, success, error, loading (desktop/mobile, light/dark)')
}

// ---------------------------------------------------------------- every control (EN)
async function desktopControls() {
  const f = await fixture()
  try {
    await f.open()
    await f.root.locator('[data-billing-summary]').waitFor()
    await rememberShell(f.page)

    // Refresh reconciles with Stripe, then reloads the billing read.
    const reads = f.calls.reads.length
    await f.root.getByRole('button', { name: 'Refresh billing status' }).click()
    await until(() => f.calls.reconciles === 1 && f.calls.reads.length > reads, 'Refresh reconciles and reloads')

    // Invoice PDF opens the hosted PDF in a new tab.
    const [pdf] = await Promise.all([
      f.page.context().waitForEvent('page'),
      f.root.getByRole('link', { name: 'Download PDF SNEEP-0004' }).click()
    ])
    await pdf.waitForLoadState()
    assert.equal(pdf.url(), 'https://pay.stripe.com/invoice/test_4/pdf')
    await pdf.close()

    // View all → full table with View + PDF per invoice.
    await f.root.getByRole('button', { name: 'View all' }).click()
    await view(f, 'invoices')
    await assertShell(f.page)
    assert.equal(await f.root.getByRole('columnheader').count(), 5)
    const [hosted] = await Promise.all([
      f.page.context().waitForEvent('page'),
      f.root.getByRole('link', { name: 'View invoice SNEEP-0003' }).click()
    ])
    await hosted.waitForLoadState()
    assert.equal(hosted.url(), 'https://invoice.stripe.com/i/test_3')
    await hosted.close()
    const [fullPdf] = await Promise.all([
      f.page.context().waitForEvent('page'),
      f.root.getByRole('link', { name: 'Download PDF SNEEP-0000' }).click()
    ])
    await fullPdf.waitForLoadState()
    assert.equal(fullPdf.url(), 'https://pay.stripe.com/invoice/test_0/pdf')
    await fullPdf.close()
    await f.root.getByRole('button', { name: 'Back' }).click()
    await view(f, 'overview')

    // Every billing-details row opens the details page.
    for (const topic of ['usage', 'access', 'changes']) {
      await f.root.locator(`[data-billing-details-topic="${topic}"]`).click()
      await view(f, 'details')
      await textMatches(f.root.getByRole('heading', { level: 1 }), /Billing details/)
      await f.root.getByRole('button', { name: 'Back' }).click()
      await view(f, 'overview')
    }

    // Change plan → Cancel and Back both return to the overview.
    await f.root.getByRole('button', { name: 'Change plan' }).click()
    await view(f, 'plans')
    await f.root.getByRole('button', { name: 'Cancel' }).click()
    await view(f, 'overview')
    await f.root.getByRole('button', { name: 'Change plan' }).click()
    await view(f, 'plans')
    await f.root.getByRole('button', { name: 'Back' }).click()
    await view(f, 'overview')
    await assertShell(f.page)

    // A subscriber changes plans in the billing portal (any plan, including Free).
    await f.root.getByRole('button', { name: 'Change plan' }).click()
    await view(f, 'plans')
    await f.root.getByRole('radio', { name: 'Free' }).check({ force: true })
    assert.equal(await f.root.locator('[data-billing-plan="free"]').getAttribute('data-selected'), 'true')
    await f.root.getByRole('radio', { name: 'Agency' }).check({ force: true })
    assert.equal(await f.root.getByRole('radio', { name: 'Creator' }).isDisabled(), true, 'The current plan cannot be chosen')
    await Promise.all([f.page.waitForURL(PORTAL_URL), f.root.getByRole('button', { name: 'Continue in billing' }).click()])
    assert.deepEqual(f.calls.portals, [{ locale: 'en' }])
    assert.equal(f.calls.checkouts.length, 0)
  } finally {
    await f.close()
  }

  // Manage billing in the summary and on the details page opens the portal.
  for (const where of ['summary', 'details']) {
    const g = await fixture()
    try {
      await g.open()
      if (where === 'details') {
        await g.root.locator('[data-billing-details-topic="changes"]').click()
        await view(g, 'details')
      }
      await Promise.all([g.page.waitForURL(PORTAL_URL), g.root.getByRole('button', { name: 'Manage billing' }).click()])
      assert.deepEqual(g.calls.portals, [{ locale: 'en' }], `${where}: portal request`)
    } finally {
      await g.close()
    }
  }

  // A free account chooses a paid plan in Stripe Checkout.
  const free = await fixture({ scenario: 'free' })
  try {
    await free.open()
    assert.equal(await free.root.getByRole('button', { name: 'Manage billing' }).count(), 0, 'No portal without a billing profile')
    await free.root.getByRole('button', { name: 'Choose plan' }).click()
    await view(free, 'plans')
    assert.equal(await free.root.locator('[data-billing-plan="creator"]').getAttribute('data-selected'), 'true')
    assert.equal(await free.root.getByRole('radio', { name: 'Free' }).isDisabled(), true)
    await free.root.getByRole('radio', { name: 'Pro' }).check({ force: true })
    await Promise.all([free.page.waitForURL(CHECKOUT_URL), free.root.getByRole('button', { name: 'Continue in billing' }).click()])
    assert.deepEqual(free.calls.checkouts, [{ planId: 'pro', locale: 'en' }])
  } finally {
    await free.close()
  }

  // An unexpected checkout host is never followed.
  const unsafe = await fixture({ scenario: 'free', checkoutResponse: { kind: 'checkout', url: 'https://checkout.stripe.com.attacker.invalid/session' } })
  try {
    await unsafe.open()
    await unsafe.root.getByRole('button', { name: 'Choose plan' }).click()
    await view(unsafe, 'plans')
    await unsafe.root.getByRole('button', { name: 'Continue in billing' }).click()
    await unsafe.page.locator(TOAST_ERROR).filter({ hasText: 'Could not start checkout.' }).waitFor()
    assert.match(unsafe.page.url(), /\/dashboard\/billing/)
    assert.equal(unsafe.calls.stripe.length, 0)
  } finally {
    await unsafe.close()
  }

  // Load failure → Try again reloads the page data.
  const error = await fixture({ failRead: true })
  try {
    await error.open()
    await error.root.locator('[data-billing-initial="error"]').waitFor()
    error.fail(false)
    await error.root.getByRole('button', { name: 'Try again' }).click()
    await error.root.locator('[data-billing-summary]').waitFor()
  } finally {
    await error.close()
  }

  // Invoices unavailable → Retry reconciles and reloads.
  const stale = await fixture({ scenario: 'unavailable', reconciled: 'main' })
  try {
    await stale.open()
    await textMatches(stale.root.locator('[data-billing-invoices]'), /Invoice history is temporarily unavailable/)
    await stale.root.getByRole('button', { name: 'Retry' }).click()
    await stale.root.locator('[data-billing-invoices="recent"] [data-billing-invoice]').first().waitFor()
    assert.equal(stale.calls.reconciles, 1)
  } finally {
    await stale.close()
  }

  // Pending checkout: the confirmation refresh replaces Choose plan until Stripe confirms.
  const pending = await fixture({ scenario: 'pending' })
  try {
    await pending.open('?checkout_session_id=cs_test_synthetic')
    await pending.root.locator('[data-billing-notice="pending"]').waitFor()
    assert.equal(await pending.root.getByRole('button', { name: 'Choose plan' }).count(), 0)
    const reconciles = pending.calls.reconciles
    pending.setScenario('success')
    await pending.root.locator('[data-billing-confirm-refresh]').click()
    await until(() => pending.calls.reconciles > reconciles, 'Confirmation refresh reconciles with Stripe')
    await pending.page.locator(TOAST_SUCCESS).filter({ hasText: 'Payment confirmed.' }).waitFor()
    // The page re-verifies the same checkout session (the sidebar's usage read has no query).
    assert.ok(pending.calls.reads.filter((search) => search.includes('checkout_session_id=cs_test_synthetic')).length >= 2)
  } finally {
    await pending.close()
  }

  // Admins keep the portal but see no plan upsell or usage meter.
  const admin = await fixture({ scenario: 'admin' })
  try {
    await admin.open()
    await textMatches(admin.root.locator('[data-billing-summary]'), /Administrator · unlimited[\s\S]*All features included/)
    assert.equal(await admin.root.getByRole('button', { name: /Change plan|Choose plan/ }).count(), 0)
    assert.equal(await admin.root.getByRole('progressbar').count(), 0)
    assert.equal(await admin.root.getByRole('button', { name: 'Manage billing' }).count(), 1)
  } finally {
    await admin.close()
  }

  // Test mode and canceled checkout are announced above the plan.
  const notices = await fixture({ scenario: 'testMode' })
  try {
    await notices.open('?canceled=true')
    await notices.root.locator('[data-billing-notice="test-mode"]').filter({ hasText: 'Stripe test payments' }).waitFor()
    await notices.page.locator(TOAST_INFO).filter({ hasText: 'Checkout was canceled' }).waitFor()
  } finally {
    await notices.close()
  }
  console.log('Desktop: refresh, invoice PDF/view links, view all, detail rows, change plan cancel/back, portal + checkout continue, unsafe host, retry, pending, admin, notices passed')
}

// ---------------------------------------------------------------- billing policies (EN)
async function policies() {
  // A foreign or invalid Checkout return grants nothing and says so.
  const invalid = await fixture({ scenario: 'invalidReturn' })
  try {
    await invalid.open('?checkout_session_id=cs_test_foreign')
    await invalid.page.locator(TOAST_ERROR).filter({ hasText: "We couldn't verify this checkout" }).waitFor()
    await textMatches(invalid.root.locator('[data-billing-effective-plan]'), /^Creator$/)
  } finally {
    await invalid.close()
  }

  // Returning from the billing portal reconciles before showing the saved state.
  const portalReturn = await fixture({ scenario: 'main' })
  try {
    await portalReturn.open('?portal_return=true')
    await portalReturn.root.locator('[data-billing-summary]').waitFor()
    assert.ok(portalReturn.calls.reconciles >= 1, 'Portal return reconciles with Stripe')
  } finally {
    await portalReturn.close()
  }

  // Hosted destinations: a stale checkout may open the subscription portal; anything else is refused.
  for (const [response, destination] of [
    [{ kind: 'portal', url: PORTAL_URL }, PORTAL_URL],
    [{ kind: 'unknown', url: CHECKOUT_URL }, null],
    [{ kind: 'portal', url: 'https://checkout.stripe.com/c/pay/cs_test_mismatched' }, null]
  ]) {
    const f = await fixture({ scenario: 'free', checkoutResponse: response })
    try {
      await f.open()
      await f.root.getByRole('button', { name: 'Choose plan' }).click()
      await view(f, 'plans')
      const continueButton = f.root.getByRole('button', { name: 'Continue in billing' })
      if (destination) {
        // A double click starts one hosted session only.
        await Promise.all([f.page.waitForURL(destination), continueButton.dblclick()])
      } else {
        await continueButton.click()
        await f.page.locator(TOAST_ERROR).filter({ hasText: 'Could not start checkout.' }).waitFor()
        assert.equal(new URL(f.page.url()).origin, origin)
      }
      assert.equal(f.calls.checkouts.length, 1, `${response.kind}: one checkout request`)
    } finally {
      await f.close()
    }
  }

  // The portal button refuses a Checkout URL.
  const portalMismatch = await fixture({ portalResponse: { url: CHECKOUT_URL } })
  try {
    await portalMismatch.open()
    await portalMismatch.root.getByRole('button', { name: 'Manage billing' }).click()
    await portalMismatch.page.locator(TOAST_ERROR).filter({ hasText: 'Could not open the billing portal.' }).waitFor()
    assert.equal(portalMismatch.calls.stripe.length, 0)
  } finally {
    await portalMismatch.close()
  }

  // Unconfirmed paid access shows Free with guidance, never a renewal; refresh restores the plan.
  const unconfirmed = await fixture({ scenario: 'unconfirmed', reconciled: 'main' })
  try {
    await unconfirmed.open()
    const summary = unconfirmed.root.locator('[data-billing-summary]')
    await unconfirmed.root.locator('[data-billing-notice="unconfirmed"]').waitFor()
    await textMatches(summary, /Free[\s\S]*Confirmation needed[\s\S]*Last confirmed period end 20 Oct 2026/)
    assert.doesNotMatch(await summary.innerText(), /Renews on/)
    await rememberShell(unconfirmed.page)
    await unconfirmed.root.getByRole('button', { name: 'Refresh billing status' }).click()
    await textMatches(summary, /Creator[\s\S]*Active[\s\S]*Renews on 18 Dec 2026/)
    assert.equal(await unconfirmed.root.locator('[data-billing-notice="unconfirmed"]').count(), 0)
    await assertShell(unconfirmed.page)
  } finally {
    await unconfirmed.close()
  }

  // Live mode shows no test-payments warning.
  const live = await fixture({ scenario: 'main' })
  try {
    await live.open()
    await live.root.locator('[data-billing-summary]').waitFor()
    assert.equal(await live.root.locator('[data-billing-notice="test-mode"]').count(), 0)
  } finally {
    await live.close()
  }
  console.log('Policies: invalid return, portal-return reconcile, hosted destination kinds, double click, portal mismatch, unconfirmed coverage, live mode passed')
}

async function mobileControls() {
  const f = await fixture({ viewport: { width: 390, height: 844 } })
  try {
    await f.open()
    await f.root.locator('[data-billing-summary]').waitFor()
    assert.equal(await f.page.locator('[data-workspace-mobile-header]').isVisible(), true, 'Phone header is shown')
    for (const [open, target] of [
      [() => f.root.getByRole('button', { name: 'Change plan' }).click(), 'plans'],
      [() => f.root.getByRole('button', { name: 'View all' }).click(), 'invoices'],
      [() => f.root.locator('[data-billing-details-mobile]').click(), 'details']
    ]) {
      await open()
      await view(f, target)
      await f.root.getByRole('button', { name: 'Plan & billing' }).click()
      await view(f, 'overview')
    }
    const [pdf] = await Promise.all([
      f.page.context().waitForEvent('page'),
      f.root.getByRole('link', { name: 'Download PDF SNEEP-0003' }).click()
    ])
    await pdf.waitForLoadState()
    assert.equal(pdf.url(), 'https://pay.stripe.com/invoice/test_3/pdf')
    await pdf.close()
    await f.root.getByRole('button', { name: 'Change plan' }).click()
    await view(f, 'plans')
    await f.root.getByRole('button', { name: 'Cancel' }).click()
    await view(f, 'overview')
    await f.root.getByRole('link', { name: 'Menu' }).click()
    await f.page.waitForURL(/\/dashboard\/settings$/)
  } finally {
    await f.close()
  }
  console.log('Phone: change plan, view all, details, back buttons, cancel, PDF link and Menu → settings passed')
}

async function overflow() {
  for (const width of [320, 360, 390, 768, 1024, 1280, 1440]) {
    for (const scenario of ['main', 'free', 'unavailable']) {
      const f = await fixture({ viewport: { width, height: 900 }, scenario, ro: true })
      try {
        await f.open()
        await f.root.locator('[data-billing-summary]').waitFor()
        await noOverflow(f.page, `${scenario} overview at ${width}px`)
        if (scenario !== 'main') continue
        for (const [open, target] of [
          ['[data-billing-choose-plan]', 'plans'],
          ['[data-billing-view-all]', 'invoices'],
          [width < 1024 ? '[data-billing-details-mobile]' : '[data-billing-details-topic="usage"]', 'details']
        ]) {
          await f.root.locator(open).click()
          await view(f, target)
          await noOverflow(f.page, `${target} at ${width}px`)
          await f.root.locator('[data-billing-back]').click()
          await view(f, 'overview')
        }
      } finally {
        await f.close()
      }
    }
  }
  console.log('No horizontal overflow at 320–1440px in every view')
}

try {
  await mkdir(output, { recursive: true })
  const only = process.env.BILLING_GROUPS?.split(',')
  const groups = { references, desktopControls, policies, mobileControls, overflow }
  for (const [name, run] of Object.entries(groups)) if (!only || only.includes(name)) await run()
  assert.deepEqual(runtimeErrors, [], 'No runtime or console errors')
  assert.deepEqual(unexpected, [], 'No unexpected requests')
  await writeFile(
    fileURLToPath(new URL('report.json', output)),
    JSON.stringify({ screenshots: reports, available: (await readdir(output)).filter((name) => name.endsWith('.png')).sort(), fixtureOnly: true }, null, 2)
  )
  console.log('Billing layout browser test passed')
} finally {
  await browser.close()
}
