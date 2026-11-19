import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { restoreSourceTimes } from './source-probe-helpers.mjs'

// Start Vite separately. Every API route is mocked, so the desktop sidebar is exercised
// against synthetic data only: links, active states, the tree connector, monthly usage,
// sign-out confirmation, collapse persistence, and the mounted dashboard shell.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const output = new URL('../test-results/sidebar-layout/', import.meta.url)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const pageErrors = [],
  consoleErrors = [],
  reports = []
const identity = {
  id: '00000000-0000-4000-8000-000000003001',
  email: 'sidebar-layout@example.invalid',
  name: 'Alex Morgan',
  profile_pic: null,
  credits: 2900,
  plan: 'pro',
  access_role: 'member'
}
const RENEWING = { status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: '2026-12-18T10:00:00Z' }

// [link key, path after /ro, group index]
const DESTINATIONS = [
  ['home', '/dashboard', 0],
  ['editor', '/dashboard/studio', 0],
  ['scripts', '/dashboard/script-generator', 0],
  ['clips', '/dashboard/clips', 0],
  ['publish', '/dashboard/publish', 0],
  ['brand', '/dashboard/brand', 1],
  ['billing', '/dashboard/billing', 1],
  ['settings', '/dashboard/settings', 1]
]
const LABELS = {
  ro: ['Panou principal', 'Editor video', 'Scenarii', 'Clipuri', 'Publicare', 'Identitate vizuală', 'Abonament și facturare', 'Setări'],
  en: ['Home', 'Video editor', 'Scripts', 'Clips', 'Publish', 'Brand kit', 'Subscription and billing', 'Settings']
}
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`
const PALETTE = {
  light: { surface: '#ffffff', border: '#e3e9f2', text: '#152035', secondary: '#4f5c72', primary: '#0b0b0c', onPrimary: '#ffffff' },
  dark: { surface: '#181f2b', border: '#334158', text: '#edf2fa', secondary: '#bdc9dc', primary: '#8e9bb0', onPrimary: '#0c1524' }
}

async function fixture({ dark = false, locale = 'ro', billing } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: 'Europe/Bucharest',
    locale: locale === 'ro' ? 'ro-RO' : 'en-US',
    colorScheme: dark ? 'dark' : 'light',
    reducedMotion: 'reduce'
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  // A cold Vite transforms the whole app on the first visit; later navigations are fast.
  page.setDefaultNavigationTimeout(180000)
  page.on('pageerror', (error) => pageErrors.push(`${page.url()}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text()))
      consoleErrors.push(`${new URL(page.url()).pathname}: ${message.text().slice(0, 200)}`)
  })
  const billingPayload = billing ?? {
    account: { credits: 2900, plan: 'pro', hasBillingProfile: true },
    subscription: RENEWING,
    invoices: [],
    providerAvailable: true,
    checkoutVerification: null
  }
  const calls = { billing: 0, logout: 0 }
  // The Editor link launches the separate Studio app; keep it on its in-shell error state.
  await context.route('http://localhost:5191/**', (route) => route.fulfill({ status: 503, json: {} }))
  await context.route('**/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/v1/auth/logout') calls.logout += 1
    return route.fulfill({ json: { access_token: 'synthetic-sidebar-token', user: identity } })
  })
  await context.route('**/api/**', (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    if (request.method() !== 'GET') return route.fulfill({ status: 405, json: {} })
    if (path === '/api/stripe/billing') calls.billing += 1
    const responses = {
      '/api/stripe/billing': billingPayload,
      '/api/stripe/plans': { creator: { amount: 1900, currency: 'EUR' }, pro: { amount: 4900, currency: 'EUR' }, agency: { amount: 14900, currency: 'EUR' } },
      '/api/publishing': { providers: [], accounts: [], clips: [], posts: [] },
      '/api/calendar': { posts: [], clips: [] },
      '/api/clips/library': { clips: [], total: 0, hasMore: false },
      '/api/stories': { stories: [] },
      '/api/user/brand': { brandKit: {}, plan: 'pro', canWhiteLabel: true },
      '/api/user/brand/fonts': { fonts: [] },
      '/api/workspace-agent/preferences': { follow: false, recommendations: false },
      '/api/user/profile': { profile: { ...identity, image: null, provider: 'credentials', createdAt: '2026-10-01T09:00:00Z' } },
      '/api/user/settings': { preferences: { locale, theme: 'system', timezone: 'Europe/Bucharest' }, sessions: [], mfa: { enabled: false }, securityEvents: [], exports: [] },
      '/api/user/credits': { credits: 2900, plan: 'pro', creditsUnlimited: false },
      '/api/dashboard': { metrics: { clipCount: 0, jobCount: 0, durationMinutes: 0, activity: [], statuses: {} }, recentClips: [] },
      '/api/dashboard/history': { jobs: [] },
      '/api/projects': { projects: [], collections: [] },
      '/api/brand-kits': { kits: [] },
      '/api/scripts/items': { scripts: [] },
      '/api/workspace-agent/runs': { runs: [], has_more: false },
      '/api/workspace-agent/suggestions': { suggestions: [], capabilities: [] }
    }
    return route.fulfill({ json: responses[path] || {} })
  })
  return {
    page,
    calls,
    context,
    panel: page.locator('[data-app-sidebar]'),
    async open(path = '/dashboard/publish') {
      await page.goto(`${origin}${locale === 'ro' ? '/ro' : ''}${path}`, { waitUntil: 'load' })
      await page.locator('[data-app-sidebar]').waitFor()
    },
    close: () => context.close()
  }
}

