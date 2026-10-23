import assert from 'node:assert/strict'
import {
  mkdir,
  readFile,
  readdir,
  stat,
  utimes,
  writeFile
} from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Run against an already running local Vite server. Every authenticated read and
// mutation is fulfilled here with synthetic data; no application DB or provider
// receives profile, security, publishing, export or deletion requests.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE')
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const output = new URL('../test-results/settings-layout/', import.meta.url)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const runtimeErrors = [],
  unexpectedMutations = [],
  reports = []
let fastRefreshVerified = false
let sourceRestorationVerified = false
const accountId = '00000000-0000-4000-8000-000000000932'
const profile = (overrides = {}) => ({
  id: accountId,
  name: 'Alex Morgan',
  email: 'alex@example.invalid',
  image: null,
  provider: 'credentials',
  canChangePassword: true,
  recentlyAuthenticated: true,
  emailVerified: '2026-10-01T09:00:00Z',
  createdAt: '2026-10-01T09:00:00Z',
  ...overrides
})
const preferences = () => ({
  locale: 'en',
  theme: 'system',
  timezone: 'UTC',
  defaultAspectRatio: '9:16',
  defaultClipCount: 3,
  emailSecurity: true,
  emailProduct: true,
  emailMarketing: false,
  inAppProcessing: true,
  inAppPublishing: true
})
const settings = (overrides = {}) => ({
  preferences: preferences(),
  mfa: { enabled: false },
  sessions: [
    {
      id: 'synthetic-current',
      device: 'Chrome on Windows',
      current: true,
      createdAt: '2026-10-01T09:00:00Z',
      lastSeenAt: '2026-10-23T07:32:00Z',
      expiresAt: '2026-11-23T07:32:00Z'
    },
    {
      id: 'synthetic-phone',
      device: 'Safari on iOS',
      current: false,
      createdAt: '2026-10-02T09:00:00Z',
      lastSeenAt: '2026-10-23T06:15:00Z',
      expiresAt: '2026-11-23T06:15:00Z'
    }
  ],
  securityEvents: [
    {
      id: 'synthetic-password',
      type: 'password_changed',
      detail: 'Password changed',
      createdAt: '2026-10-23T07:20:00Z'
    },
    {
      id: 'synthetic-revoke',
      type: 'session_revoked',
      detail: 'A signed-in device was revoked',
      createdAt: '2026-10-22T15:44:00Z'
    }
  ],
  exports: ['pending', 'processing', 'completed', 'failed'].map(
    (status, index) => ({
      id: `synthetic-export-${index}`,
      status,
      requestedAt: [
        '2026-10-23T07:05:00Z',
        '2026-10-23T07:00:00Z',
        '2026-10-23T06:00:00Z',
        '2026-10-22T14:00:00Z'
      ][index]
    })
  ),
  ...overrides
})
const publishing = () => ({
  providers: ['instagram', 'facebook', 'tiktok', 'youtube'].map((id) => ({
    id,
    name: {
      instagram: 'Instagram',
      facebook: 'Facebook',
      tiktok: 'TikTok',
      youtube: 'YouTube'
    }[id],
    configured: id !== 'facebook',
    supportsPublishing: id !== 'facebook',
    ...(id === 'facebook' ? { reason: 'Requires developer setup' } : {})
  })),
  accounts: [
    {
      id: 'synthetic-instagram',
      provider: 'instagram',
      name: 'SneepCutStudio',
      username: '@sneepcutstudio',
      status: 'connected',
      scopes: ['content_publish'],
      tokenExpired: false,
      tokenExpiresAt: '2026-11-23T12:00:00Z'
    },
    {
      id: 'synthetic-tiktok',
      provider: 'tiktok',
      name: 'SneepCutStudio',
      username: '@sneepcutstudio',
      status: 'connected',
      scopes: ['video.publish'],
      tokenExpired: true,
      tokenExpiresAt: '2026-10-23T00:00:00Z'
    }
  ],
  clips: [],
  posts: []
})
const recoveryCodes = [
  'DEMO-0001',
  'DEMO-0002',
  'DEMO-0003',
  'DEMO-0004',
  'DEMO-0005',
  'DEMO-0006'
]

