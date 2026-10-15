import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
)
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5194'
const output = resolve('test-results/brand-captions')
await mkdir(output, { recursive: true })
const assets = resolve('../backend/internal/captions/assets')
const catalog = JSON.parse(
  await readFile(resolve(assets, 'catalog.json'), 'utf8')
)
const fonts = catalog.map((f) => ({
  id: f.id,
  family: f.family,
  category: f.category,
  weights: f.weights,
  romanian: true
}))
const style = {
  version: 1,
  preset: 'classic',
  font_id: 'builtin:inter',
  weight: 700,
  size: 0.05,
  text_color: '#FFFFFF',
  outline_color: '#000000',
  outline: 2,
  shadow: 0,
  background_color: '#000000',
  background_opacity: 0,
  highlight_color: '#FFE066',
  align: 'center',
  max_width: 0.88,
  max_lines: 2,
  line_spacing: 1.15,
  position: { x: 0.5, y: 0.84, anchor: 'center' }
}
let kit = {
  logoUrl: null,
  primaryColor: '#6366F1',
  secondaryColor: '#8B5CF6',
  fontFamily: 'Inter',
  applyBrandColors: false,
  applyBrandFont: false,
  subtitleFont: 'Inter Bold',
  subtitleColor: '#FFFFFF',
  subtitleBgColor: '#000000',
  subtitleBgOpacity: 0.7,
  subtitlePosition: 'bottom',
  watermarkPosition: 'bottom-right',
  watermarkOpacity: 0.8,
  hidePlatformBadge: false,
  watermarkEnabled: true,
  watermarkSize: 0.18,
  watermarkMargin: 0.025,
  captionStyle: style
}
const user = {
  id: '00000000-0000-4000-8000-000000000052',
  email: 'caption-fixture@example.invalid',
  name: 'Caption Test',
  credits: 100,
  plan: 'free',
  access_role: 'member'
}
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  hasTouch: true
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
let saved = 0,
  fontLoads = 0
