import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5199'
const output = resolve('test-results/mobile-feedback')
await mkdir(output, { recursive: true })
const font = await readFile(
  resolve('../backend/internal/captions/assets/inter-700.ttf')
)
let kit = {
  logoUrl: '/synthetic-logo.svg',
  primaryColor: '#000000',
  secondaryColor: '#ffffff',
  fontFamily: 'Inter',
  applyBrandColors: false,
  applyBrandFont: false,
  subtitleFont: 'Inter Bold',
  subtitleColor: '#FFFFFF',
  subtitleBgColor: '#000000',
  subtitleBgOpacity: 0,
  subtitlePosition: 'bottom',
  watermarkPosition: 'bottom-right',
  watermarkOpacity: 0.8,
  hidePlatformBadge: false,
  watermarkEnabled: true,
  watermarkSize: 0.25,
  watermarkMargin: 0.025,
  watermarkX: null,
  watermarkY: null,
  captionStyle: {
    version: 1,
    preset: 'classic',
    font_id: 'builtin:inter',
    weight: 700,
    size: 0.05,
    text_color: '#FFFFFF',
    outline_color: '#000000',
    outline: 0,
    shadow: 0,
    background_color: '#000000',
    background_opacity: 0,
    highlight_color: '#FFE066',
    align: 'center',
    max_width: 0.88,
    max_lines: 2,
    line_spacing: 1.15,
    position: { x: 0.5, y: 0.6, anchor: 'center' }
  }
}
const user = {
  id: '00000000-0000-4000-8000-000000000052',
  email: 'gesture@example.invalid',
  name: 'Gesture Test',
  credits: 100,
  plan: 'free',
  access_role: 'member'
}
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/synthetic-logo.svg', (route) =>
  route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="gold"/></svg>'
  })
)
await page.route('**/v1/**', (route) =>
  route.fulfill({ json: { access_token: 'synthetic-token', user } })
)
await page.route('**/api/**', async (route) => {
  const url = new URL(route.request().url())
  if (url.pathname === '/api/user/brand/fonts')
    return route.fulfill({
      json: {
        fonts: [
          {
            id: 'builtin:inter',
            family: 'Inter',
            category: 'sans-serif',
            weights: [700],
            romanian: true
          }
        ]
      }
    })
  if (url.pathname === '/api/user/brand/font-file')
    return route.fulfill({ contentType: 'font/ttf', body: font })
  if (url.pathname === '/api/user/brand') {
    if (route.request().method() === 'PUT')
      kit = { ...kit, ...route.request().postDataJSON() }
    return route.fulfill({ json: { brandKit: kit, plan: 'free' } })
  }
  if (url.pathname.endsWith('/runs'))
    return route.fulfill({ json: { runs: [], has_more: false } })
  if (url.pathname.endsWith('/suggestions'))
    return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  return route.fulfill({ json: {} })
})
async function pinch(locator, factor, dx = 0, dy = 0) {
  await locator.evaluate((node) =>
    node.scrollIntoView({ block: 'center', behavior: 'instant' })
  )
  const box = await locator.boundingBox()
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2
  const radius = Math.min(18, box.width / 4)
  const client = await context.newCDPSession(page)
  try {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, x: cx - radius, y: cy },
        { id: 2, x: cx + radius, y: cy }
      ]
    })
    for (let step = 1; step <= 8; step++) {
      const spread = radius * (1 + ((factor - 1) * step) / 8)
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { id: 1, x: cx + (dx * step) / 8 - spread, y: cy + (dy * step) / 8 },
          { id: 2, x: cx + (dx * step) / 8 + spread, y: cy + (dy * step) / 8 }
        ]
      })
    }
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: []
    })
  } finally {
    await client.detach()
  }
}
try {
  await page.goto(origin + '/dashboard/brand', {
    waitUntil: 'domcontentloaded',
    timeout: 90000
  })
  const caption = page.getByRole('button', {
    name: 'Caption position. Drag or use arrow keys.'
  })
  await caption.waitFor()
  const before = await caption.evaluate((node) =>
    parseFloat(getComputedStyle(node).fontSize)
  )
  await pinch(caption, 1.45)
  const after = await caption.evaluate((node) =>
    parseFloat(getComputedStyle(node).fontSize)
  )
  assert.ok(after > before * 1.3, `caption glyphs grow: ${before} -> ${after}`)
  const logo = page.locator('img[role="button"]')
  await logo.waitFor()
  const originalLogo = await logo.boundingBox()
  await pinch(logo, 1.35, -35, -25)
  const resizedLogo = await logo.boundingBox()
  assert.ok(resizedLogo.width > originalLogo.width * 1.2)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForFunction(() => document.body.innerText.includes('Saved'))
  assert.ok(kit.captionStyle.size > 0.06)
  assert.ok(kit.watermarkSize > 0.3)
  assert.ok(Number.isFinite(kit.watermarkX) && Number.isFinite(kit.watermarkY))
  const saved = structuredClone(kit)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await caption.waitFor()
  await logo.waitFor()
  const loaded = await caption.evaluate((node) =>
    parseFloat(getComputedStyle(node).fontSize)
  )
  assert.ok(Math.abs(loaded - after) < 0.2)
  assert.equal(kit.watermarkX, saved.watermarkX)
  await page.getByRole('button', { name: 'Top left', exact: true }).click()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForFunction(() => document.body.innerText.includes('Saved'))
  assert.equal(kit.watermarkX, null)
  assert.equal(kit.watermarkY, null)
  assert.equal(kit.watermarkPosition, 'top-left')
  await caption.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: resolve(output, 'brand-mobile.png'),
    fullPage: true
  })
  assert.deepEqual(errors, [])
  await writeFile(
    resolve(output, 'brand-summary.json'),
    JSON.stringify(
      {
        status: 'passed',
        before,
        after,
        loaded,
        originalLogo,
        resizedLogo,
        saved,
        errors
      },
      null,
      2
    )
  )
  console.log(
    'PASS: Brand Kit real two-finger caption and logo transforms, save/reload, corner reset'
  )
} finally {
  await browser.close()
}