async function fixture(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1488, height: 1058 },
    timezoneId: 'Europe/Bucharest',
    colorScheme: options.light ? 'light' : 'dark',
    reducedMotion: 'reduce',
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write']
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.setDefaultNavigationTimeout(60000)
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      !/^Failed to load resource:/.test(message.text())
    )
      runtimeErrors.push(message.text())
  })
  let currentProfile = profile(options.profile),
    currentSettings = settings(options.settings)
  let currentPublishing = options.publishing || publishing()
  const calls = {
    profileReads: 0,
    settingsReads: 0,
    publishingReads: 0,
    mutations: [],
    exports: 0,
    reauth: [],
    logout: 0
  }
  const failures = new Map(Object.entries(options.failures || {}))
  const gates = new Map()
  for (const key of options.hold || []) {
    let release
    const promise = new Promise((resolve) => {
      release = resolve
    })
    gates.set(key, { promise, release })
  }
  const user = () => ({
    id: accountId,
    email: currentProfile.email,
    name: currentProfile.name,
    profile_pic: null,
    credits: 3240,
    plan: 'pro',
    access_role: 'member',
    deletion_pending: currentProfile.deletionPending || false
  })
  async function failure(route, key) {
    if (gates.has(key)) await gates.get(key).promise
    const count = failures.get(key) || 0
    if (!count) return false
    if (Number.isFinite(count)) failures.set(key, count - 1)
    await route.fulfill({
      status: 503,
      json: { error: `Synthetic ${key} failure. Try again.` }
    })
    return true
  }
  await context.route('**/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname
    if (path === '/v1/auth/google') {
      calls.reauth.push(Object.fromEntries(url.searchParams))
      return route.fulfill({
        contentType: 'text/html',
        body: '<main>Synthetic Google identity boundary</main>'
      })
    }
    if (path === '/v1/auth/resend-activation') {
      assert.equal(request.method(), 'POST')
      assert.deepEqual(request.postDataJSON(), { email: currentProfile.email })
      calls.mutations.push({ path, payload: request.postDataJSON() })
      if (await failure(route, 'verification')) return
      return route.fulfill({ json: { sent: true } })
    }
    if (path === '/v1/auth/logout') {
      calls.logout += 1
      assert.equal(request.method(), 'POST')
      if (await failure(route, 'logout')) return
      return route.fulfill({ json: { loggedOut: true } })
    }
    if (path !== '/v1/auth/refresh')
      unexpectedMutations.push(`${request.method()} ${path}`)
    return route.fulfill({
      json: { access_token: 'synthetic-settings-token', user: user() }
    })
  })
  await context.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname,
      method = request.method()
    const payload = request.postData() ? request.postDataJSON() : undefined
    if (path === '/api/user/profile' && method === 'GET') {
      calls.profileReads += 1
      if (await failure(route, 'profileRead')) return
      return route.fulfill({ json: { profile: currentProfile } })
    }
    if (path === '/api/user/settings' && method === 'GET') {
      calls.settingsReads += 1
      if (await failure(route, 'settingsRead')) return
      return route.fulfill({ json: currentSettings })
    }
    if (path === '/api/publishing' && method === 'GET') {
      calls.publishingReads += 1
      if (await failure(route, 'connectionsRead')) return
      return route.fulfill({ json: currentPublishing })
    }
    if (path === '/api/user/data' && method === 'GET') {
      calls.exports += 1
      if (await failure(route, 'export')) return
      currentSettings.exports.unshift({
        id: 'synthetic-new-export',
        status: 'completed',
        requestedAt: '2026-10-23T10:00:00Z'
      })
      return route.fulfill({
        json: {
          exportedAt: '2026-10-23T10:00:00Z',
          format: 'Sneepcut GDPR data export',
          data: {
            profile: currentProfile,
            preferences: currentSettings.preferences
          }
        }
      })
    }
    if (method !== 'GET') {
      calls.mutations.push({ path, method, payload })
      if (path === '/api/user/profile' && method === 'PATCH') {
        assert.deepEqual(Object.keys(payload), ['name'])
        if (await failure(route, 'profile')) return
        currentProfile.name = payload.name.trim().replace(/\s+/g, ' ')
        return route.fulfill({ json: { profile: currentProfile } })
      }
      if (path === '/api/user/password' && method === 'POST') {
        assert.deepEqual(Object.keys(payload).sort(), [
          'confirmPassword',
          'currentPassword',
          'newPassword'
        ])
        if (await failure(route, 'password')) return
        return route.fulfill({ json: { changed: true } })
      }
      if (path === '/api/user/preferences' && method === 'PUT') {
        assert.deepEqual(
          Object.keys(payload).sort(),
          Object.keys(preferences()).sort()
        )
        assert.ok(
          payload.defaultClipCount >= 1 && payload.defaultClipCount <= 10
        )
        if (await failure(route, 'preferences')) return
        currentSettings.preferences = structuredClone(payload)
        return route.fulfill({ json: { preferences: payload } })
      }
      if (path.startsWith('/api/user/mfa/') && method === 'POST') {
        const action = path.split('/').at(-1)
        if (await failure(route, `mfa-${action}`)) return
        if (action === 'setup')
          return route.fulfill({
            json: {
              setup: {
                secret: 'JBSWY3DPEHPK3PXP',
                provisionerUri:
                  'otpauth://totp/Synthetic?secret=JBSWY3DPEHPK3PXP'
              }
            }
          })
        assert.deepEqual(Object.keys(payload), ['code'])
        assert.ok(payload.code)
        if (action === 'enable') currentSettings.mfa.enabled = true
        if (action === 'disable') currentSettings.mfa.enabled = false
        return route.fulfill({
          json: {
            enabled: currentSettings.mfa.enabled,
            ...(action !== 'disable'
              ? {
                  recoveryCodes:
                    action === 'recovery-codes'
                      ? recoveryCodes.map((code) => code.replace('DEMO', 'NEW'))
                      : recoveryCodes
                }
              : {})
          }
        })
      }
      if (path === '/api/user/sessions/revoke-others' && method === 'POST') {
        if (await failure(route, 'sessions')) return
        currentSettings.sessions = currentSettings.sessions.filter(
          (session) => session.current
        )
        return route.fulfill({ json: { revoked: 1 } })
      }
      if (path.startsWith('/api/user/sessions/') && method === 'DELETE') {
        if (await failure(route, 'session')) return
        currentSettings.sessions = currentSettings.sessions.filter(
          (session) => session.id !== path.split('/').at(-1)
        )
        return route.fulfill({ json: { revoked: true } })
      }
      if (path.startsWith('/api/publishing/accounts/') && method === 'DELETE') {
        if (await failure(route, 'disconnect')) return
        currentPublishing.accounts = currentPublishing.accounts.filter(
          (account) => account.id !== path.split('/').at(-1)
        )
        return route.fulfill({ json: { disconnected: true } })
      }
      if (path.startsWith('/api/publishing/connect/') && method === 'POST') {
        if (await failure(route, 'connect')) return
        return route.fulfill({
          json: { url: `${origin}/synthetic-provider-boundary` }
        })
      }
      if (path === '/api/user/data' && method === 'DELETE') {
        assert.ok(
          payload.confirmation.trim().toLowerCase() ===
            currentProfile.email.toLowerCase()
        )
        assert.deepEqual(
          Object.keys(payload).sort(),
          currentProfile.canChangePassword
            ? ['confirmation', 'currentPassword']
            : ['confirmation']
        )
        if (options.expiredGoogleAuth)
          return route.fulfill({
            status: 403,
            json: {
              error: 'Sign in again to delete your account.',
              code: 'reauthentication_required'
            }
          })
        if (options.subscriptionBlock)
          return route.fulfill({
            status: 409,
            json: { error: 'Cancel your active subscription first.' }
          })
        if (await failure(route, 'delete')) return
        return route.fulfill({ json: { deleted: true } })
      }
      unexpectedMutations.push(`${method} ${path}`)
      return route.fulfill({
        status: 405,
        json: { error: 'Unexpected synthetic fixture mutation' }
      })
    }
    const responses = {
      '/api/dashboard': {
        metrics: {
          credits: 3240,
          plan: 'pro',
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
      '/api/calendar': { posts: [], clips: [] },
      '/api/user/brand': { brandKit: {} },
      '/api/stripe/billing': {
        account: { credits: 3240, plan: 'pro', hasBillingProfile: true },
        subscription: null,
        invoices: [],
        providerAvailable: true
      },
      '/api/stripe/plans': {}
    }
    return route.fulfill({ json: responses[path] || {} })
  })
  await context.route(`${origin}/synthetic-provider-boundary`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<main>Synthetic social consent boundary</main>'
    })
  )
  const workspace = page.locator('[data-settings-workspace]')
  return {
    page,
    context,
    workspace,
    calls,
    release(key) {
      gates.get(key)?.release()
    },
    fail(key, count = 1) {
      failures.set(key, count)
    },
    setSettings(next) {
      currentSettings = structuredClone(next)
    },
    mutations(path) {
      return calls.mutations.filter((call) => call.path === path)
    },
    async open({ wait = true } = {}) {
      await page.goto(
        `${origin}/${options.locale === 'ro' ? 'ro/' : ''}dashboard/settings`,
        { waitUntil: options.hold?.length ? 'domcontentloaded' : 'networkidle' }
      )
      await workspace.waitFor()
      if (wait)
        await workspace.locator('[data-settings-section="account"]').waitFor()
    },
    async close() {
      for (const gate of gates.values()) gate.release()
      await context.close()
    }
  }
}

