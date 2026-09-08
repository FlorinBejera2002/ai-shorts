// Local rendering checks with synthetic metadata and APIs; no database mutations.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const base = process.env.SNEEPCUT_UI_ORIGIN ?? 'http://localhost:3000'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const output = 'test-results/youtube-preview'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const title = 'BE PATIENT or STOP WAITING? | English Podcast for B1 Listening Practice | Learn Daily Life English'
try {
  for (const locale of ['ro', 'en']) {
    const messages = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'))
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    await context.addInitScript(() => localStorage.setItem('theme', 'light'))
    await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: base }])
    await context.route(/\/(?:api|v1)\//, async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/v1/auth/refresh') return route.fulfill({ json: { access_token: 'synthetic', user: { id: '33333333-3333-4333-8333-333333333333', name: 'Preview', email: 'preview@example.invalid', credits: 100, plan: 'free', access_role: 'member' } } })
      if (path === '/api/user/brand') return route.fulfill({ json: { brandKit: null } })
      if (path === '/api/user/credits') return route.fulfill({ json: { credits: 100 } })
      if (path === '/api/assistant/history') return route.fulfill({ json: { messages: [] } })
      return route.abort()
    })
    await context.route('https://www.youtube.com/oembed?*', route => route.fulfill({ json: { title, author_name: 'Speak English With Class' } }))
    await context.route('https://img.youtube.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#ede4d2"/><text x="50" y="145" font-family="serif" font-size="54" font-weight="bold" fill="#273a32">BE PATIENT</text><text x="50" y="210" font-family="sans-serif" font-size="24" fill="#59665a">English listening practice</text></svg>' }))
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}${locale === 'ro' ? '/ro' : ''}/dashboard/create`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.locator('#youtube-url').fill('https://www.youtube.com/watch?v=abcdefghijk')
    const card = page.getByTestId('youtube-preview')
    await page.getByText(title, { exact: true }).waitFor()
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      const thumbnail = await card.locator('img').boundingBox()
      const heading = await card.getByText(title, { exact: true }).boundingBox()
      if (width >= 640) assert.ok(heading.x >= thumbnail.x + thumbnail.width, 'Desktop preview must be a horizontal row')
      else assert.ok(heading.y >= thumbnail.y + thumbnail.height, 'Mobile preview must stack')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow')
      assert.equal(await card.getByRole('status').innerText(), messages.create.readyToProcess)
      await card.screenshot({ path: `${output}/${locale}-${width}.png` })
    }
    await page.evaluate(() => { localStorage.setItem('theme', 'dark'); document.documentElement.classList.add('dark') })
    await card.screenshot({ path: `${output}/${locale}-dark-mobile.png` })
    await page.getByRole('button', { name: messages.create.clearUrl }).click()
    assert.equal(await card.count(), 0)
    await context.route('https://www.youtube.com/oembed?*', route => route.fulfill({ status: 503, body: '' }))
    await page.locator('#youtube-url').fill('https://www.youtube.com/watch?v=lmnopqrstuv')
    await card.getByText(messages.create.videoDetected, { exact: true }).waitFor()
    assert.equal(await card.getByText('youtube.com/watch?v=lmnopqrstuv').count(), 1)
    assert.deepEqual(errors, [])
    console.log(`PASS ${locale}: responsive preview, status, clear URL, unavailable metadata, no page errors`)
    await context.close()
  }
} finally { await browser.close() }
