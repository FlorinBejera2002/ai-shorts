// Browser checks for the static public site. Build first (`pnpm build`), then:
//   PLAYWRIGHT_MODULE=.../playwright/index.mjs node tests/landing.browser.mjs
// Optional APP_ORIGIN=http://127.0.0.1:5205 (a running Vite dev server of frontend/)
// also checks the hand-off between the public site and the web app.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const playwrightModule =
  process.env.PLAYWRIGHT_MODULE ?? 'C:/Users/flori/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
const { chromium } = await import(pathToFileURL(playwrightModule).href)

const port = Number(process.env.LANDING_PORT ?? 3100)
const origin = `http://127.0.0.1:${port}`
const appOrigin = process.env.APP_ORIGIN ?? ''
const shotsDir = fileURLToPath(new URL('../test-results/landing/', import.meta.url))
mkdirSync(shotsDir, { recursive: true })

// Stripe sandbox catalog (config/stripe-sandbox-manifest.json), as served by /api/stripe/plans.
const CATALOG = { creator: { amount: 1900, currency: 'EUR' }, pro: { amount: 4900, currency: 'EUR' }, agency: { amount: 14900, currency: 'EUR' } }
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }
const THEMES = ['light', 'dark']
const PAGES = [
  { path: '/', status: 200 },
  { path: '/pricing', status: 200 },
  { path: '/terms', status: 200 },
  { path: '/privacy', status: 200 },
  { path: '/ro', status: 200 },
  { path: '/ro/pricing', status: 200 },
  { path: '/ro/terms', status: 200 },
  { path: '/es', status: 200 },
  { path: '/es/pricing', status: 200 },
  { path: '/es/terms', status: 200 },
  { path: '/missing-page', status: 404 },
  { path: '/ro/pagina-lipsa', status: 404 },
  { path: '/es/pagina-no-existe', status: 404 }
]
const LEGAL = ['legal-notice', 'privacy', 'terms', 'cookie-policy', 'acceptable-use', 'refund-policy', 'subprocessors', 'dpa', 'data-deletion']
const APP_ROUTES = new Set([
  '/login',
  '/register',
  '/dashboard/create',
  '/ro/login',
  '/ro/register',
  '/ro/dashboard/create',
  '/es/login',
  '/es/register',
  '/es/dashboard/create'
])

const results = []
async function check(name, run) {
  try {
    await run()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: error.message.split('\n').slice(0, 4).join(' ') })
  }
}

function startServer() {
  const args = ['scripts/serve-static.mjs', '--port', String(port)]
  if (appOrigin) args.push('--app-origin', appOrigin)
  const child = spawn(process.execPath, args, { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: ['ignore', 'pipe', 'inherit'] })
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => String(chunk).includes('Static site on') && resolve(child))
    child.on('exit', (code) => reject(new Error(`server exited with ${code}`)))
  })
}

const server = await startServer()
const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function openPage({ viewport = VIEWPORTS.desktop, theme = 'light', catalog = CATALOG, catalogStatus = 200, storageTheme } = {}) {
  const context = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor: 1 })
  if (storageTheme) await context.addInitScript((value) => localStorage.setItem('theme', value), storageTheme)
  await context.route('**/api/stripe/plans', (route) => route.fulfill({ status: catalogStatus, json: catalog }))
  await context.route('**/v1/**', (route) => route.fulfill({ status: 401, json: { error: 'unauthenticated' } }))
  const page = await context.newPage()
  page.errors = []
  page.on('console', (message) => message.type() === 'error' && !/status of 404/.test(message.text()) && page.errors.push(message.text()))
  page.on('pageerror', (error) => page.errors.push(error.message))
  return { context, page }
}