async function pick(f, section) {
  const desktop = f.page
    .locator(`[data-settings-nav="${section}"]`)
    .filter({ visible: true })
    .first()
  if (await desktop.count()) await desktop.click()
  else {
    await f.page.locator('#settings-section').click()
    const labels = {
      account: 'Account',
      profile: 'Profile',
      security: 'Security',
      connections: 'Connected accounts',
      notifications: 'Notifications',
      preferences: 'Preferences',
      privacy: 'Data & privacy'
    }
    await f.page
      .getByRole('option', { name: labels[section], exact: true })
      .click()
  }
  await panel(f, section).waitFor()
}
function panel(f, section) {
  return f.workspace
    .locator(
      `[data-settings-section="${section}"], [data-settings-panel="${section}"]`
    )
    .filter({ visible: true })
    .first()
}
async function noOverflow(page, name) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    ),
    true,
    `${name}: no horizontal overflow`
  )
}
async function capture(f, name, { scroll = true, fullPage = true } = {}) {
  if (scroll) await f.page.evaluate(() => window.scrollTo(0, 0))
  await noOverflow(f.page, name)
  await f.page.screenshot({
    path: fileURLToPath(new URL(`${name}.png`, output)),
    fullPage
  })
  reports.push(name)
}
async function rememberShell(page) {
  await page.evaluate(() => {
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    window.settingsShellProbe = {
      document,
      main: document.querySelector('main'),
      header: document.querySelector('header.studio-topbar'),
      sidebar,
      state: sidebar?.getAttribute('data-state')
    }
    if (
      !window.settingsShellProbe.main ||
      !window.settingsShellProbe.header ||
      !sidebar
    )
      throw new Error('Missing dashboard shell')
  })
}
async function assertShell(page) {
  assert.equal(
    await page.evaluate(() => {
      const p = window.settingsShellProbe,
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
    'Dashboard document/main/header/sidebar/state remain mounted'
  )
}
async function fillPassword(f, next = 'SyntheticNew123!') {
  await f.page.locator('#current-password').fill('SyntheticOld123!')
  await f.page.locator('#new-password').fill(next)
  await f.page.locator('#confirm-password').fill(next)
}
async function beginMfa(f) {
  await pick(f, 'security')
  await f.page.locator('[data-settings-mfa-setup]').click()
  await f.page.locator('[data-settings-security-view="setup"]').waitFor()
}
async function enableMfa(f) {
  await beginMfa(f)
  await f.page.locator('#mfa-confirm-code').fill('123456')
  await f.page.locator('[data-settings-mfa-enable]').click()
  await f.page.locator('[data-settings-security-view="recovery"]').waitFor()
}
async function openSessions(f) {
  await pick(f, 'security')
  await f.page.locator('[data-settings-sessions-open]').click()
  await f.page.locator('[data-settings-security-view="sessions"]').waitFor()
}
async function openDelete(f) {
  await pick(f, 'privacy')
  await f.page.locator('[data-settings-delete-open]').click()
  await f.page.getByRole('dialog', { name: /Delete account/ }).waitFor()
}
const signOutDialog = (f) =>
  f.page.getByRole('dialog', { name: 'Sign out?', exact: true })
async function openSignOut(f) {
  await pick(f, 'account')
  await panel(f, 'account')
    .getByRole('button', { name: 'Sign out', exact: true })
    .click()
  await signOutDialog(f).waitFor()
}

async function referenceStates() {
  const names = [
    'account',
    'profile',
    'security-password',
    'security-provider',
    'mfa-setup',
    'mfa-recovery',
    'sessions',
    'notifications',
    'preferences',
    'connections',
    'disconnect',
    'privacy',
    'delete-password',
    'delete-provider',
    'sign-out',
    'save-error',
    'loading',
    'load-error'
  ]
  for (const mobile of [false, true]) {
    const viewport = mobile
      ? { width: 390, height: 844 }
      : { width: 1488, height: 1058 }
    for (const name of names.filter(
      (name) =>
        !process.env.REFERENCE_STATES ||
        process.env.REFERENCE_STATES.split(',').includes(name)
    )) {
      const provider = ['security-provider', 'delete-provider'].includes(name)
      const f = await fixture({
        viewport,
        profile: {
          ...(provider
            ? {
                provider: 'google',
                canChangePassword: false,
                recentlyAuthenticated: false
              }
            : {}),
          ...(['profile', 'save-error'].includes(name)
            ? { emailVerified: null }
            : {})
        },
        ...(name === 'loading' ? { hold: ['profileRead'] } : {}),
        failures:
          name === 'load-error'
            ? { profileRead: Infinity }
            : name === 'save-error'
              ? { profile: 1 }
              : {}
      })
      try {
        await f.open({ wait: !['loading', 'load-error'].includes(name) })
        if (['loading', 'load-error'].includes(name)) {
          await f.workspace
            .locator(
              `[data-settings-initial="${name === 'loading' ? 'loading' : 'error'}"]`
            )
            .waitFor()
          assert.equal(
            await f.workspace
              .locator('[data-settings-section="account"]')
              .count(),
            0
          )
          assert.doesNotMatch(
            await f.workspace.innerText(),
            /Alex Morgan|alex@example.invalid/
          )
        } else if (['profile', 'save-error'].includes(name)) {
          await pick(f, 'profile')
          await f.page.locator('#name').fill('Alex Morgan Studio')
          if (name === 'save-error') {
            await f.page.locator('[data-settings-profile-save]').click()
            await panel(f, 'profile').getByRole('alert').waitFor()
          }
        } else if (name === 'security-password') {
          await pick(f, 'security')
          await fillPassword(f)
        } else if (name === 'security-provider') {
          await pick(f, 'security')
          assert.equal(await f.page.locator('#current-password').count(), 0)
        } else if (name === 'mfa-setup') {
          await beginMfa(f)
          await f.page.locator('#mfa-confirm-code').fill('123456')
        } else if (name === 'mfa-recovery') await enableMfa(f)
        else if (name === 'sessions') await openSessions(f)
        else if (['notifications', 'connections', 'privacy'].includes(name))
          await pick(f, name)
        else if (name === 'preferences') {
          await pick(f, name)
          const formBounds = await panel(f, name).locator('form').boundingBox()
          const saveBounds = await panel(f, name)
            .locator('[data-settings-preferences-save]')
            .boundingBox()
          if (mobile)
            assert.ok(
              Math.abs(saveBounds.width - formBounds.width) <= 2,
              'Mobile preference save fills the content column'
            )
          else
            assert.ok(
              Math.abs(
                saveBounds.x +
                  saveBounds.width -
                  formBounds.x -
                  formBounds.width
              ) <= 2,
              'Desktop preference save aligns with the form right edge'
            )
          await f.page.evaluate(() => window.scrollTo(0, 0))
          await f.page.locator('#settings-timezone').click()
          await f.page
            .getByRole('option', { name: 'Europe/Bucharest', exact: true })
            .waitFor()
        } else if (name === 'disconnect') {
          await pick(f, 'connections')
          await f.page
            .locator('[data-settings-disconnect="synthetic-instagram"]')
            .click()
          await f.page
            .locator('[data-settings-disconnect-confirm="synthetic-instagram"]')
            .waitFor()
        } else if (name.startsWith('delete-')) {
          await openDelete(f)
          await f.page
            .locator('#delete-confirmation')
            .fill('alex@example.invalid')
        } else if (name === 'sign-out') {
          await openSignOut(f)
          assert.equal(
            await signOutDialog(f)
              .getByRole('button', { name: 'Cancel', exact: true })
              .evaluate((el) => el === document.activeElement),
            true
          )
        }
        const overlay =
          name === 'preferences' ||
          name === 'sign-out' ||
          name.startsWith('delete-')
        await capture(
          f,
          `${mobile ? 'mobile' : 'desktop'}-${name}`,
          overlay ? { scroll: false, fullPage: false } : {}
        )
      } finally {
        await f.close()
      }
    }
  }
  console.log(
    `${reports.length} Settings desktop/mobile reference states captured with synthetic data`
  )
}

async function profileAndPassword() {
  const f = await fixture({
    profile: { emailVerified: null },
    failures: { profile: 1, verification: 1 },
    hold: ['profile']
  })
  try {
    await f.open()
    await pick(f, 'profile')
    const save = f.page.locator('[data-settings-profile-save]')
    assert.equal(await save.isDisabled(), true)
    await f.page.locator('#name').fill('A')
    assert.equal(await save.isDisabled(), true)
    await f.page.locator('#name').fill('Alex Morgan Studio')
    await pick(f, 'security')
    await fillPassword(f)
    await pick(f, 'profile')
    assert.equal(
      await f.page.locator('#name').inputValue(),
      'Alex Morgan Studio'
    )
    assert.equal(f.calls.mutations.length, 0, 'Section changes never autosave')
    await save.click()
    await f.page.waitForFunction(() =>
      document
        .querySelector('[data-settings-profile-save]')
        ?.matches(':disabled')
    )
    assert.equal(f.mutations('/api/user/profile').length, 1)
    await pick(f, 'connections')
    assert.equal(
      await f.page
        .locator('[data-settings-disconnect="synthetic-instagram"]')
        .isDisabled(),
      true
    )
    await pick(f, 'profile')
    f.release('profile')
    await panel(f, 'profile').getByRole('alert').waitFor()
    assert.equal(
      await f.page.locator('#name').inputValue(),
      'Alex Morgan Studio'
    )
    await save.click()
    await f.page
      .getByText('Alex Morgan Studio', { exact: true })
      .filter({ visible: true })
      .first()
      .waitFor()
    assert.equal(await save.isDisabled(), true)
    assert.equal(f.mutations('/api/user/profile').length, 2)
    const resend = panel(f, 'profile').getByRole('button', {
      name: /Resend verification/
    })
    await resend.click()
    await panel(f, 'profile').getByRole('alert').waitFor()
    await resend.click()
    await f.page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll('button'))
          .find((b) => /Resend verification/.test(b.textContent))
          ?.matches(':disabled')
    )
    assert.equal(f.mutations('/v1/auth/resend-activation').length, 2)
    await pick(f, 'account')
    assert.match(
      await panel(f, 'account').innerText(),
      /not verified|Unverified/i,
      'Resend success never invents email verification'
    )
    await pick(f, 'security')
    assert.equal(
      await f.page.locator('#new-password').inputValue(),
      'SyntheticNew123!'
    )
    for (const invalid of [
      'short',
      'lowercaseonly123!',
      `Aa1!${'é'.repeat(35)}`
    ]) {
      await fillPassword(f, invalid)
      const change = panel(f, 'security').getByRole('button', {
        name: 'Change password',
        exact: true
      })
      if (await change.isEnabled()) {
        const nativeValid = await f.page
          .locator('#new-password')
          .evaluate((input) => input.checkValidity())
        await change.click()
        if (nativeValid) await panel(f, 'security').getByRole('alert').waitFor()
      }
      assert.equal(
        f.mutations('/api/user/password').length,
        0,
        'Invalid policy/UTF-8 password never dispatched'
      )
    }
    await fillPassword(f)
    f.fail('password')
    await panel(f, 'security')
      .getByRole('button', { name: 'Change password', exact: true })
      .click()
    await panel(f, 'security').getByRole('alert').waitFor()
    assert.equal(
      await f.page.locator('#new-password').inputValue(),
      'SyntheticNew123!'
    )
    await panel(f, 'security')
      .getByRole('button', { name: 'Change password', exact: true })
      .click()
    await f.page.waitForURL('**/login**')
    assert.equal(
      f.calls.logout,
      1,
      'Successful password change revokes authenticated session and returns to sign in'
    )
  } finally {
    await f.close()
  }
  console.log(
    'Profile limits/drafts/action lock/errors/retry, truthful resend and password policy/UTF-8/signed-out success passed'
  )
}

