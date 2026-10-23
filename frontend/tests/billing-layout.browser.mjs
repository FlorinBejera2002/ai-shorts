import assert from 'node:assert/strict'
import { mkdir, readFile, stat, utimes, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

// Run against a separately started Vite server. All authenticated data and every
// billing request are synthetic; no request reaches Stripe or an application DB.
if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error(
    'Set PLAYWRIGHT_MODULE to the installed Playwright entry point'
  )
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const output = new URL('../test-results/billing-layout/', import.meta.url)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const runtimeErrors = []
const blockedMutations = []
const reports = []
let fastRefreshVerified = false
const accountId = '00000000-0000-4000-8000-000000000831'
const plans = {
  creator: { amount: 1900, currency: 'EUR' },
  pro: { amount: 4900, currency: 'EUR' },
  agency: { amount: 14900, currency: 'EUR' }
}
const invoices = Array.from({ length: 6 }, (_, index) => ({
  id: `in_synthetic_${index}`,
  number: `INV-2026-${String(10 - index).padStart(3, '0')}`,
  status: 'paid',
  createdAt: `2026-${String(10 - index).padStart(2, '0')}-23T12:00:00Z`,
  amount: 4900,
  currency: 'eur',
  hostedUrl: `https://invoice.stripe.com/i/synthetic_${index}`,
  pdfUrl: `https://invoice.stripe.com/i/synthetic_${index}/pdf`
}))
function billing(overrides = {}) {
  return {
    account: { credits: 1000, plan: 'free', hasBillingProfile: false },
    subscription: null,
    invoices: [],
    providerAvailable: true,
    checkoutVerification: null,
    ...overrides
  }
}
const active = () =>
  billing({
    account: { credits: 3240, plan: 'pro', hasBillingProfile: true },
    subscription: {
      status: 'active',
      currentPeriodEnd: '2026-11-23T00:00:00Z',
      cancelAtPeriodEnd: false
    },
    invoices: structuredClone(invoices)
  })
const scheduled = () => ({
  ...active(),
  subscription: { ...active().subscription, cancelAtPeriodEnd: true }
})
const pending = () =>
  billing({
    account: { credits: 1000, plan: 'free', hasBillingProfile: true },
    checkoutVerification: { status: 'pending', planId: 'pro' }
  })
const pastDue = () => ({
  ...active(),
  account: { credits: 3240, plan: 'free', hasBillingProfile: true },
  subscription: { ...active().subscription, status: 'past_due' },
  invoices: [{ ...invoices[0], status: 'open' }, ...invoices.slice(1)]
})

async function fixture(initial, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1488, height: 1058 },
    timezoneId: 'Europe/Bucharest',
    colorScheme: options.light ? 'light' : 'dark',
    reducedMotion: 'reduce'
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    if (
      /Failed to load resource: the server responded with a status of 503/.test(
        message.text()
      )
    )
      return
    runtimeErrors.push(message.text())
  })
  let current = structuredClone(initial)
  let failBilling = options.initialFailure || false
  let failReconcile = options.reconcileFailure || false
  let releaseRead, releaseHosted
  const readGate = new Promise((resolve) => {
    releaseRead = resolve
  })
  const hostedGate = new Promise((resolve) => {
    releaseHosted = resolve
  })
  const calls = { reads: 0, reconcile: 0, checkout: [], portal: [], auth: 0 }
  const user = () => ({
    id: accountId,
    email: 'billing-layout@example.invalid',
    name: 'Design workspace',
    profile_pic: null,
    credits: current.account.credits,
    plan: current.account.plan,
    access_role: options.admin ? 'admin' : 'member'
  })
  await context.route('**/v1/**', (route) => {
    calls.auth += 1
    return route.fulfill({
      json: { access_token: 'synthetic-token', user: user() }
    })
  })
  await context.route('**/api/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname
    if (path === '/api/stripe/billing' && request.method() === 'GET') {
      calls.reads += 1
      if (options.holdInitialRead && calls.reads === 1) await readGate
      if (failBilling || (options.failAfterInitial && calls.reads > 1))
        return route.fulfill({
          status: 503,
          json: { error: 'synthetic_billing_unavailable' }
        })
      return route.fulfill({ json: current })
    }
    if (path === '/api/stripe/reconcile') {
      calls.reconcile += 1
      assert.equal(request.method(), 'POST')
      assert.deepEqual(request.postDataJSON(), {})
      if (failReconcile || calls.reconcile <= (options.reconcileFailures || 0))
        return route.fulfill({
          status: 503,
          json: { error: 'synthetic_provider_unavailable' }
        })
      if (options.reconciled) current = structuredClone(options.reconciled)
      return route.fulfill({ json: { reconciled: true } })
    }
    if (path === '/api/stripe/checkout' || path === '/api/stripe/portal') {
      assert.equal(request.method(), 'POST')
      const kind = path.endsWith('checkout') ? 'checkout' : 'portal'
      const payload = request.postDataJSON()
      assert.equal(payload.locale, options.locale || 'en')
      if (kind === 'checkout')
        assert.ok(['creator', 'pro', 'agency'].includes(payload.planId))
      else assert.equal(payload.planId, undefined)
      calls[kind].push(payload)
      if (options.holdHosted) await hostedGate
      return route.fulfill({
        status: options.hostedStatus || 200,
        json: options.hostedResponse || {
          kind,
          url: `https://${kind}.stripe.com.attacker.invalid/session`
        }
      })
    }
    if (request.method() !== 'GET') {
      blockedMutations.push(`${request.method()} ${path}`)
      return route.fulfill({
        status: 405,
        json: { error: 'Unexpected synthetic fixture mutation' }
      })
    }
    const responses = {
      '/api/stripe/plans': options.plans || plans,
      '/api/dashboard': {
        metrics: {
          credits: current.account.credits,
          plan: current.account.plan,
          activity: [],
          statuses: {},
          jobCount: 0,
          clipCount: 0,
          durationMinutes: 0
        },
        recentClips: []
      },
      '/api/workspace-agent/runs': { runs: [], has_more: false },
      '/api/workspace-agent/suggestions': { suggestions: [], capabilities: [] },
      '/api/publishing': { providers: [], accounts: [], clips: [], posts: [] },
      '/api/calendar': { posts: [], clips: [] },
      '/api/user/brand': { brandKit: {} }
    }
    return route.fulfill({ json: responses[path] || {} })
  })
  const workspace = page.locator('[data-billing-workspace]')
  return {
    context,
    page,
    workspace,
    calls,
    releaseRead,
    releaseHosted,
    setBilling(next) {
      current = structuredClone(next)
    },
    setFailures(next = {}) {
      if ('billing' in next) failBilling = next.billing
      if ('reconcile' in next) failReconcile = next.reconcile
    },
    async open(query = '', { wait = true } = {}) {
      await page.goto(
        `${origin}/${options.locale === 'ro' ? 'ro/' : ''}dashboard/billing${query}`,
        {
          waitUntil: options.holdInitialRead
            ? 'domcontentloaded'
            : 'networkidle'
        }
      )
      if (wait) await workspace.locator('[data-billing-summary]').waitFor()
    },
    async close() {
      releaseRead()
      releaseHosted()
      await context.close()
    }
  }
}
async function noOverflow(page, label) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    true,
    `${label}: no horizontal overflow`
  )
}
async function capture(f, name) {
  await noOverflow(f.page, name)
  await f.page.evaluate(() => window.scrollTo(0, 0))
  assert.equal(
    await f.page.evaluate(() => {
      const link = document.querySelector('a[href="#dashboard-main"]')
      return (
        !link ||
        link.matches(':focus') ||
        link.getBoundingClientRect().bottom <= 0
      )
    }),
    true,
    `${name}: the unfocused skip link stays outside the viewport`
  )
  await f.page.screenshot({
    path: fileURLToPath(new URL(`${name}.png`, output)),
    fullPage: true
  })
  reports.push(name)
}
async function rememberShell(page) {
  await page.evaluate(() => {
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    window.billingShellProbe = {
      document,
      main: document.querySelector('main'),
      header: document.querySelector('header.studio-topbar'),
      sidebar,
      state: sidebar?.getAttribute('data-state')
    }
    if (
      !window.billingShellProbe.main ||
      !window.billingShellProbe.header ||
      !sidebar
    )
      throw new Error('Missing dashboard shell')
  })
}
async function assertShell(page) {
  assert.equal(
    await page.evaluate(() => {
      const p = window.billingShellProbe,
        sidebar = document.querySelector('[data-slot="sidebar"]')
      return (
        p.document === document &&
        p.main === document.querySelector('main') &&
        p.header === document.querySelector('header.studio-topbar') &&
        p.sidebar === sidebar &&
        p.state === sidebar?.getAttribute('data-state')
      )
    }),
    true,
    'Dashboard document, main, header, sidebar and sidebar state remain mounted'
  )
}
async function openPlans(f) {
  await f.page
    .getByRole('button', { name: /^(Change plan|Choose plan)$/ })
    .click()
  await f.workspace.locator('[data-billing-plans]').waitFor()
  assert.equal(await f.workspace.getAttribute('data-view'), 'plans')
}
async function choose(f, id) {
  const option = f.workspace.locator(`[data-billing-plan="${id}"]`)
  if ((await option.getAttribute('role')) === 'radio') await option.click()
  else await option.locator('input[type="radio"], [role="radio"]').click()
}
const continueButton = (f) =>
  f.workspace.locator('[data-billing-continue]').getByRole('button').first()

