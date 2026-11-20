import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Start Vite separately (FRONTEND_ORIGIN, default http://127.0.0.1:5173). Every /v1 call is mocked
// in the page, so no backend or database is touched.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const output = new URL('../test-results/auth-canvas/', import.meta.url)
await mkdir(output, { recursive: true })

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }
const VALID_PASSWORD = 'Abcdefghijk1!'
const ignoredConsole = [/^Failed to load resource:/]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const failures = []
const passed = []

/** Opens an auth route with mocked /v1 responses; `api` maps "METHOD /path" to a handler. */
async function openAuth({ path, viewport = DESKTOP, dark = false, api = {} }) {
  const context = await browser.newContext({
    viewport,
    colorScheme: dark ? 'dark' : 'light',
    timezoneId: 'Europe/Bucharest',
    reducedMotion: 'reduce'
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(60000)
  page.consoleErrors = []
  page.on('pageerror', (error) => page.consoleErrors.push(error.message))
  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error' && !ignoredConsole.some((rule) => rule.test(text))) page.consoleErrors.push(text)
  })
  page.apiCalls = []
  const handlers = {
    'GET /v1/auth/refresh': () => ({ status: 401, json: { error: 'unauthenticated' } }),
    ...api
  }
  await context.route('**/v1/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const key = `${request.method()} ${url.pathname}`
    page.apiCalls.push({ key, body: request.postData() ?? '' })
    const handler = handlers[key]
    if (!handler) return route.fulfill({ status: 404, json: { error: `unmocked ${key}` } })
    const { status, json } = handler(request)
    return route.fulfill({ status, json })
  })
  await page.goto(`${origin}${path}`, { waitUntil: 'load' })
  // Register has no heading on the canvas, so wait for the rendered card instead.
  await page.locator('main section').first().waitFor()
  return { context, page }
}

async function scenario(name, run) {
  if (process.env.AUTH_CANVAS_ONLY && !new RegExp(process.env.AUTH_CANVAS_ONLY).test(name)) return
  try {
    await run()
    passed.push(name)
    console.log(`ok   ${name}`)
  } catch (error) {
    failures.push(`${name}: ${error.message.split('\n').slice(0, 4).join(' | ')}`)
    console.log(`FAIL ${name}\n${error.message.slice(0, 1200)}`)
  }
}

async function shot(page, name) {
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true })
}

function assertNoConsoleErrors(page) {
  assert.deepEqual(page.consoleErrors, [], 'no console or page errors')
}

async function assertNoUntranslatedKeys(page) {
  const text = await page.locator('body').innerText()
  assert.doesNotMatch(text, /authCanvas\.|auth\.[a-z]/, 'every copy key is translated')
}

