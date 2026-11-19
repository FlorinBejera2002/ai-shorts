import assert from 'node:assert/strict'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Start Vite separately. A stateful in-page fake of the account, settings, MFA, sessions,
// export and publishing APIs backs every read and mutation; no real database is touched.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const output = new URL('../test-results/settings-layout/', import.meta.url)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const runtimeErrors = [],
  unexpected = [],
  reports = []
const DAY = 86_400_000
const identity = {
  id: '00000000-0000-4000-8000-000000003001',
  email: 'ana@example.invalid',
  name: 'Ana Creator',
  profile_pic: null,
  credits: 360,
  plan: 'pro',
  access_role: 'member'
}
const ACCOUNT = {
  instagram: '00000000-0000-4000-8000-000000003101',
  facebook: '00000000-0000-4000-8000-000000003102',
  tiktok: '00000000-0000-4000-8000-000000003103'
}
const SESSION = { current: '00000000-0000-4000-8000-000000003201', phone: '00000000-0000-4000-8000-000000003202' }

function initialState(options) {
  const now = Date.now()
  return {
    profile: {
      id: identity.id,
      name: 'Ana Creator',
      email: identity.email,
      image: null,
      provider: 'credentials',
      canChangePassword: true,
      recentlyAuthenticated: true,
      emailVerified: options.unverified ? null : '2026-10-14T09:00:00Z',
      createdAt: '2026-10-14T09:00:00Z'
    },
    preferences: {
      locale: options.ro ? 'ro' : 'en',
      theme: 'system',
      timezone: 'Europe/Bucharest',
      defaultAspectRatio: '9:16',
      defaultClipCount: 5,
      emailSecurity: true,
      emailProduct: true,
      emailMarketing: false,
      inAppProcessing: true,
      inAppPublishing: true
    },
    mfa: { enabled: false },
    sessions: [
      { id: SESSION.current, device: 'Chrome on Windows', createdAt: '2026-11-01T09:00:00Z', lastSeenAt: new Date(now).toISOString(), expiresAt: '2026-12-01T09:00:00Z', current: true },
      { id: SESSION.phone, device: 'Safari on iOS', createdAt: '2026-11-02T09:00:00Z', lastSeenAt: new Date(now - 2 * 3_600_000).toISOString(), expiresAt: '2026-12-02T09:00:00Z', current: false }
    ],
    exports: [
      { id: '00000000-0000-4000-8000-000000003301', status: 'processing', requestedAt: '2026-11-18T07:05:00Z' },
      { id: '00000000-0000-4000-8000-000000003302', status: 'completed', requestedAt: '2026-10-12T11:20:00Z', completedAt: '2026-10-12T11:21:00Z' }
    ],
    accounts: [
      { id: ACCOUNT.instagram, provider: 'instagram', name: 'Ana Creator', username: 'ana.creator', status: 'connected', tokenExpiresAt: new Date(now + 54 * DAY).toISOString(), tokenExpired: false },
      { id: ACCOUNT.facebook, provider: 'facebook', name: 'Pagina Ana Creator', status: 'connected', tokenExpiresAt: new Date(now + 54 * DAY).toISOString(), tokenExpired: false },
      { id: ACCOUNT.tiktok, provider: 'tiktok', name: 'Ana', username: 'ana.creator', status: 'connected', tokenExpiresAt: new Date(now + 15 * DAY - 3_600_000).toISOString(), tokenExpired: false }
    ]
  }
}