async function referenceStates() {
  for (const mobile of [false, true]) {
    const prefix = mobile ? 'mobile' : 'desktop'
    const viewport = mobile
      ? { width: 390, height: 844 }
      : { width: 1488, height: 1058 }
    const states = [
      ['overview', active()],
      ['plans', active()],
      ['invoices', active()],
      ['billing-details', active()],
      ['free', billing()],
      ['cancel-scheduled', scheduled()],
      [
        'payment-pending',
        pending(),
        '?checkout_session_id=cs_test_synthetic_pending'
      ],
      ['checkout-canceled', billing(), '?canceled=true'],
      ['past-due', pastDue()],
      ['loading', billing(), '', { holdInitialRead: true }],
      ['load-error', billing(), '', { initialFailure: true }]
    ]
    for (const [name, data, query = '', settings = {}] of states) {
      const f = await fixture(data, { viewport, ...settings })
      try {
        await f.open(query, { wait: !['loading', 'load-error'].includes(name) })
        if (name === 'loading' || name === 'load-error') {
          await f.workspace
            .locator(
              `[data-billing-initial="${name === 'loading' ? 'loading' : 'error'}"]`
            )
            .waitFor()
          assert.equal(
            await f.workspace.locator('[data-billing-summary]').count(),
            0,
            'Initial loading/error invent no financial data'
          )
        }
        if (name === 'plans') {
          await openPlans(f)
          await choose(f, 'agency')
        }
        if (name === 'invoices') {
          await f.workspace.locator('[data-billing-view-all]').click()
          await f.workspace.locator('[data-billing-invoices]').waitFor()
          assert.equal(await f.workspace.getAttribute('data-view'), 'invoices')
        }
        if (name === 'billing-details') {
          await f.workspace
            .locator('[data-billing-details-trigger]')
            .filter({ visible: true })
            .first()
            .click()
          if (mobile)
            assert.equal(await f.workspace.getAttribute('data-view'), 'details')
        }
        if (name === 'free') {
          assert.equal(
            await f.page
              .getByRole('button', { name: 'Manage billing', exact: true })
              .count(),
            0
          )
          await f.page.getByText('No invoices yet', { exact: true }).waitFor()
        }
        if (name === 'cancel-scheduled') {
          await f.workspace
            .locator('[data-billing-notice="cancellation"]')
            .waitFor()
          assert.doesNotMatch(await f.workspace.innerText(), /Renews/)
        }
        if (name === 'past-due') {
          await f.workspace.locator('[data-billing-notice="payment"]').waitFor()
          assert.match(
            await f.workspace.locator('[data-billing-summary]').innerText(),
            /Free/
          )
          assert.doesNotMatch(await f.workspace.innerText(), /Renews/)
        }
        if (name === 'payment-pending') {
          await f.workspace.locator('[data-billing-notice="pending"]').waitFor()
          assert.match(
            await f.workspace.locator('[data-billing-summary]').innerText(),
            /Free/
          )
          assert.doesNotMatch(
            await f.workspace.locator('[data-billing-summary]').innerText(),
            /3,240/
          )
        }
        if (name === 'checkout-canceled')
          await f.workspace
            .locator('[data-billing-notice="canceled"]')
            .waitFor()
        if (
          mobile &&
          ![
            'loading',
            'load-error',
            'plans',
            'invoices',
            'billing-details'
          ].includes(name)
        ) {
          const actions = f.workspace.locator('[data-billing-summary-actions]')
          const bounds = await actions.boundingBox()
          for (const button of await actions.getByRole('button').all()) {
            if (!(await button.isVisible())) continue
            const control = await button.boundingBox()
            assert.ok(
              control.width >= bounds.width - 2,
              `${name}: mobile summary actions fill their column`
            )
          }
        }
        if (mobile && name === 'plans') {
          for (const radio of await f.workspace
            .locator('[data-billing-plan] input')
            .all()) {
            const bounds = await radio.boundingBox()
            assert.ok(
              Math.abs(bounds.width - bounds.height) < 1,
              'Plan radio controls stay circular instead of inheriting tall text input geometry'
            )
          }
        }
        await capture(f, `${prefix}-${name}`)
        assert.equal(
          f.calls.checkout.length + f.calls.portal.length,
          0,
          'Reference navigation/plan selection never creates hosted billing actions'
        )
      } finally {
        await f.close()
      }
    }
  }
  console.log(
    'All 22 desktop/mobile reference states captured with synthetic API data'
  )
}