const localized = (locale, path) => `${locale === 'ro' ? '/ro' : ''}${path}`

async function waitFor(check, message, timeout = 10000) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    last = await check()
    if (last === true) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.fail(`${message} (last: ${JSON.stringify(last)})`)
}

async function rememberShell(page) {
  await page.evaluate(() => {
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    window.sidebarShellProbe = {
      document,
      shell: document.querySelector('#dashboard-shell'),
      main: document.querySelector('#dashboard-main'),
      header: document.querySelector('header.studio-topbar'),
      sidebar,
      panel: document.querySelector('[data-app-sidebar]'),
      links: [...document.querySelectorAll('[data-sidebar-link]')],
      state: sidebar?.getAttribute('data-state')
    }
    const probe = window.sidebarShellProbe
    if (!probe.shell || !probe.main || !probe.header || !probe.sidebar || !probe.panel || probe.links.length !== 8)
      throw new Error('Missing dashboard shell')
  })
}

async function assertShell(page, label) {
  const result = await page.evaluate(() => {
    const p = window.sidebarShellProbe,
      sidebar = document.querySelector('[data-slot="sidebar"]'),
      links = [...document.querySelectorAll('[data-sidebar-link]')]
    return {
      document: p.document === document,
      shell: p.shell === document.querySelector('#dashboard-shell'),
      main: p.main === document.querySelector('#dashboard-main'),
      header: p.header === document.querySelector('header.studio-topbar'),
      sidebar: p.sidebar === sidebar,
      panel: p.panel === document.querySelector('[data-app-sidebar]'),
      links: links.length === p.links.length && links.every((link, index) => link === p.links[index]),
      state: p.state === sidebar?.getAttribute('data-state')
    }
  })
  assert.deepEqual(
    result,
    { document: true, shell: true, main: true, header: true, sidebar: true, panel: true, links: true, state: true },
    `${label}: document, layout, header, sidebar and its state stay mounted`
  )
}

/** Collapsing keeps the layout, header, sidebar and panel mounted; only the state changes. */
async function assertShellExceptLinks(page) {
  const kept = await page.evaluate(() => {
    const p = window.sidebarShellProbe
    return (
      p.document === document &&
      p.shell === document.querySelector('#dashboard-shell') &&
      p.main === document.querySelector('#dashboard-main') &&
      p.header === document.querySelector('header.studio-topbar') &&
      p.sidebar === document.querySelector('[data-slot="sidebar"]') &&
      p.panel === document.querySelector('[data-app-sidebar]')
    )
  })
  assert.equal(kept, true, 'Collapsing keeps the dashboard layout and sidebar panel mounted')
}