async function assertNoHorizontalOverflow(page, width) {
  await page.setViewportSize({ width, height: 800 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  assert.ok(overflow <= 0, `no horizontal overflow at ${width}px (overflow ${overflow}px)`)
}

// Each state is reached through the real UI with mocked API responses.
const STATES = {
  login: { path: '/ro/login' },
  loginError: {
    path: '/ro/login',
    act: async (page) => {
      await page.getByLabel('Email', { exact: true }).fill('ana@exemplu.ro')
      await page.getByLabel('Parolă', { exact: true }).fill('gresita-parola')
      await page.getByRole('button', { name: 'Autentificare', exact: true }).click()
      await page.locator('[data-toast-region="corner"] [data-toast="error"]').waitFor()
    },
    api: { 'POST /v1/auth/login': () => ({ status: 401, json: { error: 'invalid', code: 'invalid' } }) }
  },
  mfa: {
    path: '/ro/login',
    act: async (page) => {
      await page.getByLabel('Email', { exact: true }).fill('ana@exemplu.ro')
      await page.getByLabel('Parolă', { exact: true }).fill('Parola-Ana-123!')
      await page.getByRole('button', { name: 'Autentificare', exact: true }).click()
      await page.getByRole('heading', { name: 'Verificare în doi pași' }).waitFor()
    },
    api: { 'POST /v1/auth/login': () => ({ status: 403, json: { error: 'mfa', code: 'mfa_required' } }) }
  },
  register: { path: '/ro/register' },
  verify: {
    path: '/ro/register',
    act: async (page) => {
      await fillRegister(page)
      await page.getByRole('button', { name: 'Creează cont', exact: true }).click()
      await page.getByRole('heading', { name: 'Verifică adresa de email' }).waitFor()
    },
    api: { 'POST /v1/auth/register': () => ({ status: 201, json: { verificationRequired: true } }) }
  },
  forgot: { path: '/ro/forgot-password' },
  forgotSent: {
    path: '/ro/forgot-password',
    act: async (page) => {
      await page.getByLabel('Email', { exact: true }).fill('ana@exemplu.ro')
      await page.getByRole('button', { name: 'Trimite linkul de resetare', exact: true }).click()
      await page.getByRole('heading', { name: 'Verifică emailul' }).waitFor()
    },
    api: { 'POST /v1/auth/forgot-password': () => ({ status: 200, json: {} }) }
  },
  reset: { path: '/ro/reset-password?token=synthetic-reset-token' },
  resetDone: {
    path: '/ro/reset-password?token=synthetic-reset-token',
    act: async (page) => {
      await page.getByLabel('Parolă nouă', { exact: true }).fill(VALID_PASSWORD)
      await page.getByLabel('Confirmă parola', { exact: true }).fill(VALID_PASSWORD)
      await page.getByRole('button', { name: 'Resetează parola', exact: true }).click()
      await page.getByRole('heading', { name: 'Parolă actualizată' }).waitFor()
    },
    api: { 'POST /v1/auth/reset-password': () => ({ status: 200, json: {} }) }
  },
  resetInvalid: { path: '/ro/reset-password' },
  activate: { path: '/ro/activate?token=synthetic-activation-token' },
  activateDone: {
    path: '/ro/activate?token=synthetic-activation-token',
    act: async (page) => {
      await page.getByRole('button', { name: 'Confirmă emailul', exact: true }).click()
      await page.getByRole('heading', { name: 'Contul este activ' }).waitFor()
    },
    api: { 'POST /v1/auth/activate': () => ({ status: 200, json: {} }) }
  }
}

async function fillRegister(page) {
  await page.getByLabel('Nume', { exact: true }).fill('Ana Popescu')
  await page.getByLabel('Email', { exact: true }).fill('ana@exemplu.ro')
  await page.getByLabel('Parolă', { exact: true }).fill(VALID_PASSWORD)
}

async function openState(name, options = {}) {
  const state = STATES[name]
  const opened = await openAuth({ ...options, path: state.path, api: { ...state.api, ...options.api } })
  if (state.act) await state.act(opened.page)
  return opened
}

// 1. Every state, in light and dark, on desktop and mobile: renders, has no untranslated keys or console errors.
for (const name of Object.keys(STATES)) {
  for (const [viewportName, viewport] of [['desktop', DESKTOP], ['mobile', MOBILE]]) {
    for (const dark of [false, true]) {
      const label = `${name} ${viewportName} ${dark ? 'dark' : 'light'}`
      await scenario(label, async () => {
        const { context, page } = await openState(name, { viewport, dark })
        try {
          assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), dark, 'theme follows the system scheme')
          await assertNoUntranslatedKeys(page)
          await shot(page, `${name}-${viewportName}-${dark ? 'dark' : 'light'}`)
          assertNoConsoleErrors(page)
        } finally {
          await context.close()
        }
      })
    }
  }
}