async function planRulesAndHostedActions() {
  const f = await fixture(billing(), {
    plans: { creator: plans.creator, pro: plans.pro },
    holdHosted: true
  })
  try {
    await f.open()
    await openPlans(f)
    assert.equal(
      await f.workspace
        .locator(
          '[data-billing-plan="free"] input, [data-billing-plan="free"][role="radio"]'
        )
        .isDisabled(),
      true
    )
    assert.equal(
      await f.workspace
        .locator(
          '[data-billing-plan="agency"] input, [data-billing-plan="agency"][role="radio"]'
        )
        .isDisabled(),
      true
    )
    await choose(f, 'creator')
    assert.equal(f.calls.checkout.length, 0)
    await continueButton(f).click()
    await continueButton(f).waitFor()
    assert.equal(await continueButton(f).isDisabled(), true)
    await f.page.waitForFunction(
      () =>
        document
          .querySelector('[data-billing-continue] button')
          ?.getAttribute('aria-busy') === 'true'
    )
    assert.equal(f.calls.checkout.length, 1)
    f.releaseHosted()
    await f.page
      .getByRole('alert')
      .filter({ hasText: /Could not start checkout/ })
      .waitFor()
    assert.equal(new URL(f.page.url()).origin, origin)
    assert.equal(await continueButton(f).isEnabled(), true)
  } finally {
    await f.close()
  }

  const p = await fixture(active(), { holdHosted: true })
  try {
    await p.open()
    await rememberShell(p.page)
    await openPlans(p)
    await choose(p, 'agency')
    assert.equal(p.calls.portal.length, 0)
    assert.equal(
      await p.workspace
        .locator(
          '[data-billing-plan="pro"] input, [data-billing-plan="pro"][role="radio"]'
        )
        .isDisabled(),
      true
    )
    await continueButton(p).click()
    await p.page.waitForFunction(
      () =>
        document
          .querySelector('[data-billing-continue] button')
          ?.getAttribute('aria-busy') === 'true'
    )
    assert.equal(p.calls.portal.length, 1)
    assert.equal(p.calls.checkout.length, 0)
    assert.equal(await continueButton(p).isDisabled(), true)
    await p.workspace
      .locator('[data-billing-continue]')
      .getByRole('button', { name: 'Cancel', exact: true })
      .click()
    assert.equal(
      await p.page
        .getByRole('button', { name: 'Manage billing', exact: true })
        .isDisabled(),
      true,
      'The portal action lock is shared between plan selection and overview controls'
    )
    await openPlans(p)
    assert.equal(
      await p.workspace
        .locator('[data-billing-plan="agency"] input')
        .isChecked(),
      true,
      'Returning to the local plan picker preserves its selection while a hosted action runs'
    )
    p.releaseHosted()
    await p.page
      .getByRole('alert')
      .filter({ hasText: /Could not open the billing/ })
      .waitFor()
    await assertShell(p.page)
  } finally {
    await p.close()
  }

  for (const [response, valid] of [
    [
      {
        kind: 'portal',
        url: 'https://billing.stripe.com/p/session/synthetic_existing'
      },
      true
    ],
    [
      {
        kind: 'checkout',
        url: 'https://checkout.stripe.com/c/pay/cs_test_synthetic'
      },
      true
    ],
    [
      {
        kind: 'unknown',
        url: 'https://checkout.stripe.com/c/pay/cs_test_synthetic'
      },
      false
    ],
    [
      {
        kind: 'portal',
        url: 'https://checkout.stripe.com/c/pay/cs_test_synthetic'
      },
      false
    ],
    [
      {
        kind: 'checkout',
        url: 'https://checkout.stripe.com.attacker.invalid/c/pay'
      },
      false
    ]
  ]) {
    const h = await fixture(billing(), { hostedResponse: response })
    try {
      await h.context.route('https://billing.stripe.com/**', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<main>Synthetic hosted billing destination</main>'
        })
      )
      await h.context.route('https://checkout.stripe.com/**', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<main>Synthetic hosted billing destination</main>'
        })
      )
      await h.open()
      await openPlans(h)
      await choose(h, 'creator')
      await continueButton(h).click()
      if (valid) {
        await h.page.waitForURL(response.url)
        await h.page
          .getByText('Synthetic hosted billing destination', { exact: true })
          .waitFor()
      } else {
        await h.page
          .getByRole('alert')
          .filter({ hasText: /Could not start checkout/ })
          .waitFor()
        assert.equal(new URL(h.page.url()).origin, origin)
      }
    } finally {
      await h.close()
    }
  }
  console.log(
    'Local selection, configured/current rules, hosted concurrency and validated destinations passed'
  )
}