const href = (section, ro) => `${ro ? '/ro' : ''}/dashboard/settings${section ? `?section=${section}` : ''}`
const providers = ['instagram', 'facebook', 'tiktok', 'youtube'].map((id) => ({
  id,
  name: { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' }[id],
  configured: true,
  supportsPublishing: true
}))

async function fixture(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 900 },
    timezoneId: 'Europe/Bucharest',
    colorScheme: options.dark ? 'dark' : 'light',
    reducedMotion: 'reduce',
    acceptDownloads: true
  })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  // A cold Vite transform of the dashboard can take minutes while other dev servers run.
  page.setDefaultNavigationTimeout(300000)
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text())) runtimeErrors.push(message.text())
  })
  const state = initialState(options)
  const calls = []
  await context.route('https://oauth.example.invalid/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>Synthetic OAuth</p>' }))
  await context.route('**/v1/**', (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    if (path === '/v1/auth/refresh') return route.fulfill({ json: { access_token: 'synthetic-settings-token', user: identity } })
    if (path === '/v1/auth/logout' || path === '/v1/auth/resend-activation') {
      calls.push(`${request.method()} ${path}${request.postData() ? ` ${request.postData()}` : ''}`)
      return route.fulfill({ json: { ok: true } })
    }
    unexpected.push(`${request.method()} ${path}`)
    return route.fulfill({ status: 405, json: {} })
  })
  await context.route('**/api/**', async (route) => {
    const request = route.request(),
      method = request.method(),
      path = new URL(request.url()).pathname,
      body = request.postData() ? JSON.parse(request.postData()) : null
    const settings = () => ({ preferences: state.preferences, sessions: state.sessions, mfa: state.mfa, securityEvents: [], exports: state.exports })
    if (method !== 'GET' || path === '/api/user/data') calls.push(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ''}`)
    let match
    if (method === 'GET' && path === '/api/user/profile') return route.fulfill({ json: { profile: state.profile } })
    if (method === 'PATCH' && path === '/api/user/profile') {
      state.profile = { ...state.profile, name: body.name }
      return route.fulfill({ json: { profile: state.profile } })
    }
    if (method === 'GET' && path === '/api/user/settings') return route.fulfill({ json: settings() })
    if (method === 'PUT' && path === '/api/user/preferences') {
      state.preferences = { ...body }
      return route.fulfill({ json: { preferences: state.preferences } })
    }
    if (method === 'POST' && path === '/api/user/password') return route.fulfill({ json: { changed: true } })
    if (method === 'POST' && path === '/api/user/mfa/setup')
      return route.fulfill({
        json: { setup: { secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', provisionerUri: 'otpauth://totp/Sneepcut%3Aana%40example.invalid?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Sneepcut&algorithm=SHA1&digits=6&period=30' } }
      })
    if (method === 'POST' && path === '/api/user/mfa/enable') {
      if (body.code !== '123456') return route.fulfill({ status: 400, json: { error: 'Invalid verification code' } })
      state.mfa = { enabled: true }
      return route.fulfill({ json: { enabled: true, recoveryCodes: ['ab12-cd34', 'ef56-gh78', 'ij90-kl12', 'mn34-op56'] } })
    }
    if (method === 'POST' && path === '/api/user/mfa/recovery-codes') return route.fulfill({ json: { recoveryCodes: ['new1-code', 'new2-code'] } })
    if (method === 'POST' && path === '/api/user/mfa/disable') {
      state.mfa = { enabled: false }
      return route.fulfill({ json: { enabled: false } })
    }
    if (method === 'DELETE' && (match = path.match(/^\/api\/user\/sessions\/([0-9a-f-]{36})$/))) {
      state.sessions = state.sessions.filter((session) => session.id !== match[1])
      return route.fulfill({ json: { revoked: true } })
    }
    if (method === 'POST' && path === '/api/user/sessions/revoke-others') {
      state.sessions = state.sessions.filter((session) => session.current)
      return route.fulfill({ json: { revoked: true } })
    }
    if (method === 'GET' && path === '/api/user/data') {
      state.exports = [{ id: '00000000-0000-4000-8000-000000003399', status: 'completed', requestedAt: new Date().toISOString() }, ...state.exports]
      return route.fulfill({ json: { format: 'Sneepcut GDPR data export', data: { profile: state.profile } } })
    }
    if (method === 'DELETE' && path === '/api/user/data') return route.fulfill({ json: { deleted: true } })
    if (method === 'GET' && path === '/api/publishing') return route.fulfill({ json: { providers, accounts: state.accounts, clips: [], posts: [] } })
    if (method === 'DELETE' && (match = path.match(/^\/api\/publishing\/accounts\/([0-9a-f-]{36})$/))) {
      state.accounts = state.accounts.filter((account) => account.id !== match[1])
      return route.fulfill({ json: { disconnected: true } })
    }
    if (method === 'POST' && (match = path.match(/^\/api\/publishing\/connect\/(\w+)$/))) return route.fulfill({ json: { url: `https://oauth.example.invalid/${match[1]}` } })
    if (method !== 'GET') {
      unexpected.push(`${method} ${path}`)
      return route.fulfill({ status: 405, json: {} })
    }
    const responses = {
      '/api/stripe/billing': {
        account: { credits: 360, plan: 'pro', hasBillingProfile: true },
        subscription: { status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: '2026-12-14T09:00:00Z' },
        invoices: [],
        providerAvailable: true,
        checkoutVerification: null
      },
      '/api/workspace-agent/runs': { runs: [], has_more: false },
      '/api/workspace-agent/suggestions': { suggestions: [], capabilities: [] }
    }
    return route.fulfill({ json: responses[path] || {} })
  })
  const root = page.locator('[data-settings-workspace]')
  return {
    page,
    context,
    state,
    calls,
    root,
    /** Full page load; use `go` afterwards so each step stays inside the loaded app. */
    async open(section = '', { ro = options.ro } = {}) {
      await page.goto(`${origin}${href(section, ro)}`, { waitUntil: 'domcontentloaded' })
      await root.waitFor({ timeout: 300000 })
    },
    /** Client-side navigation through the router, like a link click. */
    async go(section = '', { ro = options.ro } = {}) {
      await page.evaluate((url) => {
        history.pushState(null, '', url)
        dispatchEvent(new PopStateEvent('popstate'))
      }, href(section, ro))
      await root.waitFor()
    },
    close: () => context.close()
  }
}