const slug = (path) => (path === '/' ? 'home' : path.slice(1).replace(/\//g, '-'))

// 1. Every page renders in both themes on desktop and mobile, with one h1 and no console errors.
for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  for (const theme of THEMES) {
    const { context, page } = await openPage({ viewport, theme })
    for (const { path, status } of PAGES) {
      await check(`${viewportName} ${theme} ${path} renders`, async () => {
        page.errors.length = 0
        const response = await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' })
        assert.equal(response.status(), status)
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark')
        assert.equal(await page.locator('h1').count(), 1)
        assert.equal(await page.locator('h1').isVisible(), true)
        const images = await page.evaluate(() => [...document.images].filter((image) => image.loading !== 'lazy' && !image.complete).length)
        assert.equal(images, 0, 'eager images loaded')
        // Scroll through the page so lazy images load before the full-page screenshot.
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo({ top: y, behavior: 'instant' })
            await new Promise((resolve) => setTimeout(resolve, 40))
          }
          window.scrollTo({ top: 0, behavior: 'instant' })
        })
        // Images in hidden tab panels or the inactive theme logo are not rendered; ignore them.
        const rendered = () => [...document.images].filter((image) => image.getClientRects().length > 0)
        await page.waitForFunction(`(${rendered})().every((image) => image.complete)`)
        const broken = await page.evaluate(`(${rendered})().filter((image) => image.naturalWidth === 0).map((image) => image.src)`)
        assert.deepEqual(broken, [], 'broken images')
        await page.screenshot({ path: `${shotsDir}${viewportName}-${theme}-${slug(path)}.png`, fullPage: true })
        assert.deepEqual(page.errors, [], page.errors.join(' | '))
      })
    }
    await context.close()
  }
}

// 2. Every link on every page goes somewhere real.
await check('every link resolves to a page, an anchor, the web app or a known external target', async () => {
  const { context, page } = await openPage()
  const seen = new Map()
  for (const { path } of PAGES) {
    await page.goto(`${origin}${path}`)
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('a[href]')].map((link) => ({ href: link.getAttribute('href'), target: link.target, rel: link.rel }))
    )
    for (const link of links) seen.set(`${path} ${link.href}`, { page: path, ...link })
  }
  const problems = []
  for (const { page: from, href, target, rel } of seen.values()) {
    if (href.startsWith('#')) {
      if (!(await (await fetch(`${origin}${from}`)).text()).includes(`id="${href.slice(1)}"`)) problems.push(`${from}: ${href}`)
    } else if (href.startsWith('mailto:')) {
      if (href !== 'mailto:admin@sneepcut.com') problems.push(`${from}: ${href}`)
    } else if (/^https?:\/\//.test(href)) {
      if (!href.startsWith('https://') || target !== '_blank' || !rel.includes('noopener')) problems.push(`${from}: external ${href}`)
    } else {
      const url = new URL(href, origin)
      if (APP_ROUTES.has(url.pathname)) continue
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status !== 200) problems.push(`${from}: ${href} → ${response.status}`)
      if (url.hash && !(await response.text()).includes(`id="${url.hash.slice(1)}"`)) problems.push(`${from}: missing anchor ${href}`)
    }
  }
  assert.deepEqual(problems, [])
  await context.close()
})

await check('primary calls to action point at the web app', async () => {
  const { context, page } = await openPage()
  await page.goto(`${origin}/`)
  const header = page.locator('header')
  assert.equal(await header.getByRole('link', { name: 'Sign in' }).getAttribute('href'), '/login')
  assert.equal(await header.getByRole('link', { name: 'Start free' }).first().getAttribute('href'), '/register')
  assert.equal(await page.getByRole('link', { name: 'Create your first clip' }).getAttribute('href'), '/dashboard/create')
  assert.equal(await page.getByRole('link', { name: 'See how it works' }).getAttribute('href'), '#how-it-works')
  assert.equal(await page.locator('#cta-title + a').getAttribute('href'), '/register')
  const footerLegal = await page.locator('footer a').evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  for (const id of LEGAL) assert.ok(footerLegal.includes(`/${id}`), id)
  await page.goto(`${origin}/ro/pricing`)
  const ctas = await page.locator('article a.btn').evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  assert.deepEqual(ctas, ['/ro/register', '/ro/register', '/ro/register', 'mailto:admin@sneepcut.com'])
  await page.goto(`${origin}/missing-page`)
  assert.equal(await page.getByRole('link', { name: 'Back home' }).getAttribute('href'), '/')
  assert.equal(await page.getByRole('link', { name: 'See pricing' }).getAttribute('href'), '/pricing')
  await context.close()
})