async function invoicesAndRecovery() {
  const unsafe = {
    ...active(),
    invoices: [
      {
        ...invoices[0],
        hostedUrl: 'javascript:alert(1)',
        pdfUrl: 'http://example.invalid/invoice.pdf'
      },
      {
        ...invoices[1],
        hostedUrl: 'https://invoice.stripe.com/i/synthetic_safe',
        pdfUrl: 'data:application/pdf;base64,AA=='
      }
    ]
  }
  const f = await fixture(unsafe)
  try {
    await f.open()
    const section = f.workspace.locator('[data-billing-invoices]')
    const links = await section
      .locator('a')
      .evaluateAll((nodes) => nodes.map((node) => node.href))
    assert.deepEqual(links, ['https://invoice.stripe.com/i/synthetic_safe'])
    await f.workspace.locator('[data-billing-refresh]').click()
    await f.page.waitForFunction(
      () => !document.querySelector('[data-billing-refresh]')?.disabled
    )
    f.setFailures({ billing: true, reconcile: true })
    await f.workspace.locator('[data-billing-refresh]').click()
    await f.workspace.locator('[data-billing-notice="refresh-error"]').waitFor()
    assert.match(
      await f.workspace.locator('[data-billing-summary]').innerText(),
      /3,240/
    )
    assert.equal(
      (await section.locator('[data-billing-invoice]').count()) > 0,
      true,
      'Refresh failure preserves confirmed invoice rows'
    )
    f.setFailures({ billing: false, reconcile: false })
    await f.workspace.locator('[data-billing-refresh]').click()
    await f.workspace
      .locator('[data-billing-notice="refresh-error"]')
      .waitFor({ state: 'detached' })
  } finally {
    await f.close()
  }
  const outage = await fixture(
    { ...active(), providerAvailable: false },
    { reconcileFailure: true }
  )
  try {
    await outage.open()
    await rememberShell(outage.page)
    await outage.page
      .getByRole('button', { name: 'Retry', exact: true })
      .click()
    await outage.workspace
      .locator('[data-billing-notice="refresh-error"]')
      .waitFor()
    assert.match(
      await outage.workspace.locator('[data-billing-summary]').innerText(),
      /3,240/
    )
    await assertShell(outage.page)
    await capture(outage, 'desktop-provider-unavailable')
  } finally {
    await outage.close()
  }
  const retry = await fixture(billing(), { initialFailure: true })
  try {
    await retry.open('', { wait: false })
    await retry.workspace.locator('[data-billing-initial="error"]').waitFor()
    retry.setFailures({ billing: false })
    await retry.page
      .getByRole('button', { name: 'Try again', exact: true })
      .click()
    await retry.workspace.locator('[data-billing-summary]').waitFor()
  } finally {
    await retry.close()
  }
  console.log(
    'Invoice links only valid HTTPS; initial and refresh retries preserve truthful confirmed data'
  )
}