await page.route('**/v1/**', (route) =>
  route.fulfill({ json: { access_token: 'synthetic-token', user } })
)
await page.route('**/api/**', async (route) => {
  const req = route.request(),
    url = new URL(req.url())
  if (url.pathname === '/api/user/brand/fonts') {
    if (req.method() === 'POST') {
      assert.equal(url.searchParams.get('license_confirmed'), 'true')
      const font = {
        id: '00000000-0000-4000-8000-000000000053',
        family: 'Open Sans',
        category: 'custom',
        weights: [700],
        romanian: true
      }
      fonts.push(font)
      return route.fulfill({ status: 201, json: { font } })
    }
    if (req.method() === 'DELETE') {
      fonts.find((f) => f.id === url.searchParams.get('id')).archived = true
      return route.fulfill({ json: {} })
    }
    return route.fulfill({ json: { fonts } })
  }
  if (url.pathname === '/api/user/brand/font-file') {
    fontLoads++
    const font =
      catalog.find((f) => f.id === url.searchParams.get('id')) ||
      catalog.find((f) => f.id === 'builtin:open-sans')
    return route.fulfill({
      contentType: 'font/ttf',
      body: await readFile(
        resolve(assets, font.files[url.searchParams.get('weight')])
      )
    })
  }
  if (url.pathname === '/api/user/brand') {
    if (req.method() === 'PUT') {
      const payload = req.postDataJSON()
      assert.equal(payload.id, undefined)
      assert.equal(payload.userId, undefined)
      kit = { ...kit, ...payload }
      saved++
    }
    return route.fulfill({ json: { brandKit: kit, plan: 'free' } })
  }
  if (url.pathname === '/api/workspace-agent/runs')
    return route.fulfill({ json: { runs: [], has_more: false } })
  if (url.pathname === '/api/workspace-agent/suggestions')
    return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  return route.fulfill({ json: {} })
})
try {
  await page.goto(origin + '/dashboard/brand', {
    waitUntil: 'domcontentloaded',
    timeout: 180000
  })
  await page
    .getByRole('heading', { name: 'Logo & watermark', exact: true })
    .waitFor()
  assert.equal(
    await page.getByRole('heading', { name: 'Captions', exact: true }).count(),
    1
  )
  assert.doesNotMatch(
    await page.locator('body').innerText(),
    /Brand Colors|Brand Typeface|Kit readiness/
  )
  assert.equal(
    await page.locator('[role="listbox"] [role="option"]').count(),
    32
  )
  await page
    .getByRole('button', { name: 'Caption position. Drag or use arrow keys.' })
    .waitFor()
  assert.ok(fontLoads <= 3, 'Initial preview does not load all fonts')
  const caption = page.getByRole('button', {
    name: 'Caption position. Drag or use arrow keys.'
  })
  await page.getByRole('combobox', { name: 'Weight', exact: true }).selectOption('900')
  await page.waitForFunction(() => {
    const preview = document.querySelector('[aria-label="Caption position. Drag or use arrow keys."]')
    return preview && getComputedStyle(preview).fontWeight === '900'
  })
  for (const label of ['Letter spacing', 'Word spacing', 'Line spacing']) {
    const slider = page.getByRole('slider', { name: label, exact: true })
    await slider.focus()
    await page.keyboard.press('ArrowRight')
  }
  await page.waitForFunction(() => {
    const preview = document.querySelector('[aria-label="Caption position. Drag or use arrow keys."]')
    return preview && parseFloat(getComputedStyle(preview).letterSpacing) > 0 &&
      parseFloat(getComputedStyle(preview).wordSpacing) > 0
  })
  await caption.focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  assert.equal(
    await page.getByLabel('Horizontal (%)', { exact: true }).inputValue(),
    '49'
  )
  assert.equal(
    await page.getByLabel('Vertical (%)', { exact: true }).inputValue(),
    '83'
  )
  const b = await caption.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + 25, b.y + b.height / 2 - 80, {
    steps: 6
  })
  await page.mouse.up()
  const movedY = Number(
    await page.getByLabel('Vertical (%)', { exact: true }).inputValue()
  )
  assert.ok(movedY < 80)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForFunction(() => document.body.innerText.includes('Saved'))
  assert.equal(saved, 1)
  assert.equal(kit.captionStyle.weight, 900)
  assert.equal(kit.captionStyle.letter_spacing, 0.01)
  assert.equal(kit.captionStyle.word_spacing, 0.01)
  assert.equal(kit.captionStyle.line_spacing, 1.2)
  await page.reload()
  await page.getByRole('heading', { name: 'Captions', exact: true }).waitFor()
  assert.equal(await page.getByRole('combobox', { name: 'Weight', exact: true }).inputValue(), '900')
  assert.equal(await page.getByRole('slider', { name: 'Letter spacing', exact: true }).getAttribute('aria-valuenow'), '0.01')
  assert.equal(
    Number(await page.getByLabel('Vertical (%)', { exact: true }).inputValue()),
    movedY
  )
  await page.locator('#caption-font-search').fill('Open Sans')
  await page.getByRole('option', { name: 'Open Sans', exact: true }).click()
  await page.getByRole('button', { name: 'Karaoke fill', exact: true }).click()
  await page.getByText('Upload your font', { exact: true }).click()
  await page
    .getByRole('switch', { name: 'I have permission to use this font.' })
    .check()
  await page
    .locator('input[type="file"][accept=".ttf,.otf"]')
    .setInputFiles(resolve(assets, 'open-sans-700.ttf'))
  await page.waitForFunction(
    () =>
      document.querySelector('[role="option"][aria-selected="true"]')
        ?.textContent === 'Open Sans'
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForFunction(() => document.body.innerText.includes('Saved'))
  assert.equal(kit.captionStyle.font_id, '00000000-0000-4000-8000-000000000053')
  await page.getByRole('button', { name: '16:9', exact: true }).click()
  await page.screenshot({
    path: resolve(output, 'desktop.png'),
    fullPage: true
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '9:16', exact: true }).click()
  await caption.scrollIntoViewIfNeeded()
  const touchBox = await caption.boundingBox()
  const beforeTouch = Number(
    await page.getByLabel('Vertical (%)', { exact: true }).inputValue()
  )
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      {
        x: touchBox.x + touchBox.width / 2,
        y: touchBox.y + touchBox.height / 2
      }
    ]
  })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      {
        x: touchBox.x + touchBox.width / 2,
        y: touchBox.y + touchBox.height / 2 - 50
      }
    ]
  })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  })
  assert.ok(
    Number(
      await page.getByLabel('Vertical (%)', { exact: true }).inputValue()
    ) < beforeTouch,
    'Touch drag moves normalized caption position'
  )
  await cdp.detach()
  await page.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true })
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth
    ),
    false,
    'No mobile horizontal overflow'
  )
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({
      passed: true,
      fonts: 32,
      presets: 12,
      fontLoads,
      saved,
      draggedY: movedY,
      screenshots: output
    })
  )
} finally {
  await browser.close()
}
