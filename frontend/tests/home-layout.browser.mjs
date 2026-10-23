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

// Start Vite separately. Every authenticated read and every mutation is handled
// by this fixture. No application database, real identity or media is touched.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE')
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const output = new URL('../test-results/home-layout/', import.meta.url)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const runtimeErrors = [],
  blockedMutations = [],
  reports = []
let fastRefreshVerified = false,
  sourceRestorationVerified = false
const identity = {
  id: '00000000-0000-4000-8000-000000001031',
  email: 'home-layout@example.invalid',
  name: 'Alex Morgan',
  profile_pic: null,
  credits: 360,
  plan: 'pro',
  access_role: 'member'
}
const titles = [
  'Inside the creative studio',
  'A better morning routine',
  'A different perspective',
  'Make the next cut count',
  'An unseen fifth recent clip',
  'An unseen sixth recent clip'
]
function thumbnail(index) {
  const colors = [
    '#dfac68',
    '#b28b60',
    '#e8b796',
    '#8dafa5',
    '#b393bf',
    '#7395b6'
  ]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${colors[index]}"/><stop offset="1" stop-color="#3f4645"/></linearGradient></defs><rect width="360" height="640" fill="#232724"/><rect x="20" y="30" width="320" height="470" fill="url(#sky)"/><circle cx="244" cy="230" r="55" fill="#ffe6ab" opacity=".8"/><path d="M0 440 60 365 120 400 240 300 360 390v250H0Z" fill="#415350"/><path d="M15 30v480M175 30v480M345 30v480" stroke="#2c332f" stroke-width="12"/><path d="M25 520h310M70 520v120M290 520v120" stroke="#684c35" stroke-width="15"/><rect x="140" y="443" width="86" height="60" fill="#2b3637"/><path d="M38 580v-90q-42-65-37-20 10 34 37 50 35-75 60-50-10 30-60 60" fill="#29463c"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
function dashboard(overrides = {}) {
  return {
    metrics: {
      clipCount: 24,
      jobCount: 6,
      durationMinutes: 18,
      credits: 360,
      creditsUnlimited: false,
      plan: 'pro',
      activity: [],
      statuses: {}
    },
    recentClips: titles.map((title, index) => ({
      id: `00000000-0000-4000-8000-${String(1040 + index).padStart(12, '0')}`,
      title,
      duration: [28, 42, 35, 47, 12, 19][index],
      viralScore: [8.7, 8.3, 7.9, 0, -1, 0][index],
      thumbnailUrl: thumbnail(index),
      fileUrl: null,
      resolution: '1080 × 1920',
      aspectRatio: '9:16',
      hasSubtitles: false,
      createdAt: '2026-10-23T09:00:00Z'
    })),
    ...overrides
  }
}
const settings = {
  preferences: {
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
  },
  sessions: [],
  mfa: { enabled: false },
  securityEvents: [],
  exports: []
}
async function fixture(initial = dashboard(), options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1488, height: 1058 },
    timezoneId: 'Europe/Bucharest',
    colorScheme: options.light ? 'light' : 'dark',
    reducedMotion: 'reduce'
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
  const calls = { reads: 0, auth: 0 }
  let current = structuredClone(initial),
    failRead = options.failRead || false
  let releaseRead
  const readGate = new Promise((resolve) => {
    releaseRead = resolve
  })
  await context.route('**/v1/**', (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    if (path !== '/v1/auth/refresh') {
      blockedMutations.push(`${request.method()} ${path}`)
      return route.fulfill({
        status: 405,
        json: { error: 'Unexpected fixture auth request' }
      })
    }
    calls.auth += 1
    return route.fulfill({
      json: {
        access_token: 'synthetic-home-token',
        user: { ...identity, ...options.user }
      }
    })
  })
  await context.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    if (request.method() !== 'GET') {
      blockedMutations.push(`${request.method()} ${path}`)
      return route.fulfill({
        status: 405,
        json: { error: 'Unexpected fixture mutation' }
      })
    }
    if (path === '/api/dashboard') {
      calls.reads += 1
      if (options.holdInitial && calls.reads === 1) await readGate
      if (failRead)
        return route.fulfill({
          status: 503,
          json: { error: 'Synthetic Home read failure' }
        })
      return route.fulfill({ json: current })
    }
    const responses = {
      '/api/user/profile': {
        profile: {
          ...identity,
          image: null,
          provider: 'credentials',
          canChangePassword: true,
          recentlyAuthenticated: true,
          emailVerified: '2026-10-01T09:00:00Z',
          createdAt: '2026-10-01T09:00:00Z'
        }
      },
      '/api/user/settings': settings,
      '/api/projects': { projects: [] },
      '/api/publishing': { providers: [], accounts: [], clips: [], posts: [] },
      '/api/calendar': { posts: [], clips: [] },
      '/api/user/brand': { brandKit: {} },
      '/api/workspace-agent/runs': { runs: [], has_more: false },
      '/api/workspace-agent/suggestions': { suggestions: [], capabilities: [] },
      '/api/stripe/billing': {
        account: { credits: 360, plan: 'pro', hasBillingProfile: true },
        subscription: null,
        invoices: [],
        providerAvailable: true
      },
      '/api/stripe/plans': {
        creator: { amount: 1900, currency: 'EUR' },
        pro: { amount: 4900, currency: 'EUR' },
        agency: { amount: 14900, currency: 'EUR' }
      }
    }
    return route.fulfill({ json: responses[path] || {} })
  })
  await context.route('**/__home-fixture__/broken.jpg', (route) =>
    route.fulfill({ status: 404, body: '' })
  )
  return {
    page,
    context,
    calls,
    workspace: page.locator('[data-home-workspace]'),
    release: () => releaseRead(),
    fail: (value) => {
      failRead = value
    },
    setData: (value) => {
      current = structuredClone(value)
    },
    async open(wait = true) {
      await page.goto(
        `${origin}/${options.locale === 'ro' ? 'ro/' : ''}dashboard`,
        {
          waitUntil: options.holdInitial ? 'domcontentloaded' : 'networkidle'
        }
      )
      if (wait) await page.locator('[data-home-new-clip]').waitFor()
    },
    async close() {
      releaseRead()
      await context.close()
    }
  }
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
async function dock(page, visible) {
  const element = page.locator('[data-mobile-dashboard-dock]')
  assert.equal(await element.isVisible(), visible)
  if (!visible) return
  assert.equal(await element.locator('a').count(), 6)
  assert.equal(await element.locator('button').count(), 1)
  const expected = [
    'Home',
    'Video editor',
    'Clips',
    'New project',
    'Brand kit',
    'Publish'
  ]
  const names = await element
    .locator('a')
    .evaluateAll((elements) =>
      elements.map((el) => el.getAttribute('aria-label'))
    )
  for (let index = 0; index < names.length; index++)
    assert.ok(names[index], `Dock item ${index} has an accessible name`)
  assert.deepEqual(
    await element
      .locator('a')
      .evaluateAll((elements) => elements.map((el) => el.getAttribute('href'))),
    [
      '/dashboard',
      '/dashboard/studio',
      '/dashboard/clips',
      '/dashboard/create',
      '/dashboard/brand',
      '/dashboard/publish'
    ]
  )
  assert.equal(
    await element.locator('[aria-current="page"]').getAttribute('href'),
    '/dashboard'
  )
  assert.ok(expected.length === names.length)
}
async function capture(f, name, fullPage = true) {
  await f.page.evaluate(() => window.scrollTo(0, 0))
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
    window.homeShellProbe = {
      document,
      shell: document.querySelector('#dashboard-shell'),
      main: document.querySelector('#dashboard-main'),
      header: document.querySelector('header.studio-topbar'),
      sidebar,
      state: sidebar?.getAttribute('data-state'),
      dock: document.querySelector('[data-mobile-dashboard-dock]')
    }
    if (
      !window.homeShellProbe.shell ||
      (!sidebar && innerWidth >= 1024) ||
      !window.homeShellProbe.main ||
      !window.homeShellProbe.header ||
      !window.homeShellProbe.dock
    )
      throw new Error('Missing dashboard shell')
  })
}
async function assertShell(page) {
  assert.equal(
    await page.evaluate(() => {
      const p = window.homeShellProbe,
        sidebar = document.querySelector('[data-slot="sidebar"]')
      return (
        p.document === document &&
        p.shell === document.querySelector('#dashboard-shell') &&
        p.main === document.querySelector('#dashboard-main') &&
        p.header === document.querySelector('header.studio-topbar') &&
        p.sidebar === sidebar &&
        p.state === sidebar?.getAttribute('data-state') &&
        p.dock === document.querySelector('[data-mobile-dashboard-dock]')
      )
    }),
    true,
    'Dashboard document/layout/header/sidebar/dock and sidebar state remain mounted'
  )
}
async function homeLinks(f) {
  assert.equal(
    await f.workspace.locator('[data-home-new-clip]').getAttribute('href'),
    '/dashboard/create'
  )
  assert.equal(
    await f.workspace.locator('[data-home-open-library]').getAttribute('href'),
    '/dashboard/clips'
  )
  for (const key of ['clips', 'projects', 'minutes'])
    assert.equal(
      await f.workspace
        .locator(`[data-home-stat="${key}"]`)
        .getAttribute('href'),
      '/dashboard/clips'
    )
  assert.equal(
    await f.workspace
      .locator('[data-home-stat="credits"]')
      .getAttribute('href'),
    '/dashboard/billing'
  )
  assert.equal(
    await f.workspace
      .getByRole('link', { name: 'View all', exact: true })
      .getAttribute('href'),
    '/dashboard/clips'
  )
  const data = dashboard()
  assert.deepEqual(
    await f.workspace
      .locator('[data-home-clip]')
      .evaluateAll((elements) => elements.map((el) => el.getAttribute('href'))),
    data.recentClips.slice(0, 4).map((clip) => `/dashboard/clips/${clip.id}`)
  )
  assert.equal(
    await f.workspace.locator('video, [data-home-clip] button').count(),
    0,
    'Home cards contain no inline player or secondary actions'
  )
}
async function referenceStates() {
  for (const device of process.env.HOME_DEVICE
    ? [process.env.HOME_DEVICE]
    : ['desktop', 'mobile']) {
    const viewport =
      device === 'desktop'
        ? { width: 1488, height: 1058 }
        : { width: 390, height: 844 }
    for (const state of process.env.HOME_STATES?.split(',') || [
      'overview',
      'empty',
      'zero-credits',
      'unlimited',
      'missing-preview',
      'loading',
      'load-error',
      'navigation'
    ]) {
      const data = dashboard()
      if (state === 'empty') {
        data.metrics.clipCount = 0
        data.metrics.jobCount = 0
        data.metrics.durationMinutes = 0
        data.recentClips = []
      }
      if (state === 'zero-credits') data.metrics.credits = 0
      if (state === 'unlimited') data.metrics.creditsUnlimited = true
      if (state === 'missing-preview') data.recentClips[0].thumbnailUrl = null
      const f = await fixture(data, {
        viewport,
        holdInitial: state === 'loading',
        failRead: state === 'load-error'
      })
      try {
        await f.open(!['loading', 'load-error'].includes(state))
        if (state === 'loading' || state === 'load-error') {
          await f.page
            .locator(
              `[data-home-initial="${state === 'loading' ? 'loading' : 'error'}"]`
            )
            .waitFor()
          await dock(f.page, device === 'mobile')
          assert.equal(
            await f.page.locator('[data-home-refresh-anchor]').count(),
            0,
            'Initial state contains no assumed Home data'
          )
          assert.equal(
            await f.page
              .locator(
                '[data-home-stat], [data-home-clip], [data-home-new-clip]'
              )
              .count(),
            0
          )
          await capture(f, `${device}-${state}`, false)
          f.fail(false)
          f.release()
          if (state === 'load-error')
            await f.page
              .getByRole('button', { name: 'Try again', exact: true })
              .click()
          await f.workspace.locator('[data-home-new-clip]').waitFor()
        } else {
          await dock(f.page, device === 'mobile')
          if (state === 'empty') {
            await f.workspace.locator('[data-home-empty]').waitFor()
            assert.equal(
              await f.workspace.locator('[data-home-clip]').count(),
              0
            )
            assert.match(
              await f.workspace
                .locator('[data-home-stat="credits"]')
                .innerText(),
              /360/
            )
          } else {
            assert.equal(
              await f.workspace.locator('[data-home-clip]').count(),
              4
            )
            assert.equal(
              await f.workspace.locator('[data-home-recent-count]').innerText(),
              '6'
            )
          }
          if (state === 'overview') {
            await homeLinks(f)
            for (const [key, value] of [
              ['clips', '24'],
              ['projects', '6'],
              ['minutes', '18'],
              ['credits', '360']
            ])
              assert.match(
                await f.workspace
                  .locator(`[data-home-stat="${key}"]`)
                  .innerText(),
                new RegExp(value)
              )
            const cards = f.workspace.locator('[data-home-clip]')
            for (let i = 0; i < 4; i++) {
              assert.match(
                await cards.nth(i).innerText(),
                new RegExp(titles[i])
              )
              assert.match(
                await cards.nth(i).innerText(),
                new RegExp(['00:28', '00:42', '00:35', '00:47'][i])
              )
              assert.match(await cards.nth(i).innerText(), /1080 × 1920/)
            }
            assert.match(await cards.nth(0).innerText(), /8.7\/10/)
            assert.doesNotMatch(await cards.nth(3).innerText(), /Score|\/10/)
          }
          if (state === 'zero-credits') {
            assert.match(
              await f.workspace
                .locator('[data-home-stat="credits"]')
                .innerText(),
              /\b0\b/
            )
            assert.equal(
              await f.workspace
                .locator('[data-home-new-clip]')
                .getAttribute('aria-disabled'),
              null
            )
            assert.equal(
              await f.workspace
                .locator('[data-home-new-clip]')
                .getAttribute('href'),
              '/dashboard/create'
            )
          }
          if (state === 'unlimited')
            assert.match(
              await f.workspace
                .locator('[data-home-stat="credits"]')
                .innerText(),
              /∞/
            )
          if (state === 'missing-preview')
            await f.workspace
              .locator('[data-home-clip]')
              .first()
              .getByText('No preview', { exact: true })
              .waitFor()
          if (state === 'navigation') {
            if (device === 'desktop') {
              await f.page.keyboard.press('Control+k')
              const dialog = f.page.getByRole('dialog', {
                name: 'Quick navigation',
                exact: true
              })
              await dialog
                .getByRole('textbox', { name: 'Quick navigation', exact: true })
                .fill('set')
              assert.equal(await dialog.getByRole('link').count(), 1)
              assert.equal(
                await dialog
                  .getByRole('link', { name: 'Settings', exact: true })
                  .getAttribute('href'),
                '/dashboard/settings'
              )
            } else {
              await f.page.locator('[data-mobile-menu-trigger]').click()
              const menu = f.page.locator('[data-mobile-menu-dialog]')
              await menu.waitFor()
              assert.equal(await menu.getByRole('link').count(), 3)
              assert.deepEqual(
                await menu
                  .getByRole('link')
                  .evaluateAll((elements) =>
                    elements.map((el) => el.getAttribute('href'))
                  ),
                [
                  '/dashboard/script-generator',
                  '/dashboard/billing',
                  '/dashboard/settings'
                ]
              )
            }
          }
          await capture(f, `${device}-${state}`, state !== 'navigation')
        }
      } finally {
        await f.close()
      }
    }
  }
  console.log(
    'Home reference states, metadata, first four of six, links, loading/error retry and dock visibility passed'
  )
}
async function dataEdges() {
  for (const [name, flag, admin, expected] of [
    ['explicit-unlimited', true, false, '∞'],
    ['explicit-finite-admin', false, true, '360'],
    ['admin-fallback', undefined, true, '∞'],
    ['member-fallback', undefined, false, '360']
  ]) {
    const data = dashboard()
    if (flag === undefined) delete data.metrics.creditsUnlimited
    else data.metrics.creditsUnlimited = flag
    const f = await fixture(data, {
      user: { access_role: admin ? 'admin' : 'member' }
    })
    try {
      await f.open()
      assert.match(
        await f.workspace.locator('[data-home-stat="credits"]').innerText(),
        new RegExp(expected),
        name
      )
    } finally {
      await f.close()
    }
  }
  const data = dashboard()
  data.recentClips[0].thumbnailUrl = `${origin}/__home-fixture__/broken.jpg`
  data.recentClips[1].viralScore = -3
  const f = await fixture(data)
  try {
    await f.open()
    await f.workspace
      .locator('[data-home-clip]')
      .first()
      .getByText('No preview', { exact: true })
      .waitFor()
    assert.doesNotMatch(
      await f.workspace.locator('[data-home-clip]').nth(1).innerText(),
      /Score|\/10/
    )
    await capture(f, 'desktop-broken-thumbnail')
    f.fail(true)
    await f.page.evaluate(async () => {
      const { queryClient } = await import('/src/query/query-client.ts')
      await queryClient.invalidateQueries({
        queryKey: ['api-resource', '/api/dashboard']
      })
    })
    assert.equal(f.calls.reads, 2)
    await f.workspace.waitFor()
    assert.equal(await f.page.locator('[data-home-initial]').count(), 0)
    assert.equal(await f.workspace.locator('[data-home-clip]').count(), 4)
    console.log(
      'Explicit unlimited/admin fallback, broken-image fallback, nonpositive score and stale-data refresh failure passed'
    )
  } finally {
    await f.close()
  }
}
async function navigation() {
  const desktop = await fixture()
  try {
    await desktop.open()
    await desktop.page
      .locator('[data-sidebar="trigger"]')
      .filter({ visible: true })
      .first()
      .click()
    await rememberShell(desktop.page)
    await desktop.page.keyboard.press('Control+k')
    const dialog = desktop.page.getByRole('dialog', {
      name: 'Quick navigation',
      exact: true
    })
    await dialog.getByRole('textbox').fill('set')
    await dialog.getByRole('link', { name: 'Settings', exact: true }).click()
    await desktop.page.waitForURL('**/dashboard/settings')
    await desktop.page.locator('[data-settings-workspace]').waitFor()
    await assertShell(desktop.page)
    await desktop.page
      .locator('[data-slot="sidebar"] a[href="/dashboard"]')
      .filter({ visible: true })
      .first()
      .click()
    await desktop.workspace.waitFor()
    await assertShell(desktop.page)
    await desktop.workspace.locator('[data-home-stat="credits"]').click()
    await desktop.page.waitForURL('**/dashboard/billing')
    await assertShell(desktop.page)
    await desktop.page.goBack()
    await desktop.workspace.waitFor()
    for (const selector of [
      '[data-home-new-clip]',
      '[data-home-open-library]',
      '[data-home-stat="clips"]',
      '[data-home-stat="projects"]',
      '[data-home-stat="minutes"]'
    ]) {
      const target = await desktop.workspace
        .locator(selector)
        .getAttribute('href')
      await desktop.workspace.locator(selector).click()
      await desktop.page.waitForURL((url) => url.pathname === target)
      await assertShell(desktop.page)
      await desktop.page.goBack()
      await desktop.workspace.waitFor()
    }
  } finally {
    await desktop.close()
  }
  const mobile = await fixture(dashboard(), {
    viewport: { width: 390, height: 844 }
  })
  try {
    await mobile.open()
    await rememberShell(mobile.page)
    const trigger = mobile.page.locator('[data-mobile-menu-trigger]'),
      menu = mobile.page.locator('[data-mobile-menu-dialog]')
    for (const close of ['x', 'dock', 'outside', 'escape']) {
      await trigger.click()
      await menu.waitFor()
      assert.equal(
        await mobile.page.evaluate(
          () => getComputedStyle(document.body).overflow
        ),
        'hidden'
      )
      assert.equal(
        await mobile.page
          .locator('[data-mobile-menu-close]')
          .evaluate((el) => el === document.activeElement),
        true
      )
      await mobile.page.keyboard.press('Shift+Tab')
      assert.equal(
        await menu.evaluate((el) => el.contains(document.activeElement)),
        true,
        'Menu traps keyboard focus'
      )
      if (close === 'x')
        await mobile.page.locator('[data-mobile-menu-close]').click()
      if (close === 'dock') await trigger.click()
      if (close === 'outside') await mobile.page.mouse.click(5, 5)
      if (close === 'escape') await mobile.page.keyboard.press('Escape')
      await menu.waitFor({ state: 'detached' })
      assert.notEqual(
        await mobile.page.evaluate(
          () => getComputedStyle(document.body).overflow
        ),
        'hidden'
      )
      assert.equal(
        await trigger.evaluate((el) => el === document.activeElement),
        true,
        'Menu restores trigger focus'
      )
      await assertShell(mobile.page)
    }
    for (const [name, target] of [
      ['Scripts', '/dashboard/script-generator'],
      ['Plan & billing', '/dashboard/billing'],
      ['Settings', '/dashboard/settings']
    ]) {
      await trigger.click()
      await menu.getByRole('link', { name, exact: true }).click()
      await mobile.page.waitForURL((url) => url.pathname === target)
      await menu.waitFor({ state: 'detached' })
      assert.notEqual(
        await mobile.page.evaluate(
          () => getComputedStyle(document.body).overflow
        ),
        'hidden'
      )
      await assertShell(mobile.page)
      // These routes intentionally substitute their mobile header; Home restores
      // the original dock DOM element through the preserved dashboard layout.
      await mobile.page.goBack()
      await mobile.workspace.locator('[data-home-new-clip]').waitFor()
      await dock(mobile.page, true)
      await assertShell(mobile.page)
    }
    await trigger.click()
    await menu.waitFor()
    await mobile.page.setViewportSize({ width: 1100, height: 844 })
    await menu.waitFor({ state: 'detached' })
    assert.notEqual(
      await mobile.page.evaluate(
        () => getComputedStyle(document.body).overflow
      ),
      'hidden',
      'Resizing to desktop closes the mobile modal and restores scrolling'
    )
  } finally {
    await mobile.close()
  }
  console.log(
    'Desktop page search, all Home action/statistic destinations, mobile Menu close/focus/scroll and persistent dashboard shell passed'
  )
}
async function responsive() {
  for (const width of process.env.HOME_WIDTHS?.split(',').map(Number) || [
    320, 375, 768, 1024
  ]) {
    const f = await fixture(dashboard(), { viewport: { width, height: 900 } })
    try {
      await f.open()
      await noOverflow(f.page, `Home ${width}`)
      await dock(f.page, width < 1024)
      await capture(f, `responsive-${width}`)
    } finally {
      await f.close()
    }
  }
  for (const options of process.env.HOME_APPEARANCE === '0'
    ? []
    : [{ light: true }, { locale: 'ro' }]) {
    const f = await fixture(dashboard(), options)
    try {
      await f.open()
      await noOverflow(f.page, options.light ? 'Light Home' : 'Romanian Home')
      await capture(f, options.light ? 'desktop-light' : 'desktop-romanian')
    } finally {
      await f.close()
    }
  }
}
async function restoreSourceTimes(path, metadata) {
  if (process.platform === 'win32') {
    const epochTicks = 621355968000000000n
    const accessTicks = epochTicks + metadata.atimeNs / 100n
    const writeTicks = epochTicks + metadata.mtimeNs / 100n
    const literal = fileURLToPath(path).replaceAll("'", "''")
    let restored
    for (let attempt = 0; attempt < 5; attempt++) {
      // Restoring mtime can trigger another Vite read. Retry only atime once
      // mtime matches, so verification never creates a new write-watch event.
      const result = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `$probePath = '${literal}'; if ([IO.File]::GetLastWriteTimeUtc($probePath).Ticks -ne ${writeTicks}L) { [IO.File]::SetLastWriteTimeUtc($probePath, [DateTime]::new(${writeTicks}L, [DateTimeKind]::Utc)) }; [IO.File]::SetLastAccessTimeUtc($probePath, [DateTime]::new(${accessTicks}L, [DateTimeKind]::Utc))`
        ],
        { encoding: 'utf8', windowsHide: true }
      )
      assert.equal(result.status, 0, result.stderr)
      restored = await stat(path, { bigint: true })
      if (
        restored.mtimeNs === metadata.mtimeNs &&
        restored.atimeNs === metadata.atimeNs
      )
        break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
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
  } else
    await utimes(
      path,
      Number(metadata.atimeNs) / 1e9,
      Number(metadata.mtimeNs) / 1e9
    )
}
async function fastRefresh() {
  if (process.env.RUN_FAST_REFRESH !== '1') {
    console.log(
      'SKIPPED source Fast Refresh probe until builds and Doctor finish'
    )
    return
  }
  const f = await fixture()
  try {
    await f.open()
    await f.page
      .locator('[data-sidebar="trigger"]')
      .filter({ visible: true })
      .first()
      .click()
    await rememberShell(f.page)
    await f.page.keyboard.press('Control+k')
    const dialog = f.page.getByRole('dialog', {
      name: 'Quick navigation',
      exact: true
    })
    await dialog.getByRole('textbox').fill('set')
    const sourcePath = new URL(
      '../src/components/dashboard/studio-hero.tsx',
      import.meta.url
    )
    const metadata = await stat(sourcePath, { bigint: true }),
      source = await readFile(sourcePath)
    const text = source.toString('utf8'),
      anchor = 'data-home-refresh-anchor',
      marker = 'data-home-refresh-probe="updated" data-home-refresh-anchor'
    assert.equal(text.split(anchor).length, 2, 'Fast Refresh anchor unique')
    const reads = f.calls.reads,
      auth = f.calls.auth
    try {
      await writeFile(sourcePath, text.replace(anchor, marker))
      await f.page
        .locator('[data-home-refresh-probe="updated"]')
        .waitFor({ state: 'attached' })
      await assertShell(f.page)
      assert.equal(
        await dialog.getByRole('textbox').inputValue(),
        'set',
        'Quick navigation draft survives component edit'
      )
      assert.equal(f.calls.reads, reads, 'Home data is not refetched')
      assert.equal(f.calls.auth, auth, 'Auth state is not reloaded')
    } finally {
      try {
        await writeFile(sourcePath, source)
        await f.page
          .locator('[data-home-refresh-probe]')
          .waitFor({ state: 'detached' })
        assert.deepEqual(await readFile(sourcePath), source)
      } finally {
        await restoreSourceTimes(sourcePath, metadata)
      }
    }
    fastRefreshVerified = true
    sourceRestorationVerified = true
  } finally {
    await f.close()
  }
  console.log(
    'Single-component Fast Refresh preserved document/layout/sidebar/search draft with exact source bytes and NTFS timestamp restoration'
  )
}
try {
  await mkdir(output, { recursive: true })
  const group = process.env.HOME_GROUP || 'all',
    runs = (name) => group === 'all' || group.split(',').includes(name)
  if (runs('references')) await referenceStates()
  if (runs('data')) await dataEdges()
  if (runs('navigation')) await navigation()
  if (runs('responsive')) await responsive()
  if (runs('refresh')) await fastRefresh()
  assert.deepEqual(runtimeErrors, [])
  assert.deepEqual(blockedMutations, [])
  await writeFile(
    new URL(`summary-${group.replaceAll(',', '-')}.json`, output),
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
        blockedMutations,
        fixtureOnly: true
      },
      null,
      2
    )
  )
  console.log(
    `All synthetic Home checks passed; ${reports.length} captures; Fast Refresh=${fastRefreshVerified}`
  )
} finally {
  await browser.close()
}