async function checkoutReturns() {
  const complete = {
    ...active(),
    checkoutVerification: { status: 'complete', planId: 'pro' }
  }
  const c = await fixture(pending(), { reconciled: complete })
  try {
    await c.open('?checkout_session_id=cs_test_synthetic_complete')
    await c.workspace.locator('[data-billing-notice="complete"]').waitFor()
    assert.match(
      await c.workspace.locator('[data-billing-summary]').innerText(),
      /Pro/
    )
    assert.ok(
      c.calls.auth >= 2,
      'Confirmed changed plan refreshes authenticated account'
    )
    assert.equal(c.calls.reconcile, 1)
  } finally {
    await c.close()
  }
  for (const status of ['invalid', 'unavailable']) {
    const f = await fixture(
      billing({
        account: { credits: 1000, plan: 'free', hasBillingProfile: true },
        checkoutVerification: {
          status,
          planId: status === 'invalid' ? null : 'pro'
        }
      })
    )
    try {
      await f.open(`?checkout_session_id=cs_test_synthetic_${status}`)
      await f.workspace.locator(`[data-billing-notice="${status}"]`).waitFor()
      assert.match(
        await f.workspace.locator('[data-billing-summary]').innerText(),
        /Free/
      )
      await capture(f, `desktop-checkout-${status}`)
    } finally {
      await f.close()
    }
  }
  const d = await fixture(pending(), { failAfterInitial: true })
  try {
    await d.page.clock.install()
    await d.open('?checkout_session_id=cs_test_synthetic_delayed')
    for (let attempt = 1; attempt < 10; attempt += 1) {
      await d.page.clock.runFor(4500)
      const deadline = Date.now() + 5000
      while (d.calls.reads < attempt + 1 && Date.now() < deadline)
        await delay(25)
      assert.equal(d.calls.reads, attempt + 1)
      await delay(100)
    }
    await d.workspace.locator('[data-billing-notice="delayed"]').waitFor()
    await d.page.clock.runFor(30000)
    await delay(100)
    assert.equal(d.calls.reads, 10)
    assert.equal(d.calls.reconcile, 10)
    assert.match(
      await d.workspace.locator('[data-billing-summary]').innerText(),
      /Free/
    )
    await capture(d, 'desktop-checkout-delayed')
  } finally {
    await d.close()
  }
  const p = await fixture(active(), { reconciled: scheduled() })
  try {
    await p.open('?portal_return=true')
    await p.workspace.locator('[data-billing-notice="cancellation"]').waitFor()
    assert.equal(p.calls.reconcile, 1)
    assert.doesNotMatch(await p.workspace.innerText(), /Renews/)
  } finally {
    await p.close()
  }
  console.log(
    'Complete/pending/invalid/unavailable/delayed return states and bounded recovery polling passed'
  )
}