// 2. Login: real redirect, errors, MFA, and every link destination.
await scenario('login success redirects to the dashboard', async () => {
  const { context, page } = await openAuth({
    path: '/ro/login',
    api: {
      'POST /v1/auth/login': () => ({ status: 200, json: { access_token: 'synthetic-token', user: { id: 'u-1', email: 'ana@exemplu.ro', name: 'Ana' } } }),
      'GET /v1/auth/refresh': () => ({ status: 200, json: { access_token: 'synthetic-token', user: { id: 'u-1', email: 'ana@exemplu.ro', name: 'Ana' } } })
    }
  })
  try {
    await page.getByLabel('Email', { exact: true }).fill('ana@exemplu.ro')
    await page.getByLabel('Parolă', { exact: true }).fill('Parola-Ana-123!')
    await page.getByRole('button', { name: 'Autentificare', exact: true }).click()
    await page.waitForURL('**/ro/dashboard**')
    const login = page.apiCalls.find((call) => call.key === 'POST /v1/auth/login')
    assert.ok(login && login.body.includes('ana@exemplu.ro'), 'login sends the typed email')
  } finally {
    await context.close()
  }
})

await scenario('second factor sends the typed code and then redirects', async () => {
  const { context, page } = await openState('mfa')
  try {
    await page.getByLabel('Cod', { exact: true }).fill('482019')
    // openState already sent the first password attempt, which answered mfa_required.
    let attempts = 1
    await context.unroute('**/v1/**')
    await context.route('**/v1/**', (route) => {
      const request = route.request()
      const key = `${request.method()} ${new URL(request.url()).pathname}`
      page.apiCalls.push({ key, body: request.postData() ?? '' })
      if (key === 'POST /v1/auth/login') {
        attempts += 1
        if (attempts === 1) {
          return route.fulfill({ status: 403, json: { error: 'mfa', code: 'mfa_required' } })
        }
        return route.fulfill({ status: 200, json: { access_token: 'synthetic-token', user: { id: 'u-1', email: 'ana@exemplu.ro', name: 'Ana' } } })
      }
      return route.fulfill({ status: 200, json: { access_token: 'synthetic-token', user: { id: 'u-1', email: 'ana@exemplu.ro', name: 'Ana' } } })
    })
    await page.getByRole('button', { name: 'Continuă', exact: true }).click()
    await page.waitForURL('**/ro/dashboard**')
    const codes = page.apiCalls.filter((call) => call.key === 'POST /v1/auth/login').map((call) => call.body)
    assert.ok(codes.at(-1).includes('"secondFactor":"482019"'), 'second submit carries the code')
  } finally {
    await context.close()
  }
})

await scenario('login links point to the right destinations', async () => {
  const { context, page } = await openAuth({ path: '/ro/login' })
  try {
    const href = (name) => page.getByRole('link', { name, exact: true }).first().getAttribute('href')
    assert.equal(await page.getByRole('tab', { name: 'Autentificare', exact: true }).getAttribute('aria-selected'), 'true')
    assert.equal(await page.getByRole('tab', { name: 'Creează cont', exact: true }).getAttribute('href'), '/ro/register')
    assert.equal(await page.getByRole('link', { name: 'Ai uitat parola?' }).getAttribute('href'), '/ro/forgot-password')
    assert.equal(await page.getByRole('link', { name: 'Sneep Cut' }).first().getAttribute('href'), '/ro')
    assert.equal(await href('Termeni'), '/ro/terms')
    assert.equal(await href('Confidențialitate'), '/ro/privacy')
    assert.equal(await page.getByRole('link', { name: 'Creează cont', exact: true }).first().getAttribute('href'), '/ro/register')
    assert.ok(await page.getByRole('button', { name: 'Continuă cu Google' }).isVisible(), 'Google sign-in is offered')
  } finally {
    await context.close()
  }
})