// 3. Controls.
await check('theme switch applies, persists for the app and survives reloads', async () => {
  const { context, page } = await openPage()
  await page.goto(`${origin}/`)
  await page.locator('header').getByRole('radio', { name: 'Dark theme' }).click()
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true)
  assert.equal(await page.evaluate(() => localStorage.getItem('theme')), 'dark')
  assert.equal(await page.locator('header').getByRole('radio', { name: 'Dark theme' }).getAttribute('aria-checked'), 'true')
  await page.reload()
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true)
  await page.locator('header').getByRole('radio', { name: 'Dark theme' }).focus()
  await page.keyboard.press('ArrowLeft')
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), false)
  await context.close()
})

await check('language menu links to the same page in the other language', async () => {
  const { context, page } = await openPage()
  await page.goto(`${origin}/pricing`)
  const button = page.locator('header').getByRole('button', { name: 'Language: English' })
  await button.click()
  assert.equal(await button.getAttribute('aria-expanded'), 'true')
  const menu = page.locator('header ul:not([hidden])')
  assert.deepEqual(
    await menu.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
    ['/pricing', '/ro/pricing', '/es/pricing']
  )
  await page.keyboard.press('Escape')
  assert.equal(await button.getAttribute('aria-expanded'), 'false')
  await button.click()
  await Promise.all([page.waitForURL(`${origin}/ro/pricing`), menu.getByRole('link', { name: 'Română' }).click()])
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'ro')
  assert.equal(await page.locator('h1').textContent(), 'Prețuri simple și transparente')
  await page.locator('header').getByRole('button', { name: 'Limba: Română' }).click()
  await Promise.all([page.waitForURL(`${origin}/es/pricing`), page.locator('header ul:not([hidden])').getByRole('link', { name: 'Español' }).click()])
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'es')
  assert.equal(await page.locator('h1').textContent(), 'Precios simples y transparentes')
  await context.close()
})

await check('mobile top row and bottom navigation with the More sheet', async () => {
  const { context, page } = await openPage({ viewport: VIEWPORTS.mobile })
  await page.goto(`${origin}/ro`)
  const header = page.locator('header')
  assert.equal(await header.getByRole('link', { name: 'Autentificare' }).getAttribute('href'), '/ro/login')
  assert.equal(await header.getByRole('button').count(), 0, 'no hamburger in the header')
  // The open dialog repeats the bar; the page's own bar comes first in the DOM.
  const bar = page.getByRole('navigation', { name: 'Navigare' }).first()
  assert.deepEqual(
    await bar.locator('a').evaluateAll((links) => links.map((link) => [link.textContent, link.getAttribute('href'), link.getAttribute('aria-current')])),
    [['Acasă', '/ro', 'page'], ['Funcții', '/ro#functii', null], ['Prețuri', '/ro/pricing', null]]
  )
  const more = bar.getByRole('button', { name: 'Mai mult' })
  const sheet = page.getByRole('dialog', { name: 'Mai mult' })
  assert.equal(await sheet.isVisible(), false)
  await more.click()
  assert.equal(await more.getAttribute('aria-expanded'), 'true')
  assert.equal(await sheet.isVisible(), true)
  assert.equal(await sheet.evaluate((dialog) => dialog.tagName === 'DIALOG' && dialog.matches(':modal')), true, 'native modal dialog')
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Cum funcționează', 'focus moves into the sheet')
  const sheetBar = sheet.getByRole('navigation', { name: 'Navigare' })
  assert.equal(await sheetBar.isVisible(), true, 'the bar stays above the sheet')
  assert.equal(await sheetBar.locator('[aria-current="page"]').count(), 0, 'More is the active tab while open')
  assert.equal(await sheetBar.getByRole('button', { name: 'Mai mult' }).getAttribute('aria-expanded'), 'true')
  assert.deepEqual(
    await page.locator(`[id="${await more.getAttribute('aria-controls')}"] > a`).evaluateAll((links) => links.map((link) => [link.textContent, link.getAttribute('href')])),
    [['Cum funcționează', '/ro#cum'], ['Autentificare', '/ro/login'], ['Începe gratuit', '/ro/register']]
  )
  await page.screenshot({ path: `${shotsDir}mobile-light-menu.png` })
  await sheet.getByRole('radio', { name: 'Temă întunecată' }).click()
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true)
  await page.screenshot({ path: `${shotsDir}mobile-dark-menu.png` })
  await page.keyboard.press('Escape')
  assert.equal(await sheet.isVisible(), false)
  assert.equal(await more.getAttribute('aria-expanded'), 'false')
  await more.click()
  await sheet.getByRole('navigation', { name: 'Navigare' }).getByRole('button', { name: 'Mai mult' }).click()
  assert.equal(await sheet.isVisible(), false, 'More closes the sheet again')
  await more.click()
  await page.mouse.click(195, 120)
  assert.equal(await sheet.isVisible(), false, 'backdrop closes the sheet')
  await more.click()
  await sheet.getByRole('link', { name: 'Cum funcționează' }).click()
  await page.waitForFunction(() => location.hash === '#cum')
  assert.equal(await sheet.isVisible(), false)
  await Promise.all([page.waitForURL(`${origin}/ro/pricing`), bar.getByRole('link', { name: 'Prețuri' }).click()])
  assert.equal(await bar.getByRole('link', { name: 'Prețuri' }).getAttribute('aria-current'), 'page')
  await context.close()

  const desktop = await openPage()
  await desktop.page.goto(`${origin}/`)
  assert.equal(await desktop.page.getByRole('navigation', { name: 'Navigation', exact: true }).count(), 0)
  await desktop.context.close()
})

