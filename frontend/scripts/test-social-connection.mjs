// Local browser regression coverage. All APIs and OAuth providers are synthetic.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
)
const base = process.env.SNEEPCUT_UI_ORIGIN ?? 'http://localhost:3001'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const output = new URL('../test-results/social-connection/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })

const defaultLocale = process.env.SNEEPCUT_UI_LOCALE ?? 'en'
async function fixture(locale = defaultLocale, width = 1440) {
  const messages = JSON.parse(
    await readFile(
      new URL(`../messages/${locale}.json`, import.meta.url),
      'utf8'
    )
  )
  const context = await browser.newContext({
    viewport: { width, height: 1000 }
  })
  await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: base }])
  const path = `${locale === 'ro' ? '/ro' : ''}/dashboard/publish`
  const user = {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'OAuth Preview',
    email: 'oauth@example.invalid',
    credits: 100,
    plan: 'free',
    access_role: 'member'
  }
  const providers = [
    'instagram',
    'facebook',
    'tiktok',
    'youtube',
    'linkedin',
    'twitter'
  ].map((id) => ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    configured: true,
    supportsPublishing: true
  }))
  const state = {
    mode: 'success',
    severOpener: false,
    accounts: [],
    reads: 0,
    errors: [],
    authDelay: 0,
    feedback: []
  }
  context.on('page', (page) => {
    page.on('pageerror', (error) => state.errors.push(error.message))
    page.on('console', (message) => {
      const prefix = 'CONNECTION_FEEDBACK:'
      if (message.text().startsWith(prefix))
        state.feedback.push(JSON.parse(message.text().slice(prefix.length)))
    })
  })
  await context.addInitScript((label) => {
    const feedback = { confirmations: 0, defaultLoader: false }
    window.connectionFeedback = feedback
    const isReturn = new URLSearchParams(location.search).has('connected')
    const seen = new WeakSet()
    function inspect() {
      let changed = false
      for (const element of document.querySelectorAll('[role="status"]')) {
        if (element.getAttribute('aria-label') !== label || seen.has(element))
          continue
        seen.add(element)
        feedback.confirmations++
        changed = true
      }
      if (
        isReturn &&
        !feedback.defaultLoader &&
        [...document.querySelectorAll('img[src*="black-loading.gif"]')].some(
          (image) => image.getBoundingClientRect().width > 0
        )
      ) {
        feedback.defaultLoader = true
        changed = true
      }
      if (changed)
        console.debug(`CONNECTION_FEEDBACK:${JSON.stringify(feedback)}`)
    }
    new MutationObserver(inspect).observe(document, {
      childList: true,
      subtree: true,
      attributes: true
    })
  }, messages.contentCalendar.connections.connected)
  await context.route('**/*', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.origin !== new URL(base).origin) return route.abort()
    if (url.pathname === '/__oauth') {
      const provider = url.searchParams.get('provider')
      const query =
        state.mode === 'denied'
          ? 'connectionError=denied'
          : `connected=${provider}`
      if (state.mode !== 'denied' && state.mode !== 'wait') {
        state.accounts = [
          {
            id: `account-${provider}`,
            provider,
            name: 'Synthetic Creator',
            username: `synthetic_${provider}`,
            status: 'connected'
          }
        ]
      }
      return route.fulfill({
        contentType: 'text/html',
        body: `<title>Synthetic OAuth</title>${state.mode === 'wait' ? '' : `<script>${state.severOpener ? 'window.opener = null;' : ''}location.replace(${JSON.stringify(`${path}?${query}`)})</script>`}`
      })
    }
    if (!/^\/(api|v1)\//.test(url.pathname)) return route.continue()
    let json = {}
    if (url.pathname === '/v1/auth/refresh') {
      if (state.authDelay)
        await new Promise((resolve) => setTimeout(resolve, state.authDelay))
      json = { access_token: 'synthetic', user }
    } else if (url.pathname === '/api/calendar')
      json = { posts: [], clips: [], meta: { truncated: false } }
    else if (url.pathname === '/api/publishing') {
      state.reads++
      json = { providers, accounts: state.accounts, clips: [], posts: [] }
    } else if (url.pathname.startsWith('/api/publishing/connect/')) {
      assert.equal(req.method(), 'POST')
      assert.equal(req.postDataJSON().locale, locale)
      if (state.mode === 'failure')
        return route.fulfill({
          status: 503,
          json: { error: 'Synthetic failure' }
        })
      json = {
        url: `${base}/__oauth?provider=${url.pathname.split('/').at(-1)}`
      }
    } else if (url.pathname === '/api/user/credits')
      json = { credits: 100, plan: 'free' }
    else if (url.pathname === '/api/user/profile')
      json = {
        profile: {
          ...user,
          image: null,
          provider: 'credentials',
          canChangePassword: true,
          recentlyAuthenticated: true,
          emailVerified: '2026-09-01T10:00:00Z',
          createdAt: '2026-09-01T10:00:00Z'
        }
      }
    else if (url.pathname === '/api/user/settings')
      json = {
        preferences: {
          locale,
          theme: 'light',
          timezone: 'UTC',
          defaultAspectRatio: '9:16',
          defaultClipCount: 5,
          emailSecurity: true,
          emailProduct: false,
          emailMarketing: false,
          inAppProcessing: true,
          inAppPublishing: true
        },
        sessions: [],
        mfa: { enabled: false },
        securityEvents: [],
        exports: []
      }
    return route.fulfill({ json })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  page.setDefaultNavigationTimeout(90000)
  const overlay = page.getByRole('status', {
    name: messages.contentCalendar.connections.connected,
    exact: true
  })
  const calendarConnect = () =>
    page
      .getByRole('button', {
        name: messages.contentCalendar.connections.connect,
        exact: true
      })
      .first()
  return { context, page, path, messages, state, overlay, calendarConnect }
}