await scenario('login error shows the alert and password toggle reveals the value', async () => {
  const { context, page } = await openState('loginError')
  try {
    assert.match(await page.locator('[data-toast-region="corner"] [data-toast="error"]').innerText(), /Email sau parolă invalidă\./)
    const password = page.getByLabel('Parolă', { exact: true })
    assert.equal(await password.getAttribute('type'), 'password')
    await page.getByRole('button', { name: 'Arată parola' }).click()
    assert.equal(await password.getAttribute('type'), 'text')
  } finally {
    await context.close()
  }
})

// 3. Register: live password rules, disabled submit, verification state, footer links.
await scenario('register rules gate the submit button', async () => {
  const { context, page } = await openAuth({ path: '/ro/register' })
  try {
    const submit = page.getByRole('button', { name: 'Creează cont', exact: true })
    assert.equal(await submit.isDisabled(), true, 'disabled before any password')
    await page.getByLabel('Parolă', { exact: true }).fill('abc')
    assert.equal(await page.locator('li[class*="rulePassed"]').count(), 1, 'only the lowercase rule passes for "abc"')
    await page.getByLabel('Parolă', { exact: true }).fill(VALID_PASSWORD)
    assert.equal(await page.locator('li[class*="rulePassed"]').count(), 5, 'all five rules pass')
    assert.equal(await submit.isDisabled(), false, 'enabled once every rule passes')
    assert.equal(await page.getByRole('link', { name: 'Termenii', exact: true }).getAttribute('href'), '/ro/terms')
    assert.equal(await page.getByRole('link', { name: 'Politica de confidențialitate', exact: true }).getAttribute('href'), '/ro/privacy')
    assert.equal(await page.getByRole('link', { name: 'Autentificare', exact: true }).getAttribute('href'), '/ro/login')
  } finally {
    await context.close()
  }
})

await scenario('register sends the account and shows the verification state', async () => {
  const { context, page } = await openState('verify')
  try {
    assert.match(await page.getByText(/ana@exemplu\.ro/).first().innerText(), /ana@exemplu\.ro/)
    const register = page.apiCalls.find((call) => call.key === 'POST /v1/auth/register')
    assert.ok(register.body.includes('"email":"ana@exemplu.ro"'))
    assert.ok(await page.getByRole('button', { name: 'Retrimite linkul', exact: true }).isVisible())
    assert.equal(await page.getByRole('link', { name: 'Autentificare', exact: true }).getAttribute('href'), '/ro/login')
  } finally {
    await context.close()
  }
})

// 4. Forgot, reset and activation flows.
await scenario('forgot password sends the email and shows the sent state', async () => {
  const { context, page } = await openState('forgotSent')
  try {
    const request = page.apiCalls.find((call) => call.key === 'POST /v1/auth/forgot-password')
    assert.ok(request.body.includes('ana@exemplu.ro'))
    assert.equal(await page.getByRole('link', { name: 'Înapoi la autentificare' }).getAttribute('href'), '/ro/login')
  } finally {
    await context.close()
  }
})

await scenario('forgot password back link goes to sign in', async () => {
  const { context, page } = await openState('forgot')
  try {
    assert.equal(await page.getByRole('link', { name: 'Înapoi la autentificare' }).first().getAttribute('href'), '/ro/login')
  } finally {
    await context.close()
  }
})

await scenario('reset password requires a matching, valid password', async () => {
  const { context, page } = await openAuth({ path: '/ro/reset-password?token=synthetic-reset-token' })
  try {
    const submit = page.getByRole('button', { name: 'Resetează parola', exact: true })
    await page.getByLabel('Parolă nouă', { exact: true }).fill(VALID_PASSWORD)
    await page.getByLabel('Confirmă parola', { exact: true }).fill('altceva-Parola-1!')
    assert.equal(await submit.isDisabled(), true, 'mismatch keeps submit disabled')
    await page.getByLabel('Confirmă parola', { exact: true }).fill(VALID_PASSWORD)
    assert.equal(await page.locator('li[class*="rulePassed"]').count(), 6, 'five rules and the match pass')
    assert.equal(await submit.isDisabled(), false)
  } finally {
    await context.close()
  }
})