async function additionalStates() {
  const terminal = await fixture({
    ...billing(),
    account: { credits: 1000, plan: 'free', hasBillingProfile: true },
    subscription: {
      status: 'canceled',
      currentPeriodEnd: '2026-10-01T00:00:00Z',
      cancelAtPeriodEnd: true
    }
  })
  try {
    await terminal.open()
    await openPlans(terminal)
    await choose(terminal, 'creator')
    assert.equal(
      await continueButton(terminal).isEnabled(),
      true,
      'An ended cancellation can start a configured higher plan'
    )
    assert.equal(
      terminal.calls.checkout.length + terminal.calls.portal.length,
      0
    )
    await continueButton(terminal).click()
    await terminal.page
      .getByRole('alert')
      .filter({ hasText: /Could not start checkout/ })
      .waitFor()
    assert.equal(terminal.calls.checkout.length, 1)
    assert.equal(terminal.calls.portal.length, 0)
  } finally {
    await terminal.close()
  }
  for (const status of ['paused', 'canceled', 'incomplete', 'unpaid']) {
    const f = await fixture({
      ...pastDue(),
      subscription: { ...active().subscription, status }
    })
    try {
      await f.open()
      assert.doesNotMatch(await f.workspace.innerText(), /Renews/)
      if (status === 'paused')
        await f.workspace.locator('[data-billing-notice="paused"]').waitFor()
    } finally {
      await f.close()
    }
  }
  const unconfirmed = await fixture({
    ...active(),
    account: { credits: 3240, plan: 'free', hasBillingProfile: true }
  })
  try {
    await unconfirmed.open()
    await unconfirmed.workspace
      .locator('[data-billing-notice="unconfirmed"]')
      .waitFor()
    assert.doesNotMatch(await unconfirmed.workspace.innerText(), /Renews/)
  } finally {
    await unconfirmed.close()
  }
  const a = await fixture(
    billing({
      account: {
        credits: 3240,
        plan: 'agency',
        hasBillingProfile: false,
        creditsUnlimited: true
      }
    }),
    { admin: true }
  )
  try {
    await a.open()
    assert.match(
      await a.workspace.locator('[data-billing-summary]').innerText(),
      /∞/
    )
    assert.equal(
      await a.page
        .getByRole('button', { name: /^(Change plan|Choose plan)$/ })
        .count(),
      0
    )
    await capture(a, 'desktop-admin')
  } finally {
    await a.close()
  }
  const finite = await fixture({
    ...active(),
    account: {
      credits: 20000,
      plan: 'agency',
      hasBillingProfile: true,
      creditsUnlimited: false
    }
  })
  try {
    await finite.open()
    assert.match(
      await finite.workspace.locator('[data-billing-summary]').innerText(),
      /20,000/
    )
    assert.doesNotMatch(await finite.workspace.innerText(), /∞/)
  } finally {
    await finite.close()
  }
  const adminPastDue = await fixture(
    { ...pastDue(), account: { ...pastDue().account, creditsUnlimited: true } },
    { admin: true }
  )
  try {
    await adminPastDue.open()
    assert.match(
      await adminPastDue.workspace
        .locator('[data-billing-summary]')
        .innerText(),
      /∞/
    )
    assert.equal(
      await adminPastDue.workspace
        .locator('[data-billing-notice="payment"]')
        .count(),
      0,
      'An administrator keeps authoritative unlimited access despite a financial subscription issue'
    )
    assert.equal(
      await adminPastDue.page
        .getByRole('button', { name: /^(Change plan|Choose plan)$/ })
        .count(),
      0
    )
  } finally {
    await adminPastDue.close()
  }
  for (const locale of ['en', 'ro']) {
    const f = await fixture(
      { ...active(), mode: 'test' },
      { viewport: { width: 390, height: 844 }, locale }
    )
    try {
      await f.open()
      const notice = f.page.locator(
        '[aria-labelledby="billing-test-mode-title"]'
      )
      await notice.waitFor()
      assert.match(
        await notice.innerText(),
        locale === 'ro'
          ? /nu se fac încasări reale/
          : /no real charges are made/
      )
      assert.ok(
        (await notice.boundingBox()).y < 844,
        'Test mode warning is visible at mobile entry'
      )
      await capture(f, `mobile-test-mode-${locale}`)
    } finally {
      await f.close()
    }
  }
  for (const [name, viewport, light] of [
    ['mobile-320', { width: 320, height: 740 }, false],
    ['tablet', { width: 900, height: 1100 }, false],
    ['desktop-light', { width: 1488, height: 1058 }, true]
  ]) {
    const f = await fixture(active(), { viewport, light })
    try {
      await f.open()
      await capture(f, name)
      await openPlans(f)
      await capture(f, `${name}-plans`)
    } finally {
      await f.close()
    }
  }
  console.log(
    'Administrator, finite Agency, test mode EN/RO, paused/payment and responsive light/320px/tablet states passed'
  )
}