async function preferencesAndSecurity() {
  const f = await fixture({
    failures: { preferences: 1 },
    hold: ['preferences']
  })
  try {
    await f.open()
    await pick(f, 'notifications')
    for (const [key, value] of Object.entries({
      emailSecurity: true,
      emailProduct: true,
      emailMarketing: false,
      inAppProcessing: true,
      inAppPublishing: true
    }))
      assert.equal(
        await f.page
          .locator(`[data-settings-switch="${key}"]`)
          .getAttribute('aria-checked'),
        String(value)
      )
    await f.page.locator('[data-settings-switch="emailMarketing"]').click()
    await pick(f, 'preferences')
    await f.page.locator('#settings-clips').fill('7')
    await f.page.locator('#settings-theme').click()
    await f.page.getByRole('option', { name: 'Light', exact: true }).click()
    assert.equal(
      await f.page
        .locator('html')
        .evaluate((el) => el.classList.contains('dark')),
      true,
      'Theme stays confirmed until successful save'
    )
    await pick(f, 'notifications')
    assert.equal(
      await f.page
        .locator('[data-settings-switch="emailMarketing"]')
        .getAttribute('aria-checked'),
      'true'
    )
    assert.equal(f.mutations('/api/user/preferences').length, 0)
    await panel(f, 'notifications')
      .locator('[data-settings-preferences-save]')
      .click()
    await pick(f, 'security')
    assert.equal(
      await f.page.locator('[data-settings-mfa-setup]').isDisabled(),
      true
    )
    f.release('preferences')
    await pick(f, 'notifications')
    await panel(f, 'notifications').getByRole('alert').waitFor()
    assert.equal(
      await f.page
        .locator('html')
        .evaluate((el) => el.classList.contains('dark')),
      true
    )
    await panel(f, 'notifications')
      .locator('[data-settings-preferences-save]')
      .click()
    await f.page.waitForFunction(
      () => !document.documentElement.classList.contains('dark')
    )
    assert.equal(
      f.mutations('/api/user/preferences').at(-1).payload.defaultClipCount,
      7
    )
    assert.equal(
      f.mutations('/api/user/preferences').at(-1).payload.emailMarketing,
      true
    )
    await pick(f, 'preferences')
    await f.page.locator('#settings-clips').fill('11')
    const save = panel(f, 'preferences').locator(
      '[data-settings-preferences-save]'
    )
    if (await save.isEnabled()) await save.click()
    assert.equal(
      f.mutations('/api/user/preferences').length,
      2,
      'Out-of-range clip count never dispatched'
    )
    await f.page.locator('#settings-clips').fill('6')
    await enableMfa(f)
    assert.match(
      await f.page
        .locator('[data-settings-security-view="recovery"]')
        .innerText(),
      /DEMO-0001/
    )
    await f.page.locator('[data-settings-mfa-copy]').click()
    assert.match(
      await f.page.evaluate(() => navigator.clipboard.readText()),
      /DEMO-0001/
    )
    await pick(f, 'preferences')
    assert.equal(
      await f.page.locator('#settings-clips').inputValue(),
      '6',
      'MFA reload preserves unsaved preferences'
    )
    await pick(f, 'security')
    assert.match(
      await panel(f, 'security').innerText(),
      /DEMO-0001/,
      'Local section navigation preserves one-time codes in memory'
    )
    await f.page.locator('#mfa-action-code').fill('123456')
    await f.page.locator('[data-settings-mfa-regenerate]').click()
    await f.page.getByText('NEW-0001', { exact: true }).waitFor()
    await f.page.locator('#mfa-action-code').fill('NEW-0001')
    await f.page.locator('[data-settings-mfa-disable]').click()
    await f.page.locator('[data-settings-security-view="password"]').waitFor()
    assert.equal(await f.page.getByText('NEW-0001', { exact: true }).count(), 0)
    await openSessions(f)
    await f.page
      .locator('[data-settings-session="synthetic-current"]')
      .getByText('Current session', { exact: true })
      .waitFor()
    await f.page
      .locator(
        '[data-settings-session="synthetic-phone"] [data-settings-session-revoke]'
      )
      .click()
    await f.page
      .locator('[data-settings-session="synthetic-phone"]')
      .waitFor({ state: 'detached' })
    await pick(f, 'preferences')
    assert.equal(
      await f.page.locator('#settings-clips').inputValue(),
      '6',
      'Session reload preserves preferences draft'
    )
  } finally {
    await f.close()
  }
  const current = await fixture()
  try {
    await current.open()
    await openSessions(current)
    await current.page
      .locator(
        '[data-settings-session="synthetic-current"] [data-settings-session-revoke]'
      )
      .click()
    await current.page.waitForURL('**/login**')
    assert.equal(
      current.mutations('/api/user/sessions/synthetic-current').length,
      1
    )
  } finally {
    await current.close()
  }
  const others = await fixture()
  try {
    await others.open()
    await openSessions(others)
    await others.page.locator('[data-settings-revoke-others]').click()
    await others.page
      .locator('[data-settings-session="synthetic-phone"]')
      .waitFor({ state: 'detached' })
    await others.page
      .locator('[data-settings-session="synthetic-current"]')
      .waitFor()
  } finally {
    await others.close()
  }
  console.log(
    'Shared explicit preferences save/apply, defaults/range/draft preservation, MFA actual key/code/recovery/copy/disable and session revocation passed'
  )
}