/** Exactly one destination (or none, e.g. on Create) is current, bold, and reached by the connector. */
async function assertActive(page, key, label) {
  await waitFor(
    () =>
      page.evaluate((expected) => {
        const current = [...document.querySelectorAll('[data-sidebar-link][aria-current="page"]')].map((link) => link.dataset.sidebarLink)
        const weights = [...document.querySelectorAll('[data-sidebar-link]')].map((link) => [link.dataset.sidebarLink, getComputedStyle(link).fontWeight])
        const boldOk = weights.every(([name, weight]) => (name === expected ? weight === '600' : weight === '500'))
        const rails = [...document.querySelectorAll('[data-sidebar-rail="active"]')].map((rail) => {
          const list = rail.parentElement
          const activeItem = list.querySelector('[data-sidebar-link][aria-current="page"]')?.closest('li')
          const line = rail.querySelector('[data-sidebar-rail-line]')
          if (rail.getClientRects().length === 0) return true // collapsed rail hides connectors
          const visible = Number(getComputedStyle(rail).opacity) > 0.99
          if (!activeItem) return !visible || 'rail visible without an active item'
          const target = activeItem.offsetTop + activeItem.offsetHeight / 2 - 6
          // The line moves by transform, so measure its rendered box against the list.
          const end = line.getBoundingClientRect().bottom - list.getBoundingClientRect().top
          const start = getComputedStyle(line.parentElement).clipPath
          return (
            (visible && Math.abs(end - target) <= 1 && /^inset\(0(px)?\b/.test(start)) ||
            `rail ends at ${end} (expected ${target}), track clip ${start}`
          )
        })
        const railOk = rails.every((value) => value === true)
        return (JSON.stringify(current) === JSON.stringify(expected ? [expected] : []) && boldOk && railOk) || { current, weights, rails }
      }, key),
    `${label}: active state is ${key ?? 'none'}`
  )
}

async function capture(page, name, clip) {
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), clip })
  reports.push(name)
}

async function assertPalette(f, theme) {
  const colors = PALETTE[theme]
  const styles = await f.page.evaluate(() => {
    const panel = document.querySelector('[data-app-sidebar]')
    const css = (element, property) => getComputedStyle(element)[property]
    const create = document.querySelector('[data-sidebar-create]')
    const inactive = document.querySelector('[data-sidebar-link]:not([aria-current])')
    const active = document.querySelector('[data-sidebar-link][aria-current="page"]')
    const container = document.querySelector('[data-slot="sidebar-container"]')
    return {
      width: container.getBoundingClientRect().width,
      surface: css(panel, 'backgroundColor'),
      border: css(panel, 'borderRightColor'),
      borderWidth: css(panel, 'borderRightWidth'),
      text: css(active, 'color'),
      secondary: css(inactive, 'color'),
      primary: css(create, 'backgroundColor'),
      onPrimary: css(create, 'color'),
      createHeight: create.getBoundingClientRect().height,
      createRadius: css(create, 'borderTopLeftRadius'),
      itemHeight: active.getBoundingClientRect().height,
      dark: document.documentElement.classList.contains('dark')
    }
  })
  assert.deepEqual(styles, {
    width: 240,
    surface: rgb(colors.surface),
    border: rgb(colors.border),
    borderWidth: '1px',
    text: rgb(colors.text),
    secondary: rgb(colors.secondary),
    primary: rgb(colors.primary),
    onPrimary: rgb(colors.onPrimary),
    createHeight: 44,
    createRadius: '12px',
    itemHeight: 32,
    dark: theme === 'dark'
  }, `${theme}: canvas geometry and palette`)
}