async function shellAndFastRefresh() {
  const f = await fixture(active())
  try {
    await f.open()
    const sidebarToggle = f.page
      .locator('[data-sidebar="trigger"]')
      .filter({ visible: true })
      .first()
    await sidebarToggle.click()
    await rememberShell(f.page)
    await openPlans(f)
    await choose(f, 'agency')
    await assertShell(f.page)
    if (process.env.RUN_FAST_REFRESH === '1') {
      const sourcePath = new URL(
        '../src/components/billing/plan-selector.tsx',
        import.meta.url
      )
      const source = await readFile(sourcePath)
      const metadata = await stat(sourcePath)
      const text = source.toString('utf8'),
        anchor = 'data-billing-plans',
        marker = 'data-billing-refresh-probe="updated" data-billing-plans'
      assert.equal(text.split(anchor).length, 2, 'HMR probe anchor unique')
      const reads = f.calls.reads
      try {
        await writeFile(sourcePath, text.replace(anchor, marker))
        await f.page.locator('[data-billing-refresh-probe="updated"]').waitFor()
        await assertShell(f.page)
        assert.equal(await f.workspace.getAttribute('data-view'), 'plans')
        assert.equal(
          await f.workspace
            .locator('[data-billing-plan="agency"] input')
            .isChecked(),
          true
        )
        assert.equal(
          f.calls.reads,
          reads,
          'Component Fast Refresh does not refetch or reload billing'
        )
      } finally {
        try {
          await writeFile(sourcePath, source)
          await f.page
            .locator('[data-billing-refresh-probe]')
            .waitFor({ state: 'detached' })
          assert.deepEqual(await readFile(sourcePath), source)
        } finally {
          await utimes(sourcePath, metadata.atime, metadata.mtime)
        }
      }
      await assertShell(f.page)
      fastRefreshVerified = true
    } else
      console.log(
        'SKIPPED Fast Refresh source probe; set RUN_FAST_REFRESH=1 once concurrent builds finish'
      )
    await f.workspace.locator('[data-billing-back]').click()
    await assertShell(f.page)
    await f.page
      .locator('[data-slot="sidebar"] a[href="/dashboard/publish"]')
      .filter({ visible: true })
      .first()
      .click()
    await f.page.waitForURL('**/dashboard/publish')
    await assertShell(f.page)
    await f.page
      .locator('[data-slot="sidebar"] a[href="/dashboard/billing"]')
      .filter({ visible: true })
      .first()
      .click()
    await f.workspace.locator('[data-billing-summary]').waitFor()
    await assertShell(f.page)
  } finally {
    await f.close()
  }
  console.log(
    'Dashboard/sidebar/header/main DOM identity and sidebar state preserved through local and route navigation'
  )
}

try {
  await mkdir(output, { recursive: true })
  if (process.env.SKIP_REFERENCE !== '1') await referenceStates()
  await planRulesAndHostedActions()
  await invoicesAndRecovery()
  await checkoutReturns()
  await additionalStates()
  await shellAndFastRefresh()
  assert.deepEqual(runtimeErrors, [])
  assert.deepEqual(blockedMutations, [])
  await writeFile(
    new URL('summary.json', output),
    JSON.stringify(
      {
        screenshots: reports,
        fastRefreshVerified,
        runtimeErrors,
        blockedMutations,
        fixtureOnly: true
      },
      null,
      2
    )
  )
  console.log(
    `All synthetic Billing redesign browser checks passed; ${reports.length} captures; Fast Refresh=${fastRefreshVerified}`
  )
} finally {
  await browser.close()
}