async function connectionsAndPrivacy() {
  const f = await fixture({
    failures: { disconnect: 1, export: 1 },
    hold: ['disconnect']
  })
  try {
    await f.open()
    await pick(f, 'connections')
    assert.equal(await f.page.locator('[data-settings-provider]').count(), 4)
    assert.match(
      await f.page.locator('[data-settings-provider="facebook"]').innerText(),
      /Unconfigured|Requires developer setup/
    )
    assert.equal(
      await f.page
        .locator('[data-settings-provider="facebook"] button')
        .count(),
      0
    )
    assert.match(
      await f.page
        .locator('[data-settings-account="synthetic-instagram"]')
        .innerText(),
      /content_publish/
    )
    assert.match(
      await f.page
        .locator('[data-settings-account="synthetic-tiktok"]')
        .innerText(),
      /expired/i
    )
    await f.page
      .locator('[data-settings-disconnect="synthetic-instagram"]')
      .click()
    await f.page
      .locator('[data-settings-cancel-disconnect="synthetic-instagram"]')
      .click()
    assert.equal(
      f.mutations('/api/publishing/accounts/synthetic-instagram').length,
      0
    )
    await f.page
      .locator('[data-settings-disconnect="synthetic-instagram"]')
      .click()
    await f.page
      .locator('[data-settings-confirm-disconnect="synthetic-instagram"]')
      .click()
    await f.page.waitForFunction(() =>
      document
        .querySelector('[data-settings-connect="youtube"]')
        ?.matches(':disabled')
    )
    await pick(f, 'privacy')
    assert.equal(
      await f.page.locator('[data-settings-export]').isDisabled(),
      true
    )
    f.release('disconnect')
    await pick(f, 'connections')
    await f.page.locator('[data-settings-connection-error]').waitFor()
    await f.page
      .locator('[data-settings-account="synthetic-instagram"]')
      .waitFor()
    await f.page
      .locator('[data-settings-confirm-disconnect="synthetic-instagram"]')
      .click()
    await f.page
      .locator('[data-settings-account="synthetic-instagram"]')
      .waitFor({ state: 'detached' })
    await f.page.locator('[data-settings-connect="youtube"]').click()
    await f.page.locator('[data-settings-youtube-consent]').waitFor()
    const connect = f.page.locator('[data-settings-confirm-connect="youtube"]')
    assert.equal(await connect.isDisabled(), true)
    await f.page.locator('[data-settings-youtube-consent-check]').check()
    const popupPromise = f.page.waitForEvent('popup')
    await connect.click()
    const popup = await popupPromise
    await popup.waitForURL('**/synthetic-provider-boundary')
    assert.equal(
      f.mutations('/api/publishing/connect/youtube')[0].payload.youtubeConsent,
      true
    )
    await popup.close()
    await pick(f, 'privacy')
    const privacy = panel(f, 'privacy')
    assert.equal(
      await privacy.locator('a[href="/privacy"],a[href="/terms"]').count(),
      2
    )
    const history = privacy.locator('table')
    assert.equal(await history.locator('tbody tr').count(), 4)
    assert.equal(
      await history.locator('button,a').count(),
      0,
      'Export rows are informative only'
    )
    await f.page.locator('[data-settings-export]').click()
    await privacy.getByRole('alert').waitFor()
    const downloadPromise = f.page.waitForEvent('download')
    await f.page.locator('[data-settings-export]').click()
    const download = await downloadPromise
    assert.match(
      download.suggestedFilename(),
      /^sneepcut-data-export-.*\.json$/
    )
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'))
    assert.equal(exported.data.profile.email, 'alex@example.invalid')
    assert.equal(f.calls.exports, 2)
  } finally {
    await f.close()
  }
  const multiData = publishing()
  multiData.accounts.push({
    ...multiData.accounts[0],
    id: 'synthetic-instagram-second',
    name: 'Second Studio',
    username: '@secondstudio'
  })
  const multi = await fixture({ publishing: multiData })
  try {
    await multi.open()
    await pick(multi, 'connections')
    assert.equal(
      await multi.page
        .locator('[data-settings-provider="instagram"] [data-settings-account]')
        .count(),
      2
    )
    await multi.page
      .locator('[data-settings-account="synthetic-instagram-second"]')
      .getByText('@secondstudio', { exact: true })
      .waitFor()
    await multi.page
      .locator('[data-settings-disconnect="synthetic-instagram-second"]')
      .click()
    await multi.page
      .locator(
        '[data-settings-confirm-disconnect="synthetic-instagram-second"]'
      )
      .click()
    await multi.page
      .locator('[data-settings-account="synthetic-instagram-second"]')
      .waitFor({ state: 'detached' })
    await multi.page
      .locator('[data-settings-account="synthetic-instagram"]')
      .waitFor()
    assert.equal(
      multi.mutations('/api/publishing/accounts/synthetic-instagram').length,
      0,
      'Disconnect targets only the selected account from a provider with multiple identities'
    )
  } finally {
    await multi.close()
  }
  console.log(
    'Provider status/identity/scope, inline disconnect cancel/busy/failure/retry, YouTube consent, direct JSON export and informative history passed'
  )
}

