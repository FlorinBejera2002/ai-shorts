import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { restoreSourceTimes } from './source-probe-helpers.mjs'

// Start Vite separately. Every authenticated read and every mutation is handled
// by this fixture. No application database, real identity or media is touched.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE')
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const output = new URL('../test-results/home-layout/', import.meta.url)
const messagesEn = JSON.parse(await readFile(new URL('../messages/en.json', import.meta.url), 'utf8'))
const messagesRo = JSON.parse(await readFile(new URL('../messages/ro.json', import.meta.url), 'utf8'))
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
const now = Date.now()
function history(overrides) {
  return overrides ?? [
    { id: '00000000-0000-4000-8000-000000001101', status: 'analyzing', progress: 64, sourceUrl: 'https://youtube.com/watch?v=abcdefghijk', sourceFilePath: null, createdAt: new Date(now - 600000).toISOString(), completedAt: null, _count: { clips: 0 } },
    { id: '00000000-0000-4000-8000-000000001102', status: 'completed', progress: 100, sourceUrl: null, sourceFilePath: 'uploads/autumn-recipes.mp4', createdAt: new Date(now - 86400000).toISOString(), completedAt: new Date(now - 82800000).toISOString(), _count: { clips: 6 } }
  ]
}
function upcomingPosts() {
  return [
    { id: '00000000-0000-4000-8000-000000001201', title: 'Morning routine teaser', status: 'scheduled', platforms: ['instagram'], accountIds: [], publishingDestinations: [], scheduledAt: new Date(now + 3600000).toISOString() },
    { id: '00000000-0000-4000-8000-000000001202', title: 'Studio tour', status: 'scheduled', platforms: ['tiktok'], accountIds: [], publishingDestinations: [], scheduledAt: new Date(now + 90000000).toISOString() }
  ]
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
      '/api/calendar': { posts: options.posts ?? upcomingPosts(), clips: [] },
      '/api/dashboard/history': { jobs: history(options.history) },
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
  assert.equal(await element.locator('a').count(), 4)
  assert.equal(await element.locator('button').count(), 1)
  const nav = (page.url().includes('/ro/') ? messagesRo : messagesEn).nav
  const expected = [nav.dockHome, nav.clips, nav.newProject, nav.publish]
  const names = await element
    .locator('a')
    .evaluateAll((elements) =>
      elements.map((el) => el.getAttribute('aria-label'))
    )
  assert.deepEqual(names, expected, 'Dock tab labels')
  assert.equal(await element.locator('button').getAttribute('aria-label'), nav.menu)
  assert.deepEqual(
    await element
      .locator('a')
      .evaluateAll((elements) => elements.map((el) => el.getAttribute('href'))),
    ['/dashboard', '/dashboard/clips', '/dashboard/create', '/dashboard/publish']
  )
  assert.equal(
    await element.locator('[aria-current="page"]').getAttribute('href'),
    '/dashboard'
  )
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
    await f.workspace.locator('[data-home-upload]').getAttribute('href'),
    '/dashboard/create?mode=upload'
  )
  assert.equal(
    await f.workspace.locator('[data-home-open-library]').getAttribute('href'),
    '/dashboard/clips'
  )
  assert.equal(
    await f.workspace.locator('[data-home-new-clip]').getAttribute('type'),
    'submit'
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
    data.recentClips.slice(0, 6).map((clip) => `/dashboard/clips/${clip.id}`)
  )
  assert.equal(
    await f.workspace.locator('video, [data-home-clip] button').count(),
    0,
    'Home cards contain no inline player or secondary actions'
  )
  assert.equal(await f.workspace.getByText(/credit/i).count(), 0, 'Home never shows credits')
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
      'idle',
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
      if (state === 'missing-preview') data.recentClips[0].thumbnailUrl = null
      const f = await fixture(data, {
        viewport,
        holdInitial: state === 'loading',
        failRead: state === 'load-error',
        history: state === 'idle' ? [] : undefined
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
            await f.workspace.locator('[data-home-hero="first-run"]').waitFor()
            assert.equal(await f.workspace.locator('[data-home-clip], [data-home-stat]').count(), 0)
            assert.equal(await f.workspace.locator('[data-home-start]').count(), 3)
            assert.match(await f.workspace.locator('[data-home-first-steps]').innerText(), /of 4/)
          } else {
            assert.equal(await f.workspace.locator('[data-home-clip]').count(), 6)
          }
          if (state === 'idle')
            await f.workspace.getByText('All caught up', { exact: true }).waitFor()
          if (state === 'overview') {
            await homeLinks(f)
            for (const [key, value] of [
              ['clips', '24'],
              ['projects', '6'],
              ['minutes', '18']
            ])
              assert.match(
                await f.workspace
                  .locator(`[data-home-stat="${key}"]`)
                  .innerText(),
                new RegExp(value)
              )
            const cards = f.workspace.locator('[data-home-clip]')
            for (let i = 0; i < 6; i++) {
              assert.match(await cards.nth(i).innerText(), new RegExp(titles[i]))
              assert.match(
                await cards.nth(i).innerText(),
                new RegExp(['0:28', '0:42', '0:35', '0:47', '0:12', '0:19'][i])
              )
              assert.doesNotMatch(await cards.nth(i).innerText(), /Score|\/10/)
            }
            const work = f.workspace.locator('[data-home-work-card]')
            assert.match(await work.locator('[data-home-work="running"]').innerText(), /64%/)
            assert.match(await work.locator('[data-home-work="done"]').innerText(), /6 clips ready/)
            const scheduled = f.workspace.locator('[data-home-scheduled]')
            assert.match(await scheduled.innerText(), /Morning routine teaser/)
            assert.match(await scheduled.innerText(), /Studio tour/)
          }
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
              assert.equal(await menu.getByRole('link').count(), 5)
              assert.deepEqual(
                await menu
                  .getByRole('link')
                  .evaluateAll((elements) =>
                    elements.map((el) => el.getAttribute('href'))
                  ),
                [
                  '/dashboard/studio',
                  '/dashboard/script-generator',
                  '/dashboard/brand',
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
    'Home reference states, work/scheduled cards, six recent clips, links, loading/error retry and dock visibility passed'
  )
}
async function dataEdges() {
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
    const failedRefresh = f.page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/dashboard' &&
        response.status() === 503
    )
    // A browser reconnect refetches stale resources in development and compiled
    // builds without relying on Vite-only source module imports.
    await f.page.evaluate(() => window.dispatchEvent(new Event('offline')))
    await f.page.evaluate(() => window.dispatchEvent(new Event('online')))
    await failedRefresh
    assert.equal(f.calls.reads, 2)
    await f.workspace.waitFor()
    assert.equal(await f.page.locator('[data-home-initial]').count(), 0)
    assert.equal(await f.workspace.locator('[data-home-clip]').count(), 6)
    console.log(
      'Broken-image fallback, hidden scores and stale-data refresh failure passed'
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
    const linkField = desktop.workspace.getByRole('textbox', { name: 'YouTube link', exact: true })
    await linkField.fill('not a link')
    await desktop.workspace.locator('[data-home-new-clip]').click()
    await desktop.workspace.getByRole('alert').waitFor()
    await linkField.fill('https://youtu.be/abcdefghijk')
    await desktop.workspace.locator('[data-home-new-clip]').click()
    await desktop.page.waitForURL(
      (url) =>
        url.pathname === '/dashboard/create' &&
        url.searchParams.get('mode') === 'youtube' &&
        url.searchParams.get('url') === 'https://youtu.be/abcdefghijk'
    )
    await assertShell(desktop.page)
    await desktop.page.goBack()
    await desktop.workspace.waitFor()
    for (const selector of ['[data-home-upload]', '[data-home-open-library]']) {
      const target = new URL(
        await desktop.workspace.locator(selector).getAttribute('href'),
        origin
      ).pathname
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
      ['Billing', '/dashboard/billing'],
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
    'Desktop page search, all Home action and clip destinations, mobile Menu close/focus/scroll and persistent dashboard shell passed'
  )
}
// Every link on Home goes where the canvas says, and each destination opens inside the same shell.
async function destinations() {
  const expected = {
    overview: [
      ['Upload', '/dashboard/create?mode=upload'],
      ['Write a script', '/dashboard/script-generator'],
      ['From my YouTube account', '/dashboard/create?mode=youtube&source=library'],
      ['My clips', '/dashboard/clips'],
      ['View', '/dashboard/clips'],
      ['Calendar', '/dashboard/publish'],
      ['Morning routine teaser', '/dashboard/publish/00000000-0000-4000-8000-000000001201/edit'],
      ['View all', '/dashboard/clips'],
      [titles[0], '/dashboard/clips/00000000-0000-4000-8000-000000001040']
    ],
    empty: [
      ['Upload videos', '/dashboard/create?mode=upload'],
      ['YouTube link', '/dashboard/create?mode=youtube'],
      ['Write a script', '/dashboard/script-generator'],
      ['Create your first clip', '/dashboard/create'],
      ['Set up your brand kit', '/dashboard/brand'],
      ['Connect your social accounts', '/dashboard/publish'],
      ['Schedule your first post', '/dashboard/publish/new']
    ]
  }
  for (const [state, links] of Object.entries(expected)) {
    const data = dashboard()
    if (state === 'empty') Object.assign(data, { metrics: { ...data.metrics, clipCount: 0, jobCount: 0, durationMinutes: 0 }, recentClips: [] })
    const f = await fixture(data)
    try {
      await f.open()
      await rememberShell(f.page)
      for (const [name, href] of links) {
        const link = f.workspace.getByRole('link', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()
        assert.equal(await link.getAttribute('href'), href, `${state}: ${name} → ${href}`)
        await link.click()
        const target = new URL(href, origin)
        await f.page.waitForURL((url) => url.pathname === target.pathname && url.search === target.search)
        await assertShell(f.page)
        if (href.includes('source=library'))
          assert.equal(
            await f.page.getByRole('radio', { name: /My YouTube videos/i }).getAttribute('aria-checked'),
            'true',
            'Shortcut opens the YouTube library source'
          )
        await f.page.goBack()
        await f.workspace.locator('[data-home-new-clip]').waitFor()
      }
    } finally {
      await f.close()
    }
  }
  console.log('Every Home link and shortcut opens its destination inside the persistent shell')
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
      '../src/components/dashboard/home/home-hero.tsx',
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
  if (runs('destinations')) await destinations()
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