await scenario('reset with a valid token shows done and sends the token', async () => {
  const { context, page } = await openState('resetDone')
  try {
    const request = page.apiCalls.find((call) => call.key === 'POST /v1/auth/reset-password')
    assert.ok(request.body.includes('synthetic-reset-token'))
    assert.equal(await page.getByRole('link', { name: 'Autentificare', exact: true }).getAttribute('href'), '/ro/login')
  } finally {
    await context.close()
  }
})

await scenario('reset without a token shows the invalid state with a new-link action', async () => {
  const { context, page } = await openState('resetInvalid')
  try {
    assert.ok(await page.getByRole('heading', { name: 'Link de resetare invalid' }).isVisible())
    assert.equal(await page.getByRole('link', { name: 'Trimite un link nou', exact: true }).getAttribute('href'), '/ro/forgot-password')
  } finally {
    await context.close()
  }
})

await scenario('activation confirms the token and shows the done state', async () => {
  const { context, page } = await openState('activateDone')
  try {
    const request = page.apiCalls.find((call) => call.key === 'POST /v1/auth/activate')
    assert.ok(request.body.includes('synthetic-activation-token'))
    assert.equal(await page.getByRole('link', { name: 'Autentificare', exact: true }).getAttribute('href'), '/ro/login')
  } finally {
    await context.close()
  }
})

await scenario('activation without a token disables confirm and shows the invalid notice', async () => {
  const { context, page } = await openAuth({ path: '/ro/activate' })
  try {
    assert.match(await page.getByRole('alert').innerText(), /Linkul este invalid sau a expirat\./)
    assert.equal(await page.getByRole('button', { name: 'Confirmă emailul', exact: true }).isDisabled(), true)
  } finally {
    await context.close()
  }
})

// 5. Layout: the illustration sits beside the card on desktop and above it on phones; no horizontal scroll.
await scenario('desktop places the illustration beside a card no wider than 460px', async () => {
  const { context, page } = await openAuth({ path: '/ro/login', viewport: DESKTOP })
  try {
    const illustration = await page.locator('img[src*="auth-login"]').boundingBox()
    const card = await page.locator('section').first().boundingBox()
    assert.equal(Math.round(illustration.width), 400)
    assert.ok(card.width <= 460.5, `card width ${card.width}`)
    assert.ok(illustration.x + illustration.width <= card.x, 'illustration is left of the card')
    assert.equal(await page.locator('p[class*="sticker"]').isVisible(), true)
  } finally {
    await context.close()
  }
})

await scenario('mobile stacks the illustration above the card without the sticker', async () => {
  const { context, page } = await openAuth({ path: '/ro/login', viewport: MOBILE })
  try {
    const illustration = await page.locator('img[src*="auth-login"]').boundingBox()
    const card = await page.locator('section').first().boundingBox()
    assert.equal(Math.round(illustration.width), 150)
    assert.ok(card.y < illustration.y + illustration.height, 'card starts under the illustration')
    assert.equal(await page.locator('p[class*="sticker"]').isVisible(), false)
  } finally {
    await context.close()
  }
})

for (const path of ['/ro/login', '/ro/register', '/ro/reset-password?token=synthetic-reset-token', '/ro/activate?token=x']) {
  await scenario(`no horizontal overflow from 320 to 1440px on ${path}`, async () => {
    const { context, page } = await openAuth({ path, viewport: MOBILE })
    try {
      for (const width of [320, 390, 768, 1024, 1440]) await assertNoHorizontalOverflow(page, width)
    } finally {
      await context.close()
    }
  })
}

await browser.close()
console.log(`auth-canvas: ${passed.length} passed, ${failures.length} failed`)
for (const name of passed) console.log(`  ok  ${name}`)
for (const failure of failures) console.log(`  FAIL ${failure}`)
if (failures.length > 0) process.exitCode = 1