async function deletionAndSignOut() {
  const f = await fixture({ subscriptionBlock: true, hold: ['delete'] })
  try {
    await f.open()
    await openDelete(f)
    const submit = f.page.locator('[data-settings-delete-submit]')
    assert.equal(await submit.isDisabled(), true)
    await f.page.locator('#delete-confirmation').fill('wrong@example.invalid')
    await f.page.locator('#delete-password').fill('SyntheticOld123!')
    assert.equal(await submit.isDisabled(), true)
    await f.page
      .locator('#delete-confirmation')
      .fill('  ALEX@EXAMPLE.INVALID  ')
    assert.equal(await submit.isEnabled(), true)
    await submit.click()
    await f.page
      .getByRole('dialog')
      .getByRole('alert')
      .filter({ hasText: 'Cancel your active subscription first.' })
      .waitFor()
    assert.equal(f.mutations('/api/user/data').length, 1)
    assert.equal(
      await f.page.locator('#delete-password').inputValue(),
      'SyntheticOld123!'
    )
    await f.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Cancel', exact: true })
      .filter({ hasText: /^Cancel$/ })
      .click()
    await openSignOut(f)
    assert.equal(
      await signOutDialog(f)
        .getByRole('button', { name: 'Cancel', exact: true })
        .evaluate((el) => el === document.activeElement),
      true
    )
    await f.page.keyboard.press('Escape')
    assert.equal(await signOutDialog(f).count(), 0)
    assert.equal(f.calls.logout, 0)
  } finally {
    await f.close()
  }
  const pending = await fixture({ failures: { delete: 1 }, hold: ['delete'] })
  try {
    await pending.open()
    await openDelete(pending)
    await pending.page
      .locator('#delete-confirmation')
      .fill('alex@example.invalid')
    await pending.page.locator('#delete-password').fill('SyntheticOld123!')
    await pending.page.locator('[data-settings-delete-submit]').click()
    await pending.page.waitForFunction(() =>
      document
        .querySelector('[data-settings-delete-submit]')
        ?.matches(':disabled')
    )
    await pending.page.keyboard.press('Escape')
    await pending.page.getByRole('dialog').waitFor()
    assert.equal(
      await pending.page
        .getByRole('dialog')
        .getByRole('button', { name: 'Cancel', exact: true })
        .filter({ hasText: /^Cancel$/ })
        .isDisabled(),
      true
    )
    pending.release('delete')
    await pending.page.getByRole('dialog').getByRole('alert').waitFor()
    await pending.page.locator('[data-settings-delete-submit]').click()
    await pending.page.waitForURL('**/login**')
    assert.equal(pending.mutations('/api/user/data').length, 2)
  } finally {
    await pending.close()
  }
  const provider = await fixture({
    profile: {
      provider: 'google',
      canChangePassword: false,
      recentlyAuthenticated: false
    }
  })
  try {
    await provider.open()
    await openDelete(provider)
    assert.equal(await provider.page.locator('#delete-password').count(), 0)
    await provider.page
      .locator('#delete-confirmation')
      .fill('alex@example.invalid')
    assert.equal(
      await provider.page.locator('[data-settings-delete-submit]').isDisabled(),
      true
    )
    await provider.page
      .getByRole('button', { name: 'Sign in again', exact: true })
      .click()
    await provider.page
      .getByText('Synthetic Google identity boundary', { exact: true })
      .waitFor()
    assert.equal(
      provider.calls.reauth[0].returnTo,
      '/dashboard/settings#privacy-title'
    )
    assert.equal(provider.mutations('/api/user/data').length, 0)
  } finally {
    await provider.close()
  }
  const expired = await fixture({
    profile: {
      provider: 'google',
      canChangePassword: false,
      recentlyAuthenticated: true
    },
    expiredGoogleAuth: true
  })
  try {
    await expired.open()
    await openDelete(expired)
    await expired.page
      .locator('#delete-confirmation')
      .fill('alex@example.invalid')
    await expired.page.locator('[data-settings-delete-submit]').click()
    await expired.page
      .getByRole('button', { name: 'Sign in again', exact: true })
      .waitFor()
    assert.equal(
      await expired.page.locator('[data-settings-delete-submit]').isDisabled(),
      true
    )
    assert.equal(await expired.page.locator('#delete-password').count(), 0)
    assert.equal(
      await expired.page.locator('#delete-confirmation').inputValue(),
      'alex@example.invalid'
    )
    assert.equal(expired.mutations('/api/user/data').length, 1)
  } finally {
    await expired.close()
  }
  const recent = await fixture({
    profile: {
      provider: 'google',
      canChangePassword: false,
      recentlyAuthenticated: true,
      deletionPending: true
    }
  })
  try {
    await recent.open()
    await openDelete(recent)
    await recent.page
      .locator('#delete-confirmation')
      .fill('alex@example.invalid')
    await recent.page.locator('[data-settings-delete-submit]').click()
    await recent.page.waitForURL('**/login**')
    assert.equal(
      recent.mutations('/api/user/data')[0].payload.currentPassword,
      undefined
    )
  } finally {
    await recent.close()
  }
  const signout = await fixture({ hold: ['logout'], failures: { logout: 1 } })
  try {
    await signout.open()
    await openSignOut(signout)
    await signOutDialog(signout)
      .getByRole('button', { name: 'Sign out', exact: true })
      .click()
    assert.equal(signout.calls.logout, 1)
    signout.release('logout')
    await signout.page.getByRole('alert').first().waitFor()
    const dialog = signOutDialog(signout)
    if (await dialog.isVisible())
      await dialog
        .getByRole('button', { name: 'Sign out', exact: true })
        .click()
    else
      await signout.page
        .getByRole('button', { name: /Try again|Retry/ })
        .click()
    await signout.page.waitForURL('**/login**')
    assert.equal(signout.calls.logout, 2)
  } finally {
    await signout.close()
  }
  console.log(
    'Credential/provider deletion validation/subscription/error/retry/pending locks, incomplete cleanup retry and sign-out focus/cancel/error/retry passed'
  )
}