await check('FAQ answers open one at a time', async () => {
  const { context, page } = await openPage()
  await page.goto(`${origin}/pricing`)
  const items = page.locator('details')
  assert.equal(await items.nth(0).getAttribute('open'), '')
  await items.nth(2).locator('summary').click()
  assert.equal(await items.nth(2).getAttribute('open'), '')
  assert.equal(await items.nth(0).getAttribute('open'), null)
  assert.equal(await items.nth(2).locator('p').isVisible(), true)
  await context.close()
})

for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  await check(`${viewportName} feature tabs switch panels by click and keyboard`, async () => {
    const { context, page } = await openPage({ viewport })
    await page.goto(`${origin}/`)
    const tabs = page.getByRole('tab')
    assert.equal(await tabs.count(), 6)
    for (let index = 0; index < 6; index += 1) {
      await tabs.nth(index).click()
      assert.equal(await tabs.nth(index).getAttribute('aria-selected'), 'true')
      const panelId = await tabs.nth(index).getAttribute('aria-controls')
      assert.equal(await page.locator(`[id="${panelId}"]`).isVisible(), true)
      assert.equal(await page.locator('[role="tabpanel"]:visible').count(), 1)
    }
    await page.keyboard.press(viewportName === 'desktop' ? 'ArrowDown' : 'ArrowRight')
    assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true')
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'tab')
    await tabs.nth(2).click()
    await page.locator('#features').screenshot({ path: `${shotsDir}${viewportName}-light-features-tab3.png` })
    await context.close()
  })
}

await check('legal table of contents scrolls to sections and collapses on mobile', async () => {
  const { context, page } = await openPage()
  await page.goto(`${origin}/ro/terms`)
  const toc = page.getByRole('navigation', { name: 'Cuprins' })
  const entries = toc.locator('a')
  assert.equal(await entries.count(), 16)
  await entries.nth(5).click()
  await page.waitForFunction(() => location.hash === '#legal-section-6')
  await page.waitForFunction(() => document.querySelector('a[aria-current="location"]')?.getAttribute('href') === '#legal-section-6')
  await context.close()

  const mobile = await openPage({ viewport: VIEWPORTS.mobile })
  await mobile.page.goto(`${origin}/ro/terms`)
  const toggle = mobile.page.getByRole('button', { name: 'Cuprins · 16 secțiuni' })
  const list = mobile.page.getByRole('navigation', { name: 'Cuprins' }).locator('a').first()
  assert.equal(await list.isVisible(), false)
  await toggle.click()
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
  assert.equal(await list.isVisible(), true)
  await mobile.page.screenshot({ path: `${shotsDir}mobile-light-terms-toc.png` })
  await mobile.page.getByRole('navigation', { name: 'Cuprins' }).locator('a').nth(3).click()
  assert.equal(await list.isVisible(), false)
  await mobile.context.close()
})

