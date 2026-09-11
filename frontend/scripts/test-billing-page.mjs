// Focused billing UI check. All account and Stripe responses are synthetic.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
)
const base = process.env.SNEEPCUT_UI_ORIGIN ?? 'http://localhost:3010'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const output = 'test-results/billing'
await mkdir(output, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.PLAYWRIGHT_EXECUTABLE_PATH ??
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
})
try {
  for (const fixture of [
    { locale: 'en', width: 1440, dark: false },
    { locale: 'ro', width: 390, dark: true }
  ]) {
    const messages = JSON.parse(
      await readFile(
        new URL(`../messages/${fixture.locale}.json`, import.meta.url),
        'utf8'
      )
    )
    const user = {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Billing Preview',
      email: 'billing-preview@example.invalid',
      credits: 126,
      plan: 'pro',
      access_role: 'member'
    }
    const context = await browser.newContext({
      viewport: { width: fixture.width, height: 1000 },
      reducedMotion: 'reduce'
    })
    await context.addInitScript((dark) => {
      localStorage.setItem('theme', dark ? 'dark' : 'light')
    }, fixture.dark)
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: fixture.locale, url: base }
    ])
    const unexpected = []
    await context.route(/\/(?:api|v1)\//, async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/v1/auth/refresh') {
        return route.fulfill({
          json: { access_token: 'synthetic', user }
        })
      }
      if (path === '/api/stripe/plans') {
        return route.fulfill({
          json: {
            creator: { amount: 1900, currency: 'USD' },
            pro: { amount: 4900, currency: 'USD' },
            agency: { amount: 9900, currency: 'USD' }
          }
        })
      }
      if (path === '/api/stripe/billing') {
        return route.fulfill({
          json: {
            account: {
              credits: 126,
              plan: 'pro',
              hasBillingProfile: true
            },
            subscription: {
              status: 'active',
              cancelAtPeriodEnd: false,
              currentPeriodEnd: '2026-10-11T00:00:00Z'
            },
            invoices: [
              {
                id: 'in_synthetic',
                number: 'INV-2026-001',
                status: 'paid',
                createdAt: '2026-09-11T00:00:00Z',
                amount: 4900,
                currency: 'usd',
                hostedUrl: 'https://invoice.stripe.com/i/synthetic',
                pdfUrl: 'https://invoice.stripe.com/i/synthetic.pdf'
              }
            ],
            providerAvailable: true,
            checkoutVerification: null
          }
        })
      }
      unexpected.push(path)
      return route.abort()
    })

    const page = await context.newPage()
    page.setDefaultNavigationTimeout(120000)
    page.setDefaultTimeout(60000)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const prefix = fixture.locale === 'ro' ? '/ro' : ''
    let response = await page.goto(
      `${base}${prefix}/dashboard/settings?tab=billing`,
      {
        waitUntil: 'domcontentloaded'
      }
    )
    if (response?.status() === 404) {
      response = await page.reload({ waitUntil: 'domcontentloaded' })
    }
    assert.equal(response?.status(), 200, 'billing route responds successfully')
    await page
      .getByRole('heading', { name: messages.billing.title, exact: true })
      .waitFor()

    assert.equal(
      await page.getByText('126', { exact: true }).count(),
      1,
      'credit balance is prominent once'
    )
    assert.equal(
      await page.getByText(/12 .*clip/i).count(),
      1,
      'credit runway is visible'
    )
    await page
      .getByRole('heading', { name: messages.billing.guide.title })
      .waitFor()
    await page
      .getByText('INV-2026-001', { exact: true })
      .filter({ visible: true })
      .waitFor()
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true,
      'billing page has no horizontal overflow'
    )
    assert.deepEqual(unexpected, [])
    assert.deepEqual(errors, [])
    await page.screenshot({
      path: `${output}/${fixture.locale}-${fixture.width}.png`,
      fullPage: true
    })
    await context.close()
  }
  console.info(
    'PASS billing: desktop/mobile, EN/RO, active plan, runway and invoices'
  )
} finally {
  await browser.close()
}
