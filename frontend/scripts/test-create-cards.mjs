// Local UI verification with synthetic API responses; no database or paid services.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const base = process.env.SNEEPCUT_UI_ORIGIN ?? 'http://localhost:3000'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const output = 'test-results/create-cards'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const locale of ['ro', 'en']) {
    const messages = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'))
    const context = await browser.newContext({ viewport: { width: 1440, height: 1024 } })
    await context.addInitScript(() => localStorage.setItem('theme', 'light'))
    await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: base }])
    await context.route(/\/(?:api|v1)\//, async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/v1/auth/refresh') return route.fulfill({ json: { access_token: 'synthetic', user: { id: '33333333-3333-4333-8333-333333333333', name: 'Preview', email: 'preview@example.invalid', credits: 100, plan: 'free', access_role: 'member' } } })
      if (path === '/api/user/brand') return route.fulfill({ json: { brandKit: { primaryColor: '#7856ff' } } })
      if (path === '/api/user/credits') return route.fulfill({ json: { credits: 100 } })
      if (path === '/api/assistant/history') return route.fulfill({ json: { messages: [] } })
      return route.abort()
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}${locale === 'ro' ? '/ro' : ''}/dashboard/create`, { waitUntil: 'networkidle', timeout: 120000 })
    await page.locator('.creation-configuration').waitFor()
    await page.screenshot({ path: `${output}/${locale}-desktop.png`, fullPage: true })
    assert.equal(await page.locator('.creation-inspector-card').count(), 2)
    const source = await page.locator('.creation-source').boundingBox()
    const inspector = await page.locator('.creation-inspector').boundingBox()
    assert.ok(inspector.x > source.x + source.width)
    assert.ok(Math.abs(inspector.y - source.y) < 2)
    assert.ok(source.height < 230)
    assert.equal(await page.getByRole('button', { name: messages.create.advanced, exact: true }).count(), 0)
    const brand = page.getByRole('combobox', { name: messages.create.brandKit, exact: true })
    await brand.click()
    await page.getByRole('option', { name: messages.create.brandSaved, exact: true }).click()
    assert.match(await brand.innerText(), new RegExp(messages.create.brandSaved))
    await brand.click()
    await page.getByRole('option', { name: messages.create.brandNone, exact: true }).click()
    const language = page.getByRole('combobox', { name: messages.create.language })
    await language.click()
    await page.getByRole('option', { name: 'English', exact: true }).click()
    assert.equal(await language.innerText(), 'English')
    await language.click()
    await page.getByRole('option', { name: messages.create.languageAuto, exact: true }).click()
    assert.equal(await language.innerText(), messages.create.languageAuto)
    const crop = page.getByRole('switch', { name: messages.create.smartCrop, exact: true })
    await crop.click()
    assert.equal(await crop.getAttribute('aria-checked'), 'false')
    await crop.click()
    const slider = page.getByRole('slider', { name: messages.create.clipsPerVideo })
    await slider.focus()
    await slider.press('Home')
    for (let i = 1; i < 8; i++) await slider.press('ArrowRight')
    assert.match(await page.locator('.creation-cost').innerText(), /80/)
    assert.match(await page.locator('.creation-configuration').innerText(), /8/)
    await page.getByRole('button', { name: '1:1', exact: true }).click()
    assert.match(await page.locator('.creation-configuration').innerText(), /1:1/)

    await page.getByRole('switch', { name: messages.create.subtitles, exact: true }).click()
    assert.match(await page.locator('.creation-configuration').innerText(), new RegExp(messages.create.subtitleNone))
    await page.getByRole('tab', { name: messages.create.upload, exact: true }).click()
    await page.getByRole('tab', { name: messages.create.batch, exact: true }).click()
    await page.getByRole('tab', { name: messages.create.youtube, exact: true }).click()
    await page.locator('#youtube-url').fill('invalid-url')
    assert.equal(await page.locator('#youtube-url').getAttribute('aria-invalid'), 'true')
    assert.equal(await page.getByRole('button', { name: messages.create.generateAction, exact: true }).isDisabled(), true)
    await page.locator('#youtube-url').fill('')
    await slider.focus()
    await slider.press('Home')
    for (let i = 1; i < 5; i++) await slider.press('ArrowRight')
    await page.getByRole('button', { name: '9:16', exact: true }).click()
    await page.locator('.creation-settings-subtitles button').first().click()

    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path: `${output}/${locale}-${width}.png`, fullPage: true })
    }
    assert.deepEqual(errors, [])
    console.log(`PASS ${locale}: desktop/mobile layout, clip slider, preview, cost, advanced subtitles, source tabs and invalid URL`)
    await context.close()
  }
} finally { await browser.close() }