// ---------------------------------------------------------------- content and palette
async function canvas(theme) {
  const f = await fixture({ dark: theme === 'dark' })
  try {
    await f.open('/dashboard/publish')
    await assertPalette(f, theme)
    const content = await f.panel.evaluate((panel) => ({
      labels: [...panel.querySelectorAll('[data-sidebar="group-label"]')].map((label) => label.innerText.trim()),
      links: [...panel.querySelectorAll('[data-sidebar-link]')].map((link) => link.innerText.trim()),
      create: panel.querySelector('[data-sidebar-create]').innerText.trim(),
      account: panel.querySelector('[data-sidebar-account]').innerText.replace(/\s+/g, ' ').trim()
    }))
    assert.deepEqual(content, {
      labels: ['STUDIO', 'CONT ȘI CONFIGURARE'],
      links: LABELS.ro,
      create: 'Creează clipuri',
      account: 'AL Alex Morgan'
    })
    const usage = f.panel.locator('[data-sidebar-usage]')
    await usage.waitFor()
    assert.equal(await usage.getAttribute('aria-label'), 'Utilizare lunară: 42% folosit')
    assert.equal((await usage.innerText()).replace(/\s+/g, ' ').trim(), 'Utilizare lunară 42% Se resetează pe 18 dec.')
    assert.doesNotMatch(await f.panel.innerText(), /credit/i, 'Usage is shown as a percentage, never credits')
    const fill = await usage.evaluate((card) => {
      const track = card.querySelector('[aria-hidden="true"]')
      return Math.round((track.firstElementChild.getBoundingClientRect().width / track.getBoundingClientRect().width) * 100)
    })
    assert.equal(fill, 42)
    // The group of the current page is connected; the other group has no connector.
    await assertActive(f.page, 'publish', `${theme} publish`)
    await f.page.locator('[data-sidebar-link="scripts"]').hover()
    await waitFor(
      () => f.page.locator('[data-sidebar-rail="hover"]').first().evaluate((rail) => Number(getComputedStyle(rail).opacity) > 0.99),
      'Hovering another destination draws the hover connector'
    )
    await f.page.mouse.move(900, 600)
    await capture(f.page, `desktop-${theme}-publish`)
    await capture(f.page, `sidebar-${theme}`, { x: 0, y: 0, width: 240, height: 900 })
  } finally {
    await f.close()
  }
}

// ---------------------------------------------------------------- every destination
async function destinations() {
  const f = await fixture()
  try {
    await f.open('/dashboard/publish')
    await rememberShell(f.page)
    for (const [key, path] of DESTINATIONS) {
      await f.page.locator(`[data-sidebar-link="${key}"]`).click()
      await f.page.waitForURL((url) => url.pathname === localized('ro', path))
      await assertShell(f.page, key)
      await assertActive(f.page, key, key)
    }
    await f.page.locator('[data-sidebar-create]').click()
    await f.page.waitForURL((url) => url.pathname === localized('ro', '/dashboard/create'))
    await assertShell(f.page, 'create')
    await assertActive(f.page, null, 'create')
    assert.equal(await f.page.locator('[data-sidebar-create]').getAttribute('aria-current'), 'page')

    await f.page.locator('[data-sidebar-usage]').click()
    await f.page.waitForURL((url) => url.pathname === localized('ro', '/dashboard/billing'))
    await assertShell(f.page, 'usage card')
    await assertActive(f.page, 'billing', 'usage card')

    await f.page.locator('[data-app-sidebar] a[aria-label="Sneep Cut"]').click()
    await f.page.waitForURL((url) => url.pathname === localized('ro', '/dashboard'))
    await assertShell(f.page, 'logo')
    await assertActive(f.page, 'home', 'logo')

    // Browser history keeps the same mounted shell and moves the active state back.
    await f.page.goBack()
    await f.page.waitForURL((url) => url.pathname === localized('ro', '/dashboard/billing'))
    await assertShell(f.page, 'back')
    await assertActive(f.page, 'billing', 'back')
    assert.equal(f.calls.billing >= 1, true)

    // Sign-out asks for confirmation; cancelling keeps the session.
    await f.page.locator('[data-sidebar-account] button[aria-label="Deconectare"]').click()
    const dialog = f.page.getByRole('dialog', { name: 'Te deconectezi?' })
    await dialog.waitFor()
    await dialog.getByRole('button', { name: 'Anulează' }).click()
    await dialog.waitFor({ state: 'detached' })
    assert.equal(f.calls.logout, 0)
    await assertShell(f.page, 'sign-out cancelled')
  } finally {
    await f.close()
  }
  console.log('All 8 destinations, Create, usage card, logo and back navigation kept the mounted shell')
}

