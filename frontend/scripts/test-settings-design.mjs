// Run against a local frontend. Every API request uses synthetic data.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const base = process.env.SNEEPCUT_UI_ORIGIN ?? 'http://localhost:3001'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const output = new URL('../test-results/settings-design/', import.meta.url)
await mkdir(output, { recursive: true })
const inspect = process.argv.includes('--inspect')
const locales = (process.env.SNEEPCUT_UI_LOCALES ?? 'ro,en').split(',')
assert.ok(locales.every((locale) => ['ro', 'en'].includes(locale)))
const browser = await chromium.launch({ headless: true })

try {
  for (const locale of locales) {
    const messages = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'))
    const t = messages.settings
    const user = { id: '33333333-3333-4333-8333-333333333333', name: 'Alex Preview', email: 'preview@example.invalid', credits: 100, plan: 'free', access_role: 'member' }
    const profile = { ...user, image: null, provider: 'credentials', canChangePassword: true, recentlyAuthenticated: true, emailVerified: '2026-09-01T10:00:00Z', createdAt: '2026-09-01T10:00:00Z' }
    const settings = {
      preferences: { locale, theme: 'light', timezone: 'Europe/Bucharest', defaultAspectRatio: '9:16', defaultClipCount: 5, emailSecurity: true, emailProduct: false, emailMarketing: false, inAppProcessing: true, inAppPublishing: true },
      sessions: [{ id: 'preview-session', device: 'Chrome / Windows', createdAt: '2026-09-01T10:00:00Z', lastSeenAt: '2026-09-12T10:00:00Z', expiresAt: '2026-10-01T10:00:00Z', current: true }],
      mfa: { enabled: false }, securityEvents: [], exports: []
    }
    const mutations = []
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
    await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: base }])
    await context.addInitScript(() => localStorage.setItem('theme', 'light'))
    await context.route(/\/(?:api|v1)\//, async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (request.method() !== 'GET' && path !== '/v1/auth/refresh') mutations.push({ path, method: request.method(), body: request.postDataJSON() })
      if (path === '/v1/auth/refresh') return route.fulfill({ json: { access_token: 'synthetic', user } })
      if (path === '/api/user/profile') {
        if (request.method() === 'PATCH') Object.assign(profile, request.postDataJSON())
        return route.fulfill({ json: { profile } })
      }
      if (path === '/api/user/settings') return route.fulfill({ json: settings })
      if (path === '/api/user/preferences') {
        Object.assign(settings.preferences, request.postDataJSON())
        return route.fulfill({ json: { preferences: settings.preferences } })
      }
      if (path === '/api/publishing') return route.fulfill({ json: {
        accounts: [], posts: [], providers: [
          { id: 'instagram', name: 'Instagram', configured: false },
          { id: 'facebook', name: 'Facebook', configured: false },
          { id: 'tiktok', name: 'TikTok', configured: false }
        ]
      } })
      if (path === '/api/user/brand') return route.fulfill({ json: { brandKit: {}, plan: 'free' } })
      if (path === '/api/user/credits') return route.fulfill({ json: { credits: 100, plan: 'free' } })
      if (path === '/api/assistant/history') return route.fulfill({ json: { messages: [] } })
      return route.abort()
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const routeUrl = (name) => `${base}${locale === 'ro' ? '/ro' : ''}/dashboard/${name}`
    const measurements = {}
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      measurements[width] = {}
      for (const name of ['brand', 'create', 'settings']) {
        console.log(`Checking ${locale} ${name} at ${width}px`)
        await page.goto(routeUrl(name), { waitUntil: 'networkidle', timeout: 120000 })
        const header = page.locator('.studio-workbench-header')
        await header.waitFor({ timeout: 60000 })
        await page.evaluate(() => document.fonts.ready)
        const box = await header.boundingBox()
        measurements[width][name] = box
        if (!inspect) assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflows at ${width}`)
        if (name === 'settings') {
          await page.locator('#settings-theme').waitFor()
          await page.screenshot({ path: new URL(`${locale}-${width}.png`, output).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), fullPage: width === 390 })
          if (!inspect) {
            const brand = measurements[width].brand
            assert.ok(Math.abs(box.x - brand.x) < 1 && Math.abs(box.width - brand.width) < 1, `Settings hero must match Brand width at ${width}`)
            assert.ok(Math.abs(box.height - brand.height) < 1, `Settings hero must match Brand height at ${width}`)
            if (width >= 768) assert.ok(Math.abs(box.height - measurements[width].create.height) < 1, `Settings hero must match Create height at ${width}`)
            const cards = await page.locator('.account-content [data-slot="card"]').evaluateAll((nodes) => nodes.map((node) => {
              const style = getComputedStyle(node)
              return { radius: style.borderRadius, border: style.borderTopWidth, expected: getComputedStyle(document.documentElement).getPropertyValue('--radius-md').trim() }
            }))
            assert.ok(cards.every((card) => card.radius !== '0px' && card.border === '1px'), 'Settings cards retain shared radius and borders')
          }
        }
      }
    }
    console.log(`${locale} hero measurements: ${JSON.stringify(measurements)}`)
    if (inspect) { await context.close(); continue }

    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(routeUrl('settings'), { waitUntil: 'networkidle' })
    const saveProfile = page.getByRole('button', { name: t.saveProfile, exact: true })
    assert.equal(await saveProfile.isDisabled(), true)
    await page.getByLabel(t.displayName, { exact: true }).fill('Updated Preview')
    await saveProfile.click()
    await page.getByText(t.profileSaved, { exact: true }).waitFor()
    assert.equal(profile.name, 'Updated Preview')

    const nav = page.getByRole('navigation', { name: t.sectionNav })
    await nav.getByRole('link', { name: t.notifications, exact: true }).click()
    await page.getByRole('switch', { name: t.productEmails, exact: true }).click()
    assert.equal(await page.getByRole('switch', { name: t.productEmails, exact: true }).getAttribute('aria-checked'), 'true')
    await nav.getByRole('link', { name: t.preferences, exact: true }).click()
    await page.getByRole('combobox', { name: t.defaultAspectRatio, exact: true }).click()
    await page.getByRole('option', { name: '1:1', exact: true }).click()
    await page.getByRole('combobox', { name: t.timezone, exact: true }).click()
    await page.getByRole('option', { name: 'UTC', exact: true }).click()
    await page.getByRole('button', { name: t.savePreferences, exact: true }).click()
    await page.getByText(t.settingsSaved, { exact: true }).waitFor()
    assert.equal(settings.preferences.emailProduct, true)
    assert.equal(settings.preferences.defaultAspectRatio, '1:1')
    assert.equal(settings.preferences.timezone, 'UTC')

    const theme = page.getByRole('combobox', { name: t.theme, exact: true })
    await theme.click()
    await page.getByRole('option', { name: t.themeDark, exact: true }).click()
    await page.getByRole('button', { name: t.savePreferences, exact: true }).click()
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: new URL(`${locale}-dark.png`, output).pathname.replace(/^\/(?=[A-Za-z]:)/, '') })
    await theme.click()
    await page.getByRole('option', { name: t.themeLight, exact: true }).click()
    await page.getByRole('button', { name: t.savePreferences, exact: true }).click()
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'))

    await page.getByRole('button', { name: t.deleteAccount, exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    assert.equal(await dialog.getByRole('button', { name: t.deletePermanently, exact: true }).isDisabled(), true)
    await dialog.getByRole('button', { name: t.cancel, exact: true }).click()
    assert.equal(await dialog.isVisible(), false)
    assert.equal(mutations.some(({ method }) => method === 'DELETE'), false)
    assert.deepEqual(errors, [])
    await context.close()
    console.log(`PASS ${locale}: matching heroes, responsive cards, profile save, switches, selects, preference persistence, light/dark theme and delete cancellation`)
  }
} finally {
  await browser.close()
}