async function retryAndResponsive() {
  const retry = await fixture({ failures: { profileRead: Infinity } })
  try {
    await retry.open({ wait: false })
    await retry.page.locator('[data-settings-initial="error"]').waitFor()
    await rememberShell(retry.page)
    retry.fail('profileRead', 0)
    await retry.page
      .getByRole('button', { name: 'Try again', exact: true })
      .click()
    await retry.page.locator('[data-settings-section="account"]').waitFor()
    await assertShell(retry.page)
  } finally {
    await retry.close()
  }
  for (const [name, viewport, light] of [
    ['small-mobile', { width: 320, height: 740 }, false],
    ['tablet', { width: 900, height: 1100 }, false],
    ['desktop-light', { width: 1488, height: 1058 }, true]
  ]) {
    const f = await fixture({ viewport, light })
    try {
      await f.open()
      for (const section of [
        'account',
        'profile',
        'security',
        'connections',
        'notifications',
        'preferences',
        'privacy'
      ]) {
        await pick(f, section)
        await noOverflow(f.page, `${name}-${section}`)
      }
      await capture(f, `${name}-privacy`)
      await openDelete(f)
      await noOverflow(f.page, `${name}-delete`)
    } finally {
      await f.close()
    }
  }
  console.log(
    'Initial retry preserves shell; every section and deletion dialog fit320px/tablet/light layouts'
  )
}

async function secondaryResourcesAndLocale() {
  const f = await fixture({
    failures: { settingsRead: Infinity, connectionsRead: Infinity }
  })
  try {
    await f.open()
    await pick(f, 'profile')
    await f.page.locator('#name').fill('Keep this local draft')
    const selectUnavailable = async (section) => {
      await f.page.locator(`[data-settings-nav="${section}"]`).click()
      await f.workspace.getByRole('alert').filter({ visible: true }).waitFor()
    }
    await selectUnavailable('preferences')
    assert.equal(
      await f.page.locator('#settings-clips').count(),
      0,
      'Unavailable settings never invent defaults'
    )
    f.fail('settingsRead', 0)
    await f.workspace
      .getByRole('button', { name: /Retry|Try again/ })
      .filter({ visible: true })
      .first()
      .click()
    await panel(f, 'preferences').waitFor()
    await selectUnavailable('connections')
    assert.equal(await f.page.locator('[data-settings-provider]').count(), 0)
    f.fail('connectionsRead', 0)
    await f.workspace
      .getByRole('button', { name: /Retry|Try again/ })
      .filter({ visible: true })
      .first()
      .click()
    await f.page.locator('[data-settings-provider="instagram"]').waitFor()
    await pick(f, 'profile')
    assert.equal(
      await f.page.locator('#name').inputValue(),
      'Keep this local draft'
    )
    await beginMfa(f)
    await f.page.locator('#mfa-confirm-code').fill('123456')
    f.fail('mfa-enable')
    await f.page.locator('[data-settings-mfa-enable]').click()
    await panel(f, 'security').getByRole('alert').waitFor()
    assert.equal(
      await f.page.locator('#mfa-confirm-code').inputValue(),
      '123456'
    )
    await f.page.locator('[data-settings-mfa-enable]').click()
    await f.page.locator('[data-settings-security-view="recovery"]').waitFor()
    assert.equal(f.mutations('/api/user/mfa/enable').length, 2)
  } finally {
    await f.close()
  }
  const empty = await fixture({
    settings: { sessions: [], exports: [], securityEvents: [] }
  })
  try {
    await empty.open()
    await pick(empty, 'privacy')
    assert.equal(
      await empty.page
        .locator('[data-settings-export-history] tbody tr')
        .count(),
      0
    )
    assert.match(
      await empty.page.locator('[data-settings-export-history]').innerText(),
      /No .*export/i
    )
    await capture(empty, 'desktop-empty-export-history')
  } finally {
    await empty.close()
  }
  const locale = await fixture({ failures: { preferences: 1 } })
  try {
    await locale.open()
    await pick(locale, 'preferences')
    await locale.page.locator('#settings-locale').click()
    await locale.page
      .getByRole('option', { name: 'Română', exact: true })
      .click()
    assert.equal(new URL(locale.page.url()).pathname, '/dashboard/settings')
    await panel(locale, 'preferences')
      .locator('[data-settings-preferences-save]')
      .click()
    await panel(locale, 'preferences').getByRole('alert').waitFor()
    assert.equal(
      new URL(locale.page.url()).pathname,
      '/dashboard/settings',
      'Failed locale save preserves current route'
    )
    await panel(locale, 'preferences')
      .locator('[data-settings-preferences-save]')
      .click()
    await locale.page.waitForURL('**/ro/dashboard/settings')
    await locale.workspace.waitFor()
    await noOverflow(locale.page, 'Romanian Settings')
    await capture(locale, 'desktop-romanian')
  } finally {
    await locale.close()
  }
  console.log(
    'Secondary settings/connections read error/retry, empty history, MFA failure/retry and locale apply only after save passed'
  )
}