async function verifyAnimation(f, name) {
  await f.overlay.waitFor({ state: 'visible' })
  const image = f.overlay.locator('img')
  await image.waitFor({ state: 'visible' })
  await image.evaluate((image) => image.decode())
  assert.ok(await image.evaluate((image) => image.naturalWidth > 0))
  const first = await image.screenshot({ animations: 'allow' })
  await f.page.waitForTimeout(650)
  const second = await image.screenshot({ animations: 'allow' })
  assert.equal(
    first.equals(second),
    false,
    'SVG frames must change while confirmation is visible'
  )
  await f.page.screenshot({
    path: new URL(`${name}.png`, output).pathname.replace(
      /^\/([A-Za-z]:)/,
      '$1'
    )
  })
  await f.overlay.waitFor({ state: 'hidden' })
  assert.equal(
    f.state.feedback.some((feedback) => feedback.defaultLoader),
    false,
    'OAuth return must never paint the default loading GIF'
  )
}

async function assertConfirmations(f, expected = 1) {
  assert.equal(
    await f.page.evaluate(() => window.connectionFeedback.confirmations),
    expected,
    'Each successful connection must mount exactly one confirmation'
  )
}

async function verifySingleCycleAssets() {
  const f = await fixture()
  const assets = [
    'instagram-connected-effect.svg',
    'facebook-connected-effect.svg',
    'youtube-connected-effect.svg',
    'Share on Linkedin.svg',
    'X Twitter logo.svg'
  ]
  await f.context.route('**/__confirmation-assets', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<style>body { margin:0; display:flex; background:white } img { width:240px; height:240px }</style>${assets.map((file) => `<img src="/brand/${encodeURIComponent(file)}" alt="${file}">`).join('')}`
    })
  )
  await f.page.goto(`${base}/__confirmation-assets`, { waitUntil: 'load' })
  const images = f.page.locator('img')
  await images.evaluateAll((images) =>
    Promise.all(images.map((image) => image.decode()))
  )
  const initial = await f.page.screenshot()
  await f.page.waitForTimeout(650)
  assert.equal(initial.equals(await f.page.screenshot()), false)
  await f.page.waitForTimeout(4200)
  const frozen = await f.page.screenshot()
  await f.page.waitForTimeout(800)
  assert.ok(
    frozen.equals(await f.page.screenshot()),
    'Every provider must stop after one cycle'
  )
  for (const file of assets) {
    const source = await readFile(
      new URL(`../public/brand/${file}`, import.meta.url),
      'utf8'
    )
    const animations = source.match(/<animate(?:Transform)?\b[^>]*>/g) ?? []
    assert.ok(animations.length > 0)
    for (const animation of animations) {
      assert.match(animation, /repeatCount="1"/)
      assert.match(animation, /fill="freeze"/)
    }
  }
  await f.page.screenshot({
    path: new URL('all-providers-frozen.png', output).pathname.replace(
      /^\/([A-Za-z]:)/,
      '$1'
    )
  })
  await f.context.close()
  console.info(
    'PASS all animated providers: one SVG cycle with a frozen final frame'
  )
}

try {
  await verifySingleCycleAssets()
  if (!process.argv.includes('--settings-only')) {
    for (const variant of process.argv.includes('--callbacks-only')
      ? []
      : [
          {
            locale: defaultLocale,
            width: 1440,
            provider: 'instagram',
            severOpener: false
          },
          { locale: 'ro', width: 390, provider: 'facebook', severOpener: true }
        ]) {
      const f = await fixture(variant.locale, variant.width)
      f.state.severOpener = variant.severOpener
      await f.page.goto(`${base}${f.path}`, { waitUntil: 'networkidle' })
      await f.calendarConnect().waitFor()
      await f.page.evaluate(() => {
        window.connectionTestMarker = 'preserved'
      })
      const navigations = []
      f.page.on('framenavigated', (frame) => {
        if (frame === f.page.mainFrame()) navigations.push(frame.url())
      })
      const button = f.page
        .locator('aside')
        .getByRole('button', {
          name: f.messages.contentCalendar.connections.connect,
          exact: true
        })
        .nth(variant.provider === 'facebook' ? 1 : 0)
      const popupPromise = f.page.waitForEvent('popup')
      await button.click()
      const popup = await popupPromise
      await verifyAnimation(f, `${variant.locale}-popup`)
      await assertConfirmations(f)
      assert.equal(popup.isClosed(), true)
      await f.page
        .getByText(`@synthetic_${variant.provider}`, { exact: true })
        .waitFor()
      assert.equal(
        await f.page.evaluate(() => window.connectionTestMarker),
        'preserved'
      )
      assert.deepEqual(navigations, [], 'Parent document must not navigate')
      assert.equal(
        await f.calendarConnect().isEnabled(),
        true,
        'Other providers unlock after success'
      )
      assert.deepEqual(f.state.errors, [])
      console.info(
        `PASS ${variant.locale}: animated SVG, popup completion, account refresh, preserved parent${variant.severOpener ? ', severed opener' : ''}`
      )
      await f.context.close()
    }

    const direct = await fixture()
    // The animation must start while auth is pending, then freeze without looping.
    direct.state.authDelay = 5500
    await direct.page.goto(
      `${base}${direct.path}?connected=instagram&keep=1#connections`,
      { waitUntil: 'commit' }
    )
    await direct.overlay.waitFor({ state: 'visible' })
    await direct.overlay.locator('img').evaluate((image) => image.decode())
    assert.equal(await direct.calendarConnect().count(), 0)
    await direct.page.waitForTimeout(2800)
    const frozen = await direct.overlay.locator('img').screenshot()
    await direct.page.waitForTimeout(650)
    assert.ok(
      frozen.equals(await direct.overlay.locator('img').screenshot()),
      'After one full cycle the SVG must keep the last frame during slow auth'
    )
    await direct.page.screenshot({
      path: new URL('direct-return-frozen.png', output).pathname.replace(
        /^\/([A-Za-z]:)/,
        '$1'
      )
    })
    await direct.overlay.waitFor({ state: 'hidden' })
    await assertConfirmations(direct)
    assert.equal(
      direct.state.feedback.some((f) => f.defaultLoader),
      false
    )
    direct.state.authDelay = 0
    assert.equal(new URL(direct.page.url()).search, '?keep=1')
    assert.equal(new URL(direct.page.url()).hash, '#connections')
    await direct.page.reload({ waitUntil: 'networkidle' })
    await direct.calendarConnect().waitFor()
    assert.equal(
      await direct.overlay.count(),
      0,
      'Consumed success does not replay on refresh'
    )
    await direct.page.evaluate(() =>
      sessionStorage.setItem('sneepcut:pending-social-connection', 'instagram')
    )
    await direct.page.reload({ waitUntil: 'networkidle' })
    await direct.calendarConnect().waitFor()
    assert.equal(
      await direct.overlay.count(),
      0,
      'Old pending intent is not success'
    )
    console.info(
      'PASS direct callback: animation, URL cleanup, no replay or false success'
    )
    await direct.context.close()

    const cancelled = await fixture()
    cancelled.state.mode = 'wait'
    await cancelled.page.goto(`${base}${cancelled.path}`, {
      waitUntil: 'networkidle'
    })
    let popupPromise = cancelled.page.waitForEvent('popup')
    await cancelled.calendarConnect().click()
    let popup = await popupPromise
    await popup.waitForURL('**/__oauth?*')
    await popup.close()
    await cancelled.page.waitForFunction(() =>
      [...document.querySelectorAll('aside button')].some(
        (button) => !button.disabled
      )
    )
    assert.equal(await cancelled.overlay.count(), 0)
    for (const mode of ['denied', 'failure']) {
      cancelled.state.mode = mode
      popupPromise = cancelled.page.waitForEvent('popup')
      await cancelled.calendarConnect().click()
      popup = await popupPromise
      await cancelled.page
        .getByText(cancelled.messages.settings.connectionActionFailed, {
          exact: true
        })
        .first()
        .waitFor()
      await cancelled.page.waitForFunction(() =>
        [...document.querySelectorAll('aside button')].some(
          (button) => !button.disabled
        )
      )
      assert.equal(await cancelled.overlay.count(), 0)
      if (!popup.isClosed()) await popup.waitForEvent('close')
    }
    assert.deepEqual(cancelled.state.errors, [])
    console.info(
      'PASS cancel, denied authorization and API failure: no false success, controls recover'
    )
    await cancelled.context.close()
  }

  const settings = await fixture()
  await settings.page.goto(
    `${base}${settings.path.replace('/publish', '/settings')}?section=connections`,
    {
      waitUntil: 'networkidle'
    }
  )
  const connect = settings.page
    .getByRole('button', {
      name: settings.messages.settings.connect,
      exact: true
    })
    .first()
  await connect.waitFor()
  await settings.page.evaluate(() => {
    window.connectionTestMarker = 'settings'
  })
  await connect.click()
  await verifyAnimation(settings, 'settings-popup')
  await assertConfirmations(settings)
  assert.equal(
    await settings.page.evaluate(() => window.connectionTestMarker),
    'settings'
  )
  assert.ok(settings.page.url().includes('/dashboard/settings'))
  await settings.page
    .getByText('synthetic_instagram', { exact: true })
    .first()
    .waitFor()
  await settings.page
    .getByRole('button', {
      name: settings.messages.settings.reconnect,
      exact: true
    })
    .first()
    .click()
  await verifyAnimation(settings, 'settings-reconnect')
  await assertConfirmations(settings, 2)
  assert.deepEqual(settings.state.errors, [])
  console.info(
    'PASS settings: shared popup flow, confirmation and account refresh without navigation'
  )
  await settings.context.close()

  const blocked = await fixture('ro', 390)
  await blocked.page.goto(`${base}${blocked.path}`, {
    waitUntil: 'networkidle'
  })
  await blocked.calendarConnect().waitFor()
  await blocked.page.evaluate(() => {
    window.open = () => null
  })
  await blocked.calendarConnect().click()
  await verifyAnimation(blocked, 'blocked-popup-return')
  await assertConfirmations(blocked)
  assert.deepEqual(blocked.state.errors, [])
  console.info('PASS blocked popup: same-tab OAuth return still animates')
  await blocked.context.close()
} catch (error) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      console.info(
        'Failure page:',
        page.url(),
        await page
          .locator('body')
          .innerText()
          .catch(() => 'unavailable')
      )
      await page
        .screenshot({
          path: new URL('failure.png', output).pathname.replace(
            /^\/([A-Za-z]:)/,
            '$1'
          )
        })
        .catch(() => undefined)
    }
  }
  throw error
} finally {
  await browser.close()
}