async function until(check, message) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.fail(message)
}
async function called(f, pattern, message) {
  await until(() => f.calls.some((call) => pattern.test(call)), `${message} (calls: ${f.calls.join(' | ')})`)
}
async function noOverflow(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow`)
}
async function capture(f, name, fullPage = false) {
  await noOverflow(f.page, name)
  await f.page.waitForTimeout(150)
  await f.page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage })
  reports.push(name)
}
async function ready(f, selector) {
  await f.root.locator(selector).first().waitFor()
  await f.root.locator('[data-settings-state]').waitFor({ state: 'detached' }).catch(() => undefined)
}
async function rememberShell(page) {
  await page.evaluate(() => {
    window.settingsShellProbe = { shell: document.querySelector('#dashboard-shell'), main: document.querySelector('#dashboard-main'), workspace: document.querySelector('[data-settings-workspace]') }
  })
}
async function shellKept(page) {
  return page.evaluate(() => {
    const probe = window.settingsShellProbe
    return Boolean(probe && probe.shell === document.querySelector('#dashboard-shell') && probe.main === document.querySelector('#dashboard-main') && probe.workspace === document.querySelector('[data-settings-workspace]'))
  })
}
const background = (locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor)
const dialog = (f) => f.page.locator('[role="dialog"], [role="alertdialog"]').last()

// ---------------------------------------------------------------- canvas reference states
async function references() {
  const f = await fixture()
  const steel = 'rgb(142, 155, 176)'
  try {
    await f.open('account')
    for (const dark of [false, true]) {
      const mode = dark ? 'dark' : 'light'
      await f.page.emulateMedia({ colorScheme: mode })
      await until(() => f.page.evaluate((value) => document.documentElement.classList.contains(value), mode), `${mode} theme`)
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        const mobile = viewport.width < 1024
        const prefix = `${mobile ? 'mobile' : 'desktop'}-${mode}`
        await f.page.setViewportSize(viewport)
        if (mobile) {
          await f.go()
          await ready(f, '[data-settings-menu="security"]')
          assert.equal(await f.root.getAttribute('data-settings-view'), 'menu')
          await f.root.locator('[data-settings-connected-logos] img').nth(2).waitFor()
          await capture(f, `${prefix}-menu`)
        }
        await f.go('account')
        await ready(f, '[data-settings-plan]')
        const save = f.root.locator('[data-settings-profile-save]')
        await f.root.locator('[data-settings-name]').fill('Ana Creator Studio')
        assert.equal(await background(save), dark ? steel : 'rgb(11, 11, 12)', `${prefix}: primary is black / muted steel`)
        await f.root.locator('[data-settings-name]').fill('Ana Creator')
        if (!mobile)
          assert.equal(await background(f.root.locator('[data-settings-nav="account"]')), dark ? steel : 'rgb(21, 32, 53)', `${prefix}: selected nav`)
        await capture(f, `${prefix}-account`, mobile)
        await f.go('security')
        await ready(f, '[data-settings-session]')
        await capture(f, `${prefix}-security`, mobile)
        await f.root.locator('[data-settings-two-factor-open]').click()
        await dialog(f).locator('[data-settings-qr]').waitFor()
        await capture(f, `${prefix}-two-factor`)
        await dialog(f).getByRole('button', { name: 'Close' }).click()
        await f.page.locator('[data-settings-two-factor]').waitFor({ state: 'detached' })
        await f.go('connections')
        await ready(f, '[data-settings-connection="youtube"]')
        await capture(f, `${prefix}-connections`, mobile)
        await f.root.locator(`[data-settings-disconnect="${ACCOUNT.instagram}"]`).click()
        await dialog(f).locator('[data-settings-disconnect-dialog]').waitFor()
        await capture(f, `${prefix}-disconnect`)
        await dialog(f).getByRole('button', { name: 'Cancel' }).click()
        await f.page.locator('[data-settings-disconnect-dialog]').waitFor({ state: 'detached' })
        await f.go('notifications')
        await ready(f, '[data-settings-notification]')
        await capture(f, `${prefix}-notifications`)
        await f.go('preferences')
        await ready(f, '[data-settings-preferences-save]')
        await capture(f, `${prefix}-preferences`, mobile)
        await f.go('privacy')
        await ready(f, '[data-settings-export-row]')
        await capture(f, `${prefix}-privacy`, mobile)
        await f.root.locator('[data-settings-delete-open]').click()
        await dialog(f).locator('[data-settings-delete-dialog]').waitFor()
        assert.equal(await dialog(f).locator('img[src="/illustrations/delete.webp"]').getAttribute('width'), '150', 'Delete illustration')
        await capture(f, `${prefix}-delete`)
        await dialog(f).getByRole('button', { name: 'Cancel' }).click()
        await f.page.locator('[data-settings-delete-dialog]').waitFor({ state: 'detached' })
      }
    }
    // Widths: every section, no horizontal overflow from 320 to 1440px.
    await f.page.emulateMedia({ colorScheme: 'light' })
    for (const width of [320, 390, 768, 1024, 1152, 1280, 1440]) {
      await f.page.setViewportSize({ width, height: 900 })
      for (const section of ['', 'account', 'security', 'connections', 'notifications', 'preferences', 'privacy']) {
        if (!section && width >= 1024) continue
        await f.go(section)
        await f.root.locator(section ? `[data-settings-content="${section}"]` : '[data-settings-menu="security"]').waitFor()
        await f.page.waitForTimeout(80)
        await noOverflow(f.page, `${width}px ${section || 'menu'}`)
      }
    }
  } finally {
    await f.close()
  }
  console.log('Reference states captured for desktop/mobile in light and dark; no horizontal overflow at 320–1440px')
}

// ---------------------------------------------------------------- desktop interactions
async function desktop() {
  const f = await fixture()
  try {
    await f.open()
    await ready(f, '[data-settings-plan]')
    assert.equal(await f.root.locator('h1').innerText(), 'Account')
    await rememberShell(f.page)
    // Navigation: each card link changes only the section, inside the mounted shell.
    for (const [section, title] of [['security', 'Security'], ['connections', 'Connected accounts'], ['notifications', 'Notifications'], ['preferences', 'Preferences'], ['privacy', 'Data & privacy'], ['account', 'Account']]) {
      await f.root.locator(`[data-settings-nav="${section}"]`).click()
      await until(async () => new URL(f.page.url()).search === `?section=${section}`, `URL for ${section}`)
      await until(async () => (await f.root.locator('h1').innerText()) === title, `Title for ${section}`)
      assert.equal(await f.root.locator(`[data-settings-nav="${section}"]`).getAttribute('aria-current'), 'page')
      assert.equal(await shellKept(f.page), true, `${section}: shell and workspace stay mounted`)
    }

    // Account: cancel restores, save sends the trimmed name.
    const name = f.root.locator('[data-settings-name]')
    await name.fill('Temporary')
    await f.root.locator('[data-settings-profile-cancel]').click()
    assert.equal(await name.inputValue(), 'Ana Creator')
    await name.fill('  Ana   Studio ')
    await f.root.locator('[data-settings-profile-save]').click()
    await called(f, /PATCH \/api\/user\/profile \{"name":"Ana Studio"\}/, 'Profile save')
    await until(async () => (await name.inputValue()) === 'Ana Studio', 'Saved name shown')
    assert.match(await f.root.locator('[data-settings-plan]').innerText(), /Pro\s+Renews on Dec 14, 2026/)
    assert.equal(await f.root.locator('[data-settings-locked-email]').innerText(), identity.email)

    // Security: two-factor setup, recovery codes, management, sessions.
    await f.root.locator('[data-settings-nav="security"]').click()
    await ready(f, '[data-settings-session]')
    assert.match(await f.root.locator('[data-settings-card="sessions"]').innerText(), /Chrome on Windows[\s\S]*now[\s\S]*Current session[\s\S]*Safari on iOS[\s\S]*2 hours ago/)
    await f.root.locator('[data-settings-two-factor-open]').click()
    await called(f, /POST \/api\/user\/mfa\/setup/, 'MFA setup')
    const setup = dialog(f)
    assert.equal(await setup.locator('[data-settings-secret]').innerText(), 'JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')
    assert.ok(Number(await setup.locator('[data-settings-qr]').getAttribute('data-settings-qr')) >= 1, 'QR rendered')
    await setup.locator('[data-settings-copy-secret]').click()
    await until(async () => (await f.page.evaluate(() => navigator.clipboard.readText())) === 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', 'Secret copied')
    const activate = setup.getByRole('button', { name: 'Activate' })
    assert.equal(await activate.isDisabled(), true, 'Activate waits for six digits')
    await setup.locator('[data-settings-digit="0"]').fill('654321')
    await setup.locator('[data-settings-digit="5"]').press('Backspace')
    await setup.locator('[data-settings-digit="5"]').press('Backspace')
    assert.equal(await activate.isDisabled(), true, 'Backspace removes digits')
    await setup.locator('[data-settings-digit="0"]').fill('1')
    for (const [index, digit] of [[1, '2'], [2, '3'], [3, '4'], [4, '5'], [5, '6']]) await setup.locator(`[data-settings-digit="${index}"]`).pressSequentially(digit)
    await activate.click()
    await called(f, /POST \/api\/user\/mfa\/enable \{"code":"123456"\}/, 'MFA enable')
    await setup.locator('[data-settings-recovery-codes] li').nth(3).waitFor()
    await setup.locator('[data-settings-copy-codes]').click()
    // The Windows clipboard stores CRLF line endings.
    await until(async () => (await f.page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n') === 'ab12-cd34\nef56-gh78\nij90-kl12\nmn34-op56', 'Codes copied')
    await setup.locator('[data-settings-two-factor-done]').click()
    await setup.waitFor({ state: 'detached' })
    assert.match(await f.root.locator('[data-settings-card="two-factor"]').innerText(), /Enabled[\s\S]*Manage/)
    await f.root.locator('[data-settings-two-factor-open]').click()
    await dialog(f).locator('[data-settings-mfa-code]').fill('123456')
    await dialog(f).locator('[data-settings-new-codes]').click()
    await called(f, /POST \/api\/user\/mfa\/recovery-codes \{"code":"123456"\}/, 'New recovery codes')
    await dialog(f).locator('[data-settings-recovery-codes] li').nth(1).waitFor()
    await dialog(f).locator('[data-settings-two-factor-done]').click()
    await f.root.locator('[data-settings-two-factor-open]').click()
    await dialog(f).locator('[data-settings-mfa-code]').fill('654321')
    await dialog(f).locator('[data-settings-disable-mfa]').click()
    await called(f, /POST \/api\/user\/mfa\/disable \{"code":"654321"\}/, 'Disable MFA')
    await until(async () => /Disabled[\s\S]*Set up/.test(await f.root.locator('[data-settings-card="two-factor"]').innerText()), 'MFA disabled')
    await f.root.locator(`[data-settings-revoke="${SESSION.phone}"]`).click()
    await called(f, new RegExp(`DELETE /api/user/sessions/${SESSION.phone}`), 'Revoke one session')
    await f.root.locator(`[data-settings-revoke="${SESSION.phone}"]`).waitFor({ state: 'detached' })
    assert.equal(await f.root.locator('[data-settings-revoke-others]').isDisabled(), true, 'No other sessions left')

    // Connections: reconnect opens OAuth, disconnect confirms, YouTube asks for consent.
    await f.root.locator('[data-settings-nav="connections"]').click()
    await ready(f, '[data-settings-connection="youtube"]')
    const cards = await f.root.locator('[data-settings-connection]').evaluateAll((items) => items.map((item) => item.getAttribute('data-settings-connection')))
    assert.deepEqual(cards, ['instagram', 'facebook', 'tiktok', 'youtube'], 'Platform order')
    assert.match(await f.root.locator('[data-settings-connection="instagram"]').innerText(), /Instagram\s+@ana\.creator\s+Connected\s+Active until/)
    assert.match(await f.root.locator('[data-settings-connection="tiktok"]').innerText(), /Expires in 15 days/)
    assert.equal(await background(f.root.locator('[data-settings-reconnect="tiktok"]')), 'rgb(11, 11, 12)', 'Expiring account: primary reconnect')
    const popup = f.context.waitForEvent('page')
    await f.root.locator('[data-settings-reconnect="instagram"]').click()
    const oauth = await popup
    await called(f, /POST \/api\/publishing\/connect\/instagram \{"locale":"en"\}/, 'Reconnect Instagram')
    await until(async () => oauth.url() === 'https://oauth.example.invalid/instagram', 'OAuth popup opened')
    await oauth.close()
    await f.root.locator(`[data-settings-disconnect="${ACCOUNT.facebook}"]`).click()
    await dialog(f).getByText('Disconnect Facebook?').waitFor()
    await dialog(f).getByText('Scheduled posts will no longer be published.').waitFor()
    await dialog(f).getByRole('button', { name: 'Cancel' }).click()
    await f.page.locator('[data-settings-disconnect-dialog]').waitFor({ state: 'detached' })
    await f.root.locator(`[data-settings-disconnect="${ACCOUNT.facebook}"]`).click()
    await dialog(f).getByRole('button', { name: 'Disconnect', exact: true }).click()
    await called(f, new RegExp(`DELETE /api/publishing/accounts/${ACCOUNT.facebook}`), 'Disconnect Facebook')
    await f.root.locator('[data-settings-connect="facebook"]').waitFor()
    await f.root.locator('[data-settings-connect="youtube"]').click()
    const consent = dialog(f)
    await consent.locator('[data-settings-youtube-consent]').waitFor()
    const connectYouTube = consent.getByRole('button', { name: 'Connect YouTube' })
    assert.equal(await connectYouTube.isDisabled(), true, 'YouTube waits for consent')
    await consent.locator('[data-settings-youtube-consent-check]').click()
    const youtubePopup = f.context.waitForEvent('page')
    await connectYouTube.click()
    await called(f, /POST \/api\/publishing\/connect\/youtube \{"locale":"en","youtubeConsent":true\}/, 'Connect YouTube with consent')
    await (await youtubePopup).close()

    // Notifications save immediately; security e-mails cannot be turned off.
    await f.root.locator('[data-settings-nav="notifications"]').click()
    await ready(f, '[data-settings-notification]')
    assert.equal(await f.root.locator('[data-settings-notification="emailSecurity"]').isDisabled(), true)
    await f.root.locator('[data-settings-notification="emailProduct"]').click()
    await called(f, /PUT \/api\/user\/preferences .*"emailProduct":false/, 'Product e-mails off')
    await until(async () => (await f.root.locator('[data-settings-notification="emailProduct"]').getAttribute('aria-checked')) === 'false', 'Switch off')
    await f.root.locator('[data-settings-notification="inAppPublishing"]').click()
    await called(f, /PUT \/api\/user\/preferences .*"inAppPublishing":false/, 'Publishing updates off')

    // Preferences: cancel discards, save sends every changed value and applies the theme.
    await f.root.locator('[data-settings-nav="preferences"]').click()
    await ready(f, '[data-settings-preferences-save]')
    const savePreferences = f.root.locator('[data-settings-preferences-save]')
    assert.equal(await savePreferences.isDisabled(), true, 'Nothing to save yet')
    assert.equal(await f.root.getByRole('radio', { name: /4:5/ }).count(), 0, '4:5 hidden: jobs do not support it')
    await f.root.getByRole('radio', { name: 'Dark' }).click()
    await f.root.locator('[data-settings-preferences-cancel]').click()
    assert.equal(await f.root.getByRole('radio', { name: 'System' }).getAttribute('aria-checked'), 'true')
    await f.root.getByRole('radio', { name: 'Dark' }).click()
    await f.root.getByRole('radio', { name: /1:1/ }).click()
    await f.root.locator('[data-settings-clip-count="increase"]').click()
    await f.root.locator('[data-settings-clip-count="decrease"]').click()
    await f.root.locator('[data-settings-clip-count="decrease"]').click()
    await f.root.locator('[data-settings-choice="timezone"]').click()
    await f.page.locator('[data-settings-choice-menu="timezone"]').getByRole('menuitemradio', { name: /^UTC/ }).click()
    assert.match(await f.root.locator('[data-settings-choice="timezone"]').innerText(), /^UTC/)
    await savePreferences.click()
    await called(f, /PUT \/api\/user\/preferences \{"locale":"en","theme":"dark","timezone":"UTC","defaultAspectRatio":"1:1","defaultClipCount":4,"emailSecurity":true,"emailProduct":false/, 'Preferences saved')
    await until(() => f.page.evaluate(() => document.documentElement.classList.contains('dark')), 'Dark theme applied')
    await f.root.locator('[data-settings-choice="language"]').click()
    await f.page.locator('[data-settings-choice-menu="language"]').getByRole('menuitemradio', { name: 'Română' }).click()
    await savePreferences.click()
    await until(async () => new URL(f.page.url()).pathname === '/ro/dashboard/settings', 'Language switch keeps the section')
    assert.equal(new URL(f.page.url()).search, '?section=preferences')
    await f.root.getByText('Salvează preferințele').waitFor()

    // Privacy: export downloads and lists, documents link out, delete confirms.
    await f.go('privacy', { ro: false })
    await ready(f, '[data-settings-export-row]')
    const [download] = await Promise.all([f.page.waitForEvent('download'), f.root.locator('[data-settings-export]').click()])
    assert.match(download.suggestedFilename(), /^sneepcut-data-export-\d{4}-\d{2}-\d{2}\.json$/)
    await called(f, /GET \/api\/user\/data/, 'Export requested')
    await until(async () => (await f.root.locator('[data-settings-export-row]').count()) === 3, 'Export history refreshed')
    assert.equal(await f.root.locator('[data-settings-document="privacy"]').getAttribute('href'), '/privacy')
    assert.equal(await f.root.locator('[data-settings-document="terms"]').getAttribute('href'), '/terms')
    await f.root.locator('[data-settings-delete-open]').click()
    const removal = dialog(f)
    const submit = removal.locator('[data-settings-delete-submit]')
    await removal.locator('[data-settings-delete-email]').fill(identity.email)
    assert.equal(await submit.isDisabled(), true, 'Password still required')
    await removal.getByRole('button', { name: 'Cancel' }).click()
    await f.page.locator('[data-settings-delete-dialog]').waitFor({ state: 'detached' })
    await f.root.locator('[data-settings-document="terms"]').click()
    await until(async () => new URL(f.page.url()).pathname === '/terms', 'Terms opened')
  } finally {
    await f.close()
  }
  console.log('Desktop: navigation in place, profile cancel/save, 2FA setup/codes/manage/disable, sessions, connections (reconnect, disconnect, YouTube consent), notifications, preferences cancel/save/theme/language, export, documents, delete dialog passed')
}

// ---------------------------------------------------------------- destructive flows
async function destructive() {
  const f = await fixture()
  try {
    await f.open('security')
    await ready(f, '[data-settings-password-save]')
    const card = f.root.locator('[data-settings-card="password"]')
    await card.getByLabel('Current password', { exact: true }).fill('Old-password-123!')
    await card.getByLabel('New password', { exact: true }).fill('New-password-456!')
    await card.getByLabel('Confirm new password', { exact: true }).fill('New-password-456!')
    await f.root.locator('[data-settings-password-save]').click()
    await called(f, /POST \/api\/user\/password \{"currentPassword":"Old-password-123!","newPassword":"New-password-456!","confirmPassword":"New-password-456!"\}/, 'Password change')
    await called(f, /POST \/v1\/auth\/logout/, 'Signed out after password change')
    await until(async () => new URL(f.page.url()).pathname === '/login', 'Login after password change')
  } finally {
    await f.close()
  }
  const g = await fixture()
  try {
    await g.open('privacy')
    await ready(g, '[data-settings-delete-open]')
    await g.root.locator('[data-settings-delete-open]').click()
    const removal = dialog(g)
    await removal.locator('[data-settings-delete-email]').fill(identity.email)
    await removal.locator('[data-settings-delete-password]').fill('Old-password-123!')
    await removal.locator('[data-settings-delete-submit]').click()
    await called(g, new RegExp(`DELETE /api/user/data \\{"confirmation":"${identity.email}","currentPassword":"Old-password-123!"\\}`), 'Account deletion')
    await called(g, /POST \/v1\/auth\/logout/, 'Signed out after deletion')
    await until(async () => new URL(g.page.url()).pathname === '/login', 'Login after deletion')
  } finally {
    await g.close()
  }
  const h = await fixture({ unverified: true })
  try {
    await h.open('account')
    await ready(h, '[data-settings-resend]')
    await h.root.locator('[data-settings-resend]').click()
    await called(h, /POST \/v1\/auth\/resend-activation \{"email":"ana@example.invalid"\}/, 'Verification resent')
    await h.root.getByText('Verification email sent').waitFor()
  } finally {
    await h.close()
  }
  console.log('Password change, account deletion and verification resend passed')
}

// ---------------------------------------------------------------- phone interactions
async function phone() {
  const f = await fixture({ viewport: { width: 390, height: 844 } })
  try {
    await f.open()
    await ready(f, '[data-settings-menu="security"]')
    assert.equal(await f.page.locator('[data-workspace-mobile-header]').isVisible(), true, 'Mobile header')
    assert.equal(await f.root.locator('[data-settings-nav]').count(), 0, 'No desktop navigation on phones')
    for (const section of ['account', 'security', 'connections', 'notifications', 'preferences', 'privacy']) {
      await f.root.locator(`[data-settings-menu="${section}"]`).click()
      await until(async () => new URL(f.page.url()).search === `?section=${section}`, `Phone opens ${section}`)
      await f.root.locator(`[data-settings-content="${section}"]`).waitFor()
      const back = f.root.locator('[data-settings-back]')
      assert.equal(await back.innerText(), 'Settings', 'Back button has text')
      await back.click()
      await f.root.locator('[data-settings-menu="security"]').waitFor()
      assert.equal(new URL(f.page.url()).search, '')
    }
    // Profile save, full-width actions without Cancel.
    await f.root.locator('[data-settings-menu="account"]').click()
    await ready(f, '[data-settings-name]')
    assert.equal(await f.root.locator('[data-settings-profile-cancel]').count(), 0)
    await f.root.locator('[data-settings-name]').fill('Ana Phone')
    await f.root.locator('[data-settings-profile-save]').click()
    await called(f, /PATCH \/api\/user\/profile \{"name":"Ana Phone"\}/, 'Phone profile save')
    await f.root.locator('[data-settings-billing]').click()
    await until(async () => new URL(f.page.url()).pathname === '/dashboard/billing', 'Manage subscription goes to billing')
    // Two-factor opens as a bottom sheet.
    await f.go('security')
    await ready(f, '[data-settings-two-factor-open]')
    await f.root.locator('[data-settings-two-factor-open]').click()
    await f.page.locator('[data-slot="sheet-content"] [data-settings-two-factor="setup"]').waitFor()
    await dialog(f).getByRole('button', { name: 'Cancel' }).click()
    await f.root.locator('[data-settings-revoke-others]').click()
    await called(f, /POST \/api\/user\/sessions\/revoke-others/, 'Phone revoke others')
    // Preferences: language and timezone sheets, then save.
    await f.go('preferences')
    await ready(f, '[data-settings-choice="timezone"]')
    await f.root.locator('[data-settings-choice="timezone"]').click()
    const list = f.page.locator('[data-settings-choice-list="timezone"]')
    await list.getByRole('option', { name: /^UTC/ }).click()
    await list.waitFor({ state: 'detached' })
    assert.match(await f.root.locator('[data-settings-choice="timezone"]').innerText(), /UTC/)
    await f.root.locator('[data-settings-choice="language"]').click()
    await f.page.locator('[data-settings-choice-list="language"]').getByRole('option', { name: 'English' }).click()
    await f.root.getByRole('radio', { name: /16:9/ }).click()
    await f.root.locator('[data-settings-preferences-save]').click()
    await called(f, /PUT \/api\/user\/preferences .*"timezone":"UTC","defaultAspectRatio":"16:9"/, 'Phone preferences save')
    // Connections: disconnect sheet.
    await f.go('connections')
    await ready(f, `[data-settings-disconnect="${ACCOUNT.tiktok}"]`)
    await f.root.locator(`[data-settings-disconnect="${ACCOUNT.tiktok}"]`).click()
    await f.page.locator('[data-slot="sheet-content"] [data-settings-disconnect-dialog]').waitFor()
    await dialog(f).getByRole('button', { name: 'Disconnect', exact: true }).click()
    await called(f, new RegExp(`DELETE /api/publishing/accounts/${ACCOUNT.tiktok}`), 'Phone disconnect')
    // Menu: subscription row and sign out.
    await f.go()
    await f.root.locator('[data-settings-menu="billing"]').click()
    await until(async () => new URL(f.page.url()).pathname === '/dashboard/billing', 'Subscription row goes to billing')
    await f.go()
    await f.root.locator('[data-settings-sign-out]').click()
    await called(f, /POST \/v1\/auth\/logout/, 'Sign out')
  } finally {
    await f.close()
  }
  console.log('Phone: menu rows and back buttons, profile, billing links, 2FA sheet, sessions, preference sheets, disconnect sheet, sign out passed')
}

// ---------------------------------------------------------------- Romanian copy
async function romanian() {
  const f = await fixture({ ro: true })
  try {
    await f.open()
    await ready(f, '[data-settings-plan]')
    for (const text of ['Cont', 'Securitate', 'Conturi conectate', 'Notificări', 'Preferințe', 'Date și confidențialitate', 'Profil', 'Detalii cont', 'Abonament', 'Gestionează abonamentul', 'Salvează profilul'])
      assert.ok((await f.root.getByText(text, { exact: true }).count()) > 0, `Romanian: ${text}`)
    await f.go('security')
    await ready(f, '[data-settings-session]')
    await f.root.getByText('Chrome pe Windows').waitFor()
    await f.root.getByText('Revocă celelalte sesiuni').waitFor()
    await f.go('connections')
    await ready(f, '[data-settings-connection="youtube"]')
    await f.root.getByText('Expiră în 15 zile').waitFor()
    await f.root.getByText('Conectează YouTube').waitFor()
    await capture(f, 'desktop-romanian-connections')
  } finally {
    await f.close()
  }
  console.log('Romanian copy passed')
}

try {
  await mkdir(output, { recursive: true })
  const group = process.env.SETTINGS_GROUP || 'all',
    runs = (name) => group === 'all' || group.split(',').includes(name)
  if (runs('references')) await references()
  if (runs('desktop')) await desktop()
  if (runs('destructive')) await destructive()
  if (runs('phone')) await phone()
  if (runs('romanian')) await romanian()
  assert.deepEqual(runtimeErrors, [])
  assert.deepEqual(unexpected, [])
  await writeFile(
    new URL(`summary-${group.replaceAll(',', '-')}.json`, output),
    JSON.stringify({ groups: group, screenshots: reports, available: (await readdir(output)).filter((name) => name.endsWith('.png')).sort(), fixtureOnly: true }, null, 2)
  )
  console.log(`All synthetic Settings checks passed; ${reports.length} captures`)
} finally {
  await browser.close()
}