// ---------------------------------------------------------------- collapse
async function collapse() {
  const f = await fixture()
  try {
    await f.open('/dashboard/clips')
    await rememberShell(f.page)
    const trigger = f.page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first()
    assert.equal(await trigger.getAttribute('aria-label'), 'Restrânge meniul')
    await trigger.click()
    await waitFor(() => f.page.locator('[data-slot="sidebar"]').getAttribute('data-state').then((state) => state === 'collapsed'), 'Sidebar collapses')
    await waitFor(
      () => f.page.locator('[data-slot="sidebar-container"]').evaluate((element) => element.getBoundingClientRect().width === 60),
      'Collapsed rail is 60px, as on the canvas'
    )
    const collapsed = await f.panel.evaluate((panel) => {
      const visible = (element) => element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
      return {
        labels: [...panel.querySelectorAll('[data-sidebar="group-label"]')].some(visible),
        names: [...panel.querySelectorAll('[data-sidebar-link] span')].some(visible),
        icons: [...panel.querySelectorAll('[data-sidebar-link] svg')].every(visible),
        usage: visible(panel.querySelector('[data-sidebar-usage]')),
        create: visible(panel.querySelector('[data-sidebar-create] svg')),
        rails: [...panel.querySelectorAll('[data-sidebar-rail]')].some(visible),
        overflow: panel.scrollWidth <= panel.clientWidth + 1
      }
    })
    assert.deepEqual(collapsed, { labels: false, names: false, icons: true, usage: false, create: true, rails: false, overflow: true })
    assert.match(await f.page.evaluate(() => document.cookie), /sidebar_state=false/)
    await capture(f.page, 'desktop-light-collapsed', { x: 0, y: 0, width: 240, height: 900 })

    // Collapsed icons keep working, with a tooltip naming the destination.
    await f.page.locator('[data-sidebar-link="settings"]').hover()
    await f.page.getByRole('tooltip', { name: 'Setări' }).waitFor()
    await assertShellExceptLinks(f.page)
    // Collapsing wraps each link in its tooltip (shared primitive), so snapshot the collapsed rail.
    await rememberShell(f.page)
    await f.page.locator('[data-sidebar-link="settings"]').click()
    await f.page.waitForURL((url) => url.pathname === localized('ro', '/dashboard/settings'))
    await assertShell(f.page, 'collapsed settings')
    await assertActive(f.page, 'settings', 'collapsed settings')

    // The collapsed state survives a reload, then expands back to the 240px canvas panel.
    await f.page.reload({ waitUntil: 'load' })
    await f.panel.waitFor()
    assert.equal(await f.page.locator('[data-slot="sidebar"]').getAttribute('data-state'), 'collapsed')
    await f.page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click()
    await waitFor(
      () => f.page.locator('[data-slot="sidebar-container"]').evaluate((element) => element.getBoundingClientRect().width === 240),
      'Sidebar expands to 240px'
    )
    await assertActive(f.page, 'settings', 'expanded settings')
    assert.match(await f.page.evaluate(() => document.cookie), /sidebar_state=true/)
  } finally {
    await f.close()
  }
  console.log('Collapse, collapsed navigation with tooltips, cookie persistence and expand passed')
}