async function restoreSourceTimes(path, metadata) {
  if (process.platform === 'win32') {
    // .NET DateTime ticks preserve NTFS's 100 ns precision. Passing JS Date to
    // fs.utimes would truncate sub-millisecond timestamp information.
    const epochTicks = 621355968000000000n
    const accessTicks = epochTicks + metadata.atimeNs / 100n
    const writeTicks = epochTicks + metadata.mtimeNs / 100n
    const literalPath = fileURLToPath(path).replaceAll("'", "''")
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$probeFile = Get-Item -LiteralPath '${literalPath}'; $probeFile.LastAccessTimeUtc = [DateTime]::new(${accessTicks}L, [DateTimeKind]::Utc); $probeFile.LastWriteTimeUtc = [DateTime]::new(${writeTicks}L, [DateTimeKind]::Utc)`
      ],
      { encoding: 'utf8', windowsHide: true }
    )
    assert.equal(result.status, 0, result.stderr)
    const restored = await stat(path, { bigint: true })
    assert.equal(
      restored.mtimeNs,
      metadata.mtimeNs,
      'Source write timestamp restored exactly'
    )
    assert.equal(
      restored.atimeNs,
      metadata.atimeNs,
      'Source access timestamp restored exactly'
    )
  } else {
    await utimes(
      path,
      Number(metadata.atimeNs) / 1e9,
      Number(metadata.mtimeNs) / 1e9
    )
  }
}

async function shellAndFastRefresh() {
  const f = await fixture()
  try {
    await f.open()
    await f.page
      .locator('[data-sidebar="trigger"]')
      .filter({ visible: true })
      .first()
      .click()
    await rememberShell(f.page)
    await pick(f, 'profile')
    await f.page.locator('#name').fill('Unsaved Fast Refresh profile')
    await pick(f, 'notifications')
    await f.page.locator('[data-settings-switch="emailMarketing"]').click()
    await pick(f, 'profile')
    await assertShell(f.page)
    if (process.env.RUN_FAST_REFRESH === '1') {
      const sourcePath = new URL(
        '../src/components/settings/settings-profile-panel.tsx',
        import.meta.url
      )
      const source = await readFile(sourcePath),
        metadata = await stat(sourcePath, { bigint: true })
      const text = source.toString('utf8'),
        anchor = 'data-settings-profile-save',
        marker =
          'data-settings-refresh-probe="updated" data-settings-profile-save'
      assert.equal(text.split(anchor).length, 2, 'Fast Refresh anchor unique')
      const reads = f.calls.profileReads + f.calls.settingsReads
      try {
        await writeFile(sourcePath, text.replace(anchor, marker))
        await f.page
          .locator('[data-settings-refresh-probe="updated"]')
          .waitFor()
        await assertShell(f.page)
        assert.equal(
          await f.page.locator('#name').inputValue(),
          'Unsaved Fast Refresh profile'
        )
        await pick(f, 'notifications')
        assert.equal(
          await f.page
            .locator('[data-settings-switch="emailMarketing"]')
            .getAttribute('aria-checked'),
          'true'
        )
        assert.equal(
          f.calls.profileReads + f.calls.settingsReads,
          reads,
          'Fast Refresh does not reload/refetch Settings'
        )
      } finally {
        try {
          await writeFile(sourcePath, source)
          await f.page
            .locator('[data-settings-refresh-probe]')
            .waitFor({ state: 'detached' })
          assert.deepEqual(await readFile(sourcePath), source)
        } finally {
          await restoreSourceTimes(sourcePath, metadata)
        }
      }
      sourceRestorationVerified = true
      fastRefreshVerified = true
    } else
      console.log(
        'SKIPPED source Fast Refresh probe; RUN_FAST_REFRESH=1 after concurrent builds finish'
      )
    await f.page
      .locator('[data-slot="sidebar"] a[href="/dashboard/publish"]')
      .filter({ visible: true })
      .first()
      .click()
    await f.page.waitForURL('**/dashboard/publish')
    await assertShell(f.page)
    await f.page
      .locator('[data-slot="sidebar"] a[href="/dashboard/settings"]')
      .filter({ visible: true })
      .first()
      .click()
    await f.workspace.waitFor()
    await assertShell(f.page)
  } finally {
    await f.close()
  }
  console.log(
    'Dashboard DOM identity/sidebar state preserved through local section and route navigation'
  )
}

try {
  await mkdir(output, { recursive: true })
  const group = process.env.SETTINGS_GROUP || 'all'
  const runs = (name) => group === 'all' || group.split(',').includes(name)
  if (runs('references') && process.env.SKIP_REFERENCE !== '1')
    await referenceStates()
  if (runs('profile')) await profileAndPassword()
  if (runs('security')) await preferencesAndSecurity()
  if (runs('connections')) await connectionsAndPrivacy()
  if (runs('delete')) await deletionAndSignOut()
  if (runs('responsive')) await retryAndResponsive()
  if (runs('resources')) await secondaryResourcesAndLocale()
  if (runs('shell')) await shellAndFastRefresh()
  assert.deepEqual(runtimeErrors, [])
  assert.deepEqual(unexpectedMutations, [])
  await writeFile(
    new URL('summary.json', output),
    JSON.stringify(
      {
        groups: group,
        screenshots: reports,
        availableScreenshots: (await readdir(output))
          .filter((name) => name.endsWith('.png'))
          .sort(),
        fastRefreshVerified,
        sourceRestorationVerified,
        runtimeErrors,
        unexpectedMutations,
        fixtureOnly: true
      },
      null,
      2
    )
  )
  console.log(
    `All synthetic Settings browser checks passed; ${reports.length} captures; Fast Refresh=${fastRefreshVerified}`
  )
} finally {
  await browser.close()
}