// 4. Prices come from the plan catalog: baked in at build time and refreshed in the browser.
await check('plan prices come from /api/stripe/plans', async () => {
  const live = await openPage({ catalog: { ...CATALOG, creator: { amount: 2500, currency: 'EUR' } } })
  await live.page.goto(`${origin}/pricing`)
  await live.page.getByText('€25/month').waitFor()
  assert.equal(await live.page.getByText('€49/month').count(), 1)
  await live.context.close()

  const offline = await openPage({ catalogStatus: 503, catalog: { error: 'billing_provider_unavailable' } })
  await offline.page.goto(`${origin}/ro`)
  await offline.page.waitForLoadState('networkidle')
  const prices = await offline.page.locator('section[aria-labelledby="pricing-teaser-title"] ul b').allTextContents()
  assert.deepEqual(prices.map((price) => price.replace(/\s/g, ' ')), ['Fără cost', '19 EUR/lună', '49 EUR/lună', '149 EUR/lună'])
  await offline.context.close()
})

// 5. Clean URLs and 404 handling (mirrors landing/nginx.conf).
await check('clean URLs redirect and unknown paths return localized 404 pages', async () => {
  for (const [from, to] of [['/pricing/', '/pricing'], ['/pricing.html', '/pricing'], ['/index.html', '/'], ['/ro/', '/ro'], ['/es/', '/es']]) {
    const response = await fetch(`${origin}${from}`, { redirect: 'manual' })
    assert.equal(response.status, 301, from)
    assert.equal(response.headers.get('location'), to, from)
  }
  const english = await fetch(`${origin}/no-such-page`)
  assert.equal(english.status, 404)
  assert.match(await english.text(), /Page not found/)
  const romanian = await fetch(`${origin}/ro/nu-exista`)
  assert.equal(romanian.status, 404)
  assert.match(await romanian.text(), /Pagina nu există/)
  assert.equal((await fetch(`${origin}/ro/404`)).status, 404)
  const spanish = await fetch(`${origin}/es/nu-existe`)
  assert.equal(spanish.status, 404)
  assert.match(await spanish.text(), /Página no encontrada/)
  assert.equal((await fetch(`${origin}/es/404`)).status, 404)
  assert.equal((await fetch(`${origin}/sitemap.xml`)).status, 200)
  assert.equal((await fetch(`${origin}/robots.txt`)).status, 200)
})

// 6. No horizontal overflow from 320 to 1440 px.
await check('no horizontal overflow from 320 to 1440 px', async () => {
  const { context, page } = await openPage()
  const problems = []
  for (const width of [320, 360, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/', '/pricing', '/terms', '/ro', '/ro/pricing', '/ro/data-deletion', '/es', '/es/pricing', '/es/data-deletion', '/missing-page']) {
      await page.goto(`${origin}${path}`)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      if (overflow > 0) problems.push(`${width}px ${path}: ${overflow}px`)
    }
  }
  assert.deepEqual(problems, [])
  await context.close()
})

// 7. Hand-off between the public site and the web app (needs APP_ORIGIN).
if (appOrigin) {
  await check('public site and web app link to each other with full page loads', async () => {
    const { context, page } = await openPage()
    const isLanding = () => page.locator('a.skip-link').count().then((count) => count === 1)
    await page.goto(`${origin}/`)
    await Promise.all([page.waitForURL(`${origin}/login`), page.locator('header').getByRole('link', { name: 'Sign in' }).click()])
    await page.locator('input[type="email"]').waitFor()
    assert.equal(await isLanding(), false)
    await Promise.all([page.waitForURL(`${origin}/terms`), page.getByRole('link', { name: /^Terms/ }).first().click()])
    await page.locator('h1').waitFor()
    assert.equal(await isLanding(), true, 'terms served by the static site')
    await page.goto(`${origin}/ro/register`)
    await page.locator('input[type="email"]').waitFor()
    await Promise.all([page.waitForURL(`${origin}/ro`), page.locator('a[href="/ro"]').first().click()])
    assert.equal(await isLanding(), true, 'logo leads to the static home page')
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'ro')
    // In-app redirects to a public page also leave the SPA (PublicSiteRoute).
    await page.goto(`${origin}/dashboard-unknown`)
    await page.waitForURL(`${origin}/`)
    await page.locator('a.skip-link').waitFor({ state: 'attached' })
    await context.close()
  })
}

await browser.close()
server.kill()

const failed = results.filter((result) => !result.ok)
for (const result of results) console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.name}${result.ok ? '' : `\n     ${result.error}`}`)
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed. Screenshots: ${shotsDir}`)
process.exitCode = failed.length > 0 ? 1 : 0