// ---------------------------------------------------------------- data gaps and English copy
async function variants() {
  const free = await fixture({
    billing: { account: { credits: 400, plan: 'free', hasBillingProfile: false }, subscription: null, invoices: [], providerAvailable: true, checkoutVerification: null }
  })
  try {
    await free.open('/dashboard')
    await waitFor(() => Promise.resolve(free.calls.billing >= 1), 'Usage was requested')
    assert.equal(free.calls.billing >= 1, true)
    assert.equal(await free.panel.locator('[data-sidebar-usage]').count(), 0, 'No monthly allowance, no usage card')
    await assertActive(free.page, 'home', 'free home')
  } finally {
    await free.close()
  }
  const en = await fixture({ locale: 'en' })
  try {
    await en.open('/dashboard/brand')
    assert.deepEqual(await en.panel.locator('[data-sidebar-link]').allInnerTexts(), LABELS.en)
    const usage = en.panel.locator('[data-sidebar-usage]')
    await usage.waitFor()
    assert.equal((await usage.innerText()).replace(/\s+/g, ' ').trim(), 'Monthly usage 42% Resets on Dec 18')
    await assertActive(en.page, 'brand', 'english brand')
  } finally {
    await en.close()
  }
  console.log('Free plan hides usage; English copy and active state passed')
}

// ---------------------------------------------------------------- Fast Refresh
async function fastRefresh() {
  if (process.env.RUN_FAST_REFRESH !== '1') {
    console.log('SKIPPED source Fast Refresh probe (set RUN_FAST_REFRESH=1)')
    return
  }
  const f = await fixture()
  try {
    await f.open('/dashboard/clips')
    await f.page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click()
    await waitFor(() => f.page.locator('[data-slot="sidebar"]').getAttribute('data-state').then((state) => state === 'collapsed'), 'Sidebar collapses')
    await rememberShell(f.page)
    const sourcePath = new URL('../src/components/dashboard/sidebar-navigation-group.tsx', import.meta.url)
    const metadata = await stat(sourcePath, { bigint: true }),
      source = await readFile(sourcePath)
    const text = source.toString('utf8'),
      anchor = 'data-sidebar-link={item.key}'
    assert.equal(text.split(anchor).length, 2, 'Fast Refresh anchor is unique')
    try {
      await writeFile(sourcePath, text.replace(anchor, `data-sidebar-refresh-probe="updated" ${anchor}`))
      await f.page.locator('[data-sidebar-refresh-probe="updated"]').first().waitFor({ state: 'attached' })
      // Only the edited component re-renders: layout, sidebar, collapsed state and links persist.
      await assertShell(f.page, 'Fast Refresh')
    } finally {
      try {
        await writeFile(sourcePath, source)
        await f.page.locator('[data-sidebar-refresh-probe]').first().waitFor({ state: 'detached' })
        assert.deepEqual(await readFile(sourcePath), source)
      } finally {
        await restoreSourceTimes(sourcePath, metadata)
      }
    }
  } finally {
    await f.close()
  }
  console.log('Fast Refresh updated the navigation group in place with the shell and collapsed state preserved')
}

try {
  await mkdir(output, { recursive: true })
  const group = process.env.SIDEBAR_GROUP || 'all',
    runs = (name) => group === 'all' || group.split(',').includes(name)
  if (runs('light')) await canvas('light')
  if (runs('dark')) await canvas('dark')
  if (runs('destinations')) await destinations()
  if (runs('collapse')) await collapse()
  if (runs('variants')) await variants()
  if (runs('refresh')) await fastRefresh()
  if (consoleErrors.length) console.log(`Console errors from page content (not the sidebar):\n${[...new Set(consoleErrors)].join('\n')}`)
  assert.deepEqual(pageErrors, [])
  assert.deepEqual(consoleErrors.filter((message) => /sidebar/i.test(message)), [])
  await writeFile(
    new URL(`summary-${group.replaceAll(',', '-')}.json`, output),
    JSON.stringify({ groups: group, screenshots: reports, available: (await readdir(output)).filter((name) => name.endsWith('.png')).sort(), fixtureOnly: true }, null, 2)
  )
  console.log(`All synthetic sidebar checks passed; ${reports.length} captures`)
} catch (error) {
  if (pageErrors.length || consoleErrors.length)
    console.error(`Page errors:\n${pageErrors.join('\n')}\nConsole errors:\n${[...new Set(consoleErrors)].join('\n')}`)
  throw error
} finally {
  await browser.close()
}
