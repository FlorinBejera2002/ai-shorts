import assert from 'node:assert/strict'
import { mkdir, readFile, stat, utimes, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { syntheticMp4Response, syntheticPng } from './fixtures/synthetic-media.mjs'

// Start Vite separately. Every account, saved kit, font upload, logo operation
// and clip is synthetic. Unexpected writes are blocked before reaching a backend.
if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
const output = new URL('../test-results/brand-kit-layout/', import.meta.url)
const assets = new URL('../../backend/internal/captions/assets/', import.meta.url)
const catalog = JSON.parse(await readFile(new URL('catalog.json', assets), 'utf8'))
const fonts = catalog.map(font => ({
  id: font.id, family: font.family, category: font.category, weights: font.weights,
  romanian: true
}))
const user = {
  id: '00000000-0000-4000-8000-000000000811', email: 'brand-kit-layout@example.invalid',
  name: 'Design Workspace', plan: 'pro', credits: 100, access_role: 'member'
}
const initialStyle = {
  version: 1, preset: 'classic', font_id: 'builtin:inter', weight: 700,
  size: 0.05, text_color: '#FFFFFF', outline_color: '#000000', outline: 2,
  shadow: 0, background_color: '#000000', background_opacity: 0,
  highlight_color: '#FFE066', align: 'center', max_width: 0.88, max_lines: 2,
  line_spacing: 1.15, letter_spacing: 0, word_spacing: 0,
  position: { x: 0.5, y: 0.6, anchor: 'center' }
}
const logoUrl = `${origin}/__brand-fixture__/logo.svg`
const uploadedLogoUrl = `${origin}/__brand-fixture__/uploaded-logo.svg`
const clipUrl = `${origin}/__brand-fixture__/clip.mp4`
const customFontId = '00000000-0000-4000-8000-000000000812'
let kit = {
  logoUrl, primaryColor: '#000000', secondaryColor: '#FFFFFF', fontFamily: 'Inter',
  applyBrandColors: false, applyBrandFont: false, subtitleFont: 'Inter Bold',
  subtitleColor: '#FFFFFF', subtitleBgColor: '#000000', subtitleBgOpacity: 0,
  subtitlePosition: 'bottom', watermarkEnabled: true, watermarkSize: 0.18,
  watermarkMargin: 0.025, watermarkX: null, watermarkY: null,
  watermarkPosition: 'bottom-right', watermarkOpacity: 0.8,
  hidePlatformBadge: false, captionStyle: structuredClone(initialStyle)
}
const initialKit = structuredClone(kit)
const poster = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#eec28d"/><stop offset="1" stop-color="#d27e50"/></linearGradient></defs><rect width="540" height="960" fill="#29231f"/><path d="M30 100 510 160V725H30Z" fill="url(#sky)"/><circle cx="390" cy="440" r="70" fill="#ffe9ae"/><path d="M30 620h40v-90h48v40h45v-135h42v120h35v-36h44v90h35v-148h47v138h43v-53h46v75h65v115H30Z" fill="#7c6d65" opacity=".6"/><path d="M30 100v625M185 120v605M345 140v585M510 160v565" stroke="#2d302c" stroke-width="15"/><path d="M0 725h540v235H0" fill="#876541"/><path d="M80 700H455M120 700v210M415 700v210" stroke="#33271e" stroke-width="18"/><rect x="220" y="615" width="112" height="78" rx="5" fill="#a69784"/><path d="M50 760v-150q-64-110-43-125 45 3 43 103 66-146 92-100-11 54-91 130M465 700v-103q-64-108-82-63 9 43 82 102 46-110 67-78-11 46-66 91" fill="#3b5132"/><path d="M15 753h72l-10 73H27Zm410-55h78l-12 55h-56Z" fill="#8d8063"/></svg>').toString('base64')}`
const logoSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90"><path d="M16 8h62L30 45h48L16 82h62" fill="#7847ff"/><text x="92" y="60" font-family="sans-serif" font-size="34" font-weight="700" fill="#fff">studio</text></svg>'
const errors = []
const blockedMutations = []
const saveAttempts = []
const successfulSaves = []
const fontUploads = []
const logoChanges = []
const fontLoads = []
const expectedFailures = new Set()
let canWhiteLabel = false
let failNextSave = false
let releaseFontUpload
let releaseLogoUpload
let fastRefreshVerified = false
const fontUploadGate = new Promise(resolve => { releaseFontUpload = resolve })
const logoUploadGate = new Promise(resolve => { releaseLogoUpload = resolve })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width: 1488, height: 1058 }, timezoneId: 'Europe/Bucharest',
  hasTouch: true, colorScheme: 'dark', reducedMotion: 'reduce'
})
// Verify the Copy control without replacing the user's system clipboard.
await context.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async value => { window.brandFixtureClipboard = value } }
}))
const page = await context.newPage()
page.setDefaultTimeout(30000)
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => {
  if (message.type() !== 'error') return
  if (expectedFailures.has(message.location().url) && /503/.test(message.text())) return
  errors.push(message.text())
})
await context.route('**/v1/**', route => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
await context.route('**/__brand-fixture__/clip.mp4', route => route.fulfill(syntheticMp4Response(route.request().headers().range)))
await context.route('**/__brand-fixture__/*logo.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: logoSvg }))
await context.route('**/api/**', async route => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.pathname === '/api/user/brand/fonts') {
    if (request.method() === 'POST') {
      assert.equal(url.searchParams.get('license_confirmed'), 'true', 'Custom font upload requires explicit permission')
      fontUploads.push(request.postDataBuffer())
      await fontUploadGate
      const font = { id: customFontId, family: 'Synthetic Display', category: 'custom', weights: [700], romanian: false }
      fonts.push(font)
      return route.fulfill({ status: 201, json: { font } })
    }
    if (request.method() === 'GET') return route.fulfill({ json: { fonts } })
  }
  if (url.pathname === '/api/user/brand/font-file' && request.method() === 'GET') {
    fontLoads.push(`${url.searchParams.get('id')}:${url.searchParams.get('weight')}`)
    const font = catalog.find(font => font.id === url.searchParams.get('id')) ?? catalog.find(font => font.id === 'builtin:open-sans')
    const filename = font.files[url.searchParams.get('weight')] ?? Object.values(font.files)[0]
    return route.fulfill({ contentType: 'font/ttf', body: await readFile(new URL(filename, assets)) })
  }
  if (url.pathname === '/api/user/brand/logo') {
    if (request.method() === 'POST') {
      logoChanges.push('upload')
      await logoUploadGate
      kit = { ...kit, logoUrl: uploadedLogoUrl }
      return route.fulfill({ json: { brandKit: kit } })
    }
    if (request.method() === 'DELETE') {
      logoChanges.push('remove')
      kit = { ...kit, logoUrl: null }
      return route.fulfill({ json: { brandKit: kit } })
    }
  }
  if (url.pathname === '/api/user/brand') {
    if (request.method() === 'PUT') {
      const payload = request.postDataJSON()
      assert.equal(payload.id, undefined)
      assert.equal(payload.userId, undefined)
      saveAttempts.push(payload)
      if (failNextSave) {
        failNextSave = false
        expectedFailures.add(url.href)
        return route.fulfill({ status: 503, json: { error: 'Synthetic temporary save failure' } })
      }
      kit = { ...kit, ...payload }
      successfulSaves.push(structuredClone(payload))
    }
    if (['GET', 'PUT'].includes(request.method()))
      return route.fulfill({ json: { brandKit: kit, plan: 'pro', canWhiteLabel } })
  }
  if (request.method() !== 'GET') {
    blockedMutations.push(`${request.method()} ${url.pathname}`)
    return route.fulfill({ status: 405, json: { error: 'Unexpected mutation blocked by synthetic browser fixture' } })
  }
  if (url.pathname === '/api/clips/library') return route.fulfill({ json: {
    clips: [{ id: '00000000-0000-4000-8000-000000000813', title: 'Synthetic studio preview',
      thumbnailUrl: poster, previewUrl: clipUrl, fileUrl: clipUrl, duration: 2 }],
    total: 1, hasMore: false
  } })
  if (url.pathname === '/api/publishing') return route.fulfill({ json: { providers: [], accounts: [], clips: [], posts: [] } })
  if (url.pathname === '/api/calendar') return route.fulfill({ json: { posts: [], clips: [] } })
  if (url.pathname === '/api/user/profile') return route.fulfill({ json: { profile: {
    ...user, image: null, provider: 'password', canChangePassword: true,
    recentlyAuthenticated: true, emailVerified: new Date().toISOString(), createdAt: new Date().toISOString()
  } } })
  if (url.pathname === '/api/workspace-agent/runs') return route.fulfill({ json: { runs: [], has_more: false } })
  if (url.pathname === '/api/workspace-agent/suggestions') return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  return route.fulfill({ json: {} })
})

const root = page.locator('[data-brand-workspace][data-preview-expanded], [data-brand-workspace] [data-preview-expanded]')
const preview = page.locator('[data-brand-preview]')
const savebar = page.locator('[data-brand-save-bar]')
const saveButton = savebar.getByRole('button', { name: /^(Save changes|Save|Saved)$/ })
const discard = savebar.getByRole('button', { name: 'Discard', exact: true })
const caption = preview.locator('[data-brand-caption]')
const logo = preview.locator('img[role="button"]')
const video = preview.locator('[data-brand-preview-video]')
const presetNames = [
  'Classic subtitles', 'Minimal clean', 'Bold outlined', 'High-contrast box',
  'Large headline', 'Word by word', 'Karaoke fill', 'Active word color',
  'Active word background', 'Phrase pop-in', 'Subtle fade', 'Stacked two lines'
]

async function clean(expected = true) {
  assert.equal(await discard.isDisabled(), expected, expected ? 'Preview-only changes leave the kit saved' : 'Settings changes remain unsaved')
}

async function overview() {
  if (await root.getAttribute('data-preview-expanded') === 'true') {
    await root.locator('[data-brand-back]').click()
    await page.waitForFunction(() => document.querySelector('[data-brand-workspace][data-preview-expanded], [data-brand-workspace] [data-preview-expanded]')?.getAttribute('data-preview-expanded') === 'false')
  }
  if (await root.getAttribute('data-section') !== 'overview') {
    await root.locator('[data-brand-back]').click()
    await page.waitForFunction(() => document.querySelector('[data-brand-workspace][data-preview-expanded], [data-brand-workspace] [data-preview-expanded]')?.getAttribute('data-section') === 'overview')
  }
}

async function section(name) {
  await overview()
  await root.locator(`[data-brand-section-trigger="${name}"]`).click()
  await page.waitForFunction(expected => document.querySelector('[data-brand-workspace][data-preview-expanded], [data-brand-workspace] [data-preview-expanded]')?.getAttribute('data-section') === expected, name)
}

async function noOverflow(name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow`)
  await assertCaptionFits(name)
}

async function assertCaptionFits(name) {
  try {
    await page.waitForFunction(() => {
      const stage = document.querySelector('[data-brand-preview-stage]')
      const caption = document.querySelector('[data-brand-caption]')
      if (!stage || !caption) return false
      const frame = stage.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(caption)
      const text = range.getBoundingClientRect()
      const computedFont = parseFloat(getComputedStyle(caption).fontSize)
      const targetFont = parseFloat(caption.style.fontSize)
      return frame.width > 0 && text.width > 0 &&
        Math.abs(computedFont - targetFont) < 0.02 &&
        text.left >= frame.left - 1 && text.right <= frame.right + 1 &&
        text.top >= frame.top - 1 && text.bottom <= frame.bottom + 1
    })
  } catch (error) {
    console.log(`${name}: caption containment diagnostic`, await page.evaluate(() => {
      const stage = document.querySelector('[data-brand-preview-stage]')
      const caption = document.querySelector('[data-brand-caption]')
      const measure = node => {
        if (!node) return null
        const rect = node.getBoundingClientRect()
        const computed = getComputedStyle(node)
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
          right: rect.right, bottom: rect.bottom, offsetWidth: node.offsetWidth,
          scrollWidth: node.scrollWidth, fontSize: computed.fontSize,
          fontFamily: computed.fontFamily, inlineStyle: node.getAttribute('style') }
      }
      return { stage: measure(stage), caption: measure(caption), lines: Array.from(caption?.children ?? []).map(measure) }
    }))
    throw error
  }
}

async function capture(name) {
  await mkdir(output, { recursive: true })
  await page.mouse.move(0, 0)
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0) })
  await page.locator('img').evaluateAll(images => Promise.all(images
    .filter(image => { const r = image.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight })
    .map(image => image.decode().catch(() => {}))))
  await assertCaptionFits(name)
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: false })
}

async function dismissToasts() {
  const close = page.locator('div.animate-toast-in').getByRole('button', { name: 'Close', exact: true })
  while (await close.count()) await close.last().click()
}

async function save(status = 200) {
  const response = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === '/api/user/brand')
  await saveButton.click()
  assert.equal((await response).status(), status)
  if (status === 200) {
    await page.waitForFunction(() => document.querySelector('[data-brand-save-state="saved"]'))
    await clean()
    await dismissToasts()
  }
  return saveAttempts.at(-1)
}

async function setSwitch(label, checked) {
  const control = root.getByRole('switch', { name: label, exact: true })
  if ((await control.getAttribute('aria-checked') === 'true') !== checked) await control.click()
  assert.equal(await control.getAttribute('aria-checked'), String(checked))
}

async function chooseFont(name) {
  await root.getByRole('button', { name: 'Subtitle font', exact: true }).click()
  await page.locator('#caption-font-search').fill(name)
  await page.getByRole('option', { name, exact: true }).click()
}

async function slider(label, key, count = 1) {
  const control = root.getByRole('slider', { name: label, exact: true })
  for (let index = 0; index < count; index++) await control.press(key)
  return Number(await control.getAttribute('aria-valuenow'))
}

async function fillRatio(label, value) {
  const rangeControl = root.getByRole('slider', { name: label, exact: false })
  const range = await rangeControl.count() > 0
  const control = range ? rangeControl : root.getByLabel(label, { exact: false })
  const max = Number(await control.getAttribute(range ? 'aria-valuemax' : 'max'))
  const multiplier = max > 1 ? 100 : 1
  if (range) {
    const target = value * multiplier
    await control.press('End')
    if (target !== max) {
      await control.press('ArrowLeft')
      const next = Number(await control.getAttribute('aria-valuenow'))
      const step = max - next
      assert.ok(step > 0, 'Caption width slider has a positive keyboard step')
      for (let remaining = Math.round((next - target) / step); remaining > 0; remaining--) await control.press('ArrowLeft')
    }
    assert.equal(Number(await control.getAttribute('aria-valuenow')), target)
    return
  }
  await control.fill(String(value * multiplier))
}

async function rememberShell() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => {
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    window.brandShellProbe = { main: document.querySelector('main'), header: document.querySelector('header.studio-topbar'), sidebar, state: sidebar?.getAttribute('data-state') }
  })
}

async function assertShell() {
  assert.equal(await page.evaluate(() => {
    const probe = window.brandShellProbe
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    return !!probe?.main && !!probe.header && probe.main === document.querySelector('main') &&
      probe.header === document.querySelector('header.studio-topbar') && probe.sidebar === sidebar && probe.state === sidebar?.getAttribute('data-state')
  }), true, 'Brand section, preview and route interactions preserve dashboard DOM and sidebar state')
}

async function pinch(locator, factor) {
  await locator.scrollIntoViewIfNeeded()
  const bounds = await locator.boundingBox()
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  const radius = Math.min(18, bounds.width / 4)
  const client = await context.newCDPSession(page)
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: x - radius, y }, { id: 2, x: x + radius, y }] })
    for (let step = 1; step <= 6; step++) {
      const spread = radius * (1 + (factor - 1) * step / 6)
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x - spread, y }, { id: 2, x: x + spread, y }] })
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally { await client.detach() }
}

async function verifyFastRefresh() {
  if (process.env.RUN_FAST_REFRESH !== '1') {
    console.log('SKIPPED Brand Kit Fast Refresh source probe; set RUN_FAST_REFRESH=1 after concurrent source edits stop')
    return
  }
  const sourcePath = new URL('../src/components/dashboard/brand/logo-section.tsx', import.meta.url)
  const anchor = 'id="brand-logo"'
  const marker = `${anchor} data-brand-refresh-probe="updated"`
  const timestamps = await stat(sourcePath)
  const source = await readFile(sourcePath, 'utf8')
  assert.equal(source.split(anchor).length, 2, 'Logo refresh probe anchor is unique')
  const before = {
    pending: await root.locator('[data-brand-font-pending]').innerText(),
    weight: await root.getByRole('combobox', { name: 'Weight', exact: true }).inputValue(),
    letter: await root.getByRole('slider', { name: 'Letter spacing', exact: true }).getAttribute('aria-valuenow'),
    word: await root.getByRole('slider', { name: 'Word spacing', exact: true }).getAttribute('aria-valuenow'),
    line: await root.getByRole('slider', { name: 'Line spacing', exact: true }).getAttribute('aria-valuenow'),
    font: await root.getByRole('button', { name: 'Subtitle font', exact: true }).innerText()
  }
  await page.evaluate(() => {
    window.brandRefreshProbe = {
      root: document.querySelector('[data-brand-workspace]'),
      preview: document.querySelector('[data-brand-preview]'),
      video: document.querySelector('[data-brand-preview-video]'),
      pending: document.querySelector('[data-brand-font-pending]')
    }
  })
  async function assertState() {
    assert.equal(await root.getAttribute('data-section'), 'typography')
    assert.equal(await root.locator('[data-brand-font-pending]').innerText(), before.pending)
    assert.equal(await root.getByRole('combobox', { name: 'Weight', exact: true }).inputValue(), before.weight)
    assert.equal(await root.getByRole('slider', { name: 'Letter spacing', exact: true }).getAttribute('aria-valuenow'), before.letter)
    assert.equal(await root.getByRole('slider', { name: 'Word spacing', exact: true }).getAttribute('aria-valuenow'), before.word)
    assert.equal(await root.getByRole('slider', { name: 'Line spacing', exact: true }).getAttribute('aria-valuenow'), before.line)
    assert.equal(await root.getByRole('button', { name: 'Subtitle font', exact: true }).innerText(), before.font)
    assert.equal(await root.locator('[data-brand-font-upload]').isDisabled(), true)
    assert.equal(await page.evaluate(() => {
      const previous = window.brandRefreshProbe
      return previous.root === document.querySelector('[data-brand-workspace]') &&
        previous.preview === document.querySelector('[data-brand-preview]') &&
        previous.video === document.querySelector('[data-brand-preview-video]') &&
        previous.pending === document.querySelector('[data-brand-font-pending]')
    }), true, 'Component Fast Refresh preserves native video, staged font and workspace DOM')
    await clean(false)
    await assertShell()
  }
  try {
    await writeFile(sourcePath, source.replace(anchor, marker))
    await page.locator('[data-brand-refresh-probe="updated"]').waitFor({ state: 'attached' })
    await assertState()
  } finally {
    try {
      const current = await readFile(sourcePath, 'utf8')
      if (current.includes(marker)) await writeFile(sourcePath, current.replace(marker, anchor))
      await page.waitForFunction(() => !document.querySelector('[data-brand-refresh-probe]'))
      assert.equal(await readFile(sourcePath, 'utf8'), source, 'Fast Refresh probe restores the original LogoSection source')
    } finally {
      await utimes(sourcePath, timestamps.atime, timestamps.mtime)
    }
  }
  await assertState()
  fastRefreshVerified = true
  console.log('Brand Kit component Fast Refresh preserves typography, staged font, unsaved values, native video and dashboard DOM')
}

async function captureReferenceStates() {
  // Functional assertions deliberately use unusual values. Restore only this
  // runner's mocked kit so the reference captures show readable default styling.
  kit = structuredClone(initialKit)
  canWhiteLabel = false
  await page.setViewportSize({ width: 1488, height: 1058 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.reload({ waitUntil: 'networkidle' })
  await root.waitFor()
  if (await page.locator('[data-slot="sidebar"]').getAttribute('data-state') === 'collapsed')
    await page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click()
  await page.waitForFunction(() => document.querySelector('[data-brand-preview-video]')?.readyState >= 2)
  await clean()
  await capture('desktop-overview')
  await preview.locator('[data-brand-preview-mode="social"]').click()
  for (const platform of ['instagram', 'tiktok', 'youtube', 'facebook']) {
    await preview.locator(`[data-brand-social-platform="${platform}"]`).click()
    await capture(`desktop-${platform}`)
  }
  await preview.locator('[data-brand-preview-mode="canvas"]').click()
  await section('styles')
  await root.getByRole('button', { name: 'Karaoke fill', exact: true }).click()
  await capture('desktop-caption-styles')
  for (const [name, filename] of [['typography', 'typography'], ['colors', 'colors-effects'], ['layout', 'layout-preview'], ['logo', 'logo-watermark']]) {
    await section(name)
    await capture(`desktop-${filename}`)
    if (name === 'colors') {
      await root.locator('[data-brand-color-field="caption-text"]').getByRole('button', { name: 'Text color Choose color', exact: true }).click()
      await page.getByRole('dialog', { name: 'Text color', exact: true }).waitFor()
      await capture('desktop-color-picker')
      await page.keyboard.press('Escape')
    }
  }
  await discard.click()
  await clean()
  await overview()
  await page.setViewportSize({ width: 390, height: 844 })
  await capture('mobile-overview')
  await section('styles')
  await root.getByRole('button', { name: 'Karaoke fill', exact: true }).click()
  await capture('mobile-caption-styles')
  for (const [name, filename] of [['typography', 'typography'], ['colors', 'colors-effects'], ['layout', 'layout-preview'], ['logo', 'logo-watermark']]) {
    await section(name)
    await capture(`mobile-${filename}`)
    if (name === 'colors') {
      await root.locator('[data-brand-color-field="caption-text"]').getByRole('button', { name: 'Text color Choose color', exact: true }).click()
      await page.getByRole('dialog', { name: 'Text color', exact: true }).waitFor()
      await capture('mobile-color-picker')
      await page.keyboard.press('Escape')
    }
  }
  await section('styles')
  await preview.locator('[data-brand-preview-expand]').click()
  await preview.locator('[data-brand-preview-mode="social"]').click()
  for (const platform of ['instagram', 'tiktok', 'youtube', 'facebook']) {
    await preview.locator(`[data-brand-social-platform="${platform}"]`).click()
    await capture(`mobile-${platform}`)
  }
  await overview()
  await discard.click()
  await clean()
  await page.setViewportSize({ width: 900, height: 1000 })
  await capture('tablet-overview')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForFunction(() => document.documentElement.classList.contains('light'))
  await page.setViewportSize({ width: 390, height: 844 })
  await capture('mobile-light-overview')
  await page.setViewportSize({ width: 1488, height: 1058 })
  await capture('desktop-light-overview')
  await page.emulateMedia({ colorScheme: 'dark' })
}

try {
  await page.goto(`${origin}/dashboard/brand`, { waitUntil: 'networkidle', timeout: 180000 })
  await root.waitFor()
  await caption.waitFor()
  await page.waitForFunction(() => document.querySelector('[data-brand-preview-video]')?.readyState >= 2)
  await clean()
  assert.ok(fontLoads.length <= 3, 'Initial preview does not eagerly fetch the entire font catalog')
  await rememberShell()
  await noOverflow('Desktop overview')
  await capture('desktop-overview')

  // Canvas/social presentation is local view state, never a brand mutation.
  for (const ratio of ['1:1', '16:9', '9:16']) {
    await preview.locator(`[data-brand-ratio="${ratio}"]`).click()
    await clean()
  }
  const guides = preview.locator('[data-brand-safe-guides]')
  const previousGuides = await guides.getAttribute('aria-checked')
  await guides.click()
  assert.notEqual(await guides.getAttribute('aria-checked'), previousGuides)
  await clean()
  await preview.locator('[data-brand-preview-mode="social"]').click()
  for (const platform of ['instagram', 'tiktok', 'youtube', 'facebook']) {
    await preview.locator(`[data-brand-social-platform="${platform}"]`).click()
    await clean()
    await capture(`desktop-${platform}`)
  }
  assert.equal(saveAttempts.length, 0)
  await preview.locator('[data-brand-preview-mode="canvas"]').click()
  await preview.locator('[data-brand-preview-play]').click()
  await page.waitForFunction(() => document.querySelector('[data-brand-preview-video]')?.currentTime > 0)
  await preview.locator('[data-brand-preview-play]').click()
  assert.equal(await video.evaluate(element => element.paused), true, 'Preview pauses through its visible control')
  const muted = await video.evaluate(element => element.muted)
  await preview.locator('[data-brand-preview-mute]').click()
  assert.notEqual(await video.evaluate(element => element.muted), muted)
  const seekBox = await preview.locator('[data-brand-preview-seek]').boundingBox()
  await page.mouse.click(seekBox.x + seekBox.width * 0.7, seekBox.y + seekBox.height / 2)
  await page.waitForFunction(() => document.querySelector('[data-brand-preview-video]')?.currentTime > 1)
  await video.evaluate(element => { element.muted = true; element.load() })
  await page.waitForFunction(() => document.querySelector('[data-brand-preview-video]')?.readyState >= 2)
  await clean()
  await assertShell()
  console.log('Native preview playback, ratios, safe guides and four social platforms preserve the saved kit')

  await section('styles')
  for (const name of presetNames) {
    const button = root.getByRole('button', { name, exact: true })
    await button.click()
    assert.equal(await button.getAttribute('aria-pressed'), 'true')
  }
  await root.getByRole('button', { name: 'Karaoke fill', exact: true }).click()
  await clean(false)
  await capture('desktop-caption-styles')
  await section('typography')
  await chooseFont('Inter')
  await root.getByRole('combobox', { name: 'Weight', exact: true }).selectOption('900')
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-brand-caption]')
    return node && getComputedStyle(node).fontWeight === '900'
  })
  const letterSpacing = await slider('Letter spacing', 'ArrowRight')
  const wordSpacing = await slider('Word spacing', 'ArrowRight')
  const lineSpacing = await slider('Line spacing', 'ArrowRight')
  await chooseFont('Open Sans')
  const fontFile = root.locator('input[type="file"][accept=".ttf,.otf"]')
  await fontFile.setInputFiles({ name: 'synthetic-display.ttf', mimeType: 'font/ttf', buffer: await readFile(new URL('open-sans-700.ttf', assets)) })
  await root.locator('[data-brand-font-pending]').waitFor()
  assert.equal(fontUploads.length, 0, 'Choosing a font file stages it until explicit upload')
  assert.equal(await root.locator('[data-brand-font-upload]').isDisabled(), true)
  await verifyFastRefresh()
  await root.getByLabel('I have permission to use this font.', { exact: true }).click()
  const fontRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/user/brand/fonts')
  await root.locator('[data-brand-font-upload]').click()
  await fontRequest
  assert.equal(await saveButton.isDisabled(), true, 'Pending font uploads disable brand save')
  releaseFontUpload()
  await root.getByText('This font lacks some Romanian characters. Choose another font for Romanian captions.', { exact: true }).waitFor()
  await capture('desktop-typography')

  await section('colors')
  const textColor = root.getByRole('textbox', { name: 'Text color HEX', exact: true })
  await textColor.fill('invalid')
  await textColor.blur()
  assert.equal(await saveButton.isDisabled(), true, 'Invalid HEX disables save')
  await root.getByText('Enter a valid hex color, e.g. #6366F1', { exact: true }).waitFor()
  await textColor.fill('#2cda8f')
  await textColor.blur()
  assert.equal(await textColor.inputValue(), '#2CDA8F')
  const colorField = root.locator('[data-brand-color-field="caption-text"]')
  await colorField.getByRole('button', { name: 'Copy hex code', exact: true }).click()
  assert.equal(await page.evaluate(() => window.brandFixtureClipboard), '#2CDA8F')
  await colorField.getByRole('button', { name: 'Text color Choose color', exact: true }).click()
  const colorDialog = page.getByRole('dialog', { name: 'Text color', exact: true })
  await colorDialog.waitFor()
  await colorDialog.getByRole('slider', { name: 'Hue', exact: true }).press('ArrowRight')
  await colorDialog.getByRole('slider', { name: 'Saturation and brightness', exact: true }).press('ArrowLeft')
  assert.notEqual(await textColor.inputValue(), '#2CDA8F', 'HSV controls update the same caption color')
  await capture('desktop-color-picker')
  await page.keyboard.press('Escape')
  await colorDialog.waitFor({ state: 'hidden' })
  await setSwitch('Outline', true)
  await setSwitch('Background', true)
  await setSwitch('Active word', true)
  await root.getByRole('combobox', { name: 'Word entrance animation', exact: true }).selectOption('word-pop')
  const savedColor = await textColor.inputValue()
  await capture('desktop-colors-effects')

  await section('layout')
  await fillRatio(/Text size/, 0.16)
  await caption.press('+')
  assert.equal(await root.getByLabel('Text size (%)', { exact: true }).inputValue(), '16', 'Keyboard enlargement respects the same 16% limit as the size field')
  await fillRatio(/Text size/, 0.02)
  await caption.press('-')
  assert.equal(await root.getByLabel('Text size (%)', { exact: true }).inputValue(), '2', 'Keyboard shrinking respects the same 2% limit as the size field')
  await fillRatio(/Text size/, 0.065)
  await fillRatio(/Maximum width/, 0.8)
  await root.getByLabel('Maximum lines', { exact: true }).fill('2')
  await root.getByLabel('Shadow', { exact: true }).fill('3')
  await root.getByLabel('Horizontal (%)', { exact: true }).fill('45')
  await root.getByLabel('Vertical (%)', { exact: true }).fill('73')
  await caption.press('ArrowLeft')
  await caption.press('ArrowUp')
  assert.equal(await root.getByLabel('Horizontal (%)', { exact: true }).inputValue(), '44')
  assert.equal(await root.getByLabel('Vertical (%)', { exact: true }).inputValue(), '72')
  const captionBox = await caption.boundingBox()
  await page.mouse.move(captionBox.x + captionBox.width / 2, captionBox.y + captionBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(captionBox.x + captionBox.width / 2 + 15, captionBox.y + captionBox.height / 2 - 35, { steps: 6 })
  await page.mouse.up()
  const captionY = Number(await root.getByLabel('Vertical (%)', { exact: true }).inputValue())
  assert.ok(captionY < 72, 'Pointer drag updates the normalized caption position')
  await capture('desktop-layout-preview')
  failNextSave = true
  await save(503)
  await page.getByText('Synthetic temporary save failure', { exact: true }).waitFor()
  await clean(false)
  const captionSaved = await save()
  assert.equal(captionSaved.captionStyle.font_id, customFontId)
  assert.equal(captionSaved.captionStyle.preset, 'karaoke')
  assert.equal(captionSaved.captionStyle.letter_spacing, letterSpacing)
  assert.equal(captionSaved.captionStyle.word_spacing, wordSpacing)
  assert.equal(captionSaved.captionStyle.line_spacing, lineSpacing)
  assert.equal(captionSaved.captionStyle.text_color, savedColor)
  assert.equal(captionSaved.captionStyle.animation, 'word-pop')
  assert.equal(Math.round(captionSaved.captionStyle.position.y * 100), captionY)
  console.log('All presets, typography, licensed staged upload, HEX/HSV/copy, effects, layout and gesture changes survive save failure/retry')

  await section('logo')
  const logoFile = root.locator('[data-brand-logo-file]')
  const badge = root.getByRole('switch', { name: 'sneepcut badge', exact: true })
  assert.equal(await badge.isDisabled(), true)
  assert.equal(await badge.getAttribute('aria-checked'), 'true')
  assert.equal(await root.getByRole('link', { name: 'Upgrade to Agency', exact: true }).getAttribute('href'), '/dashboard/billing')
  await root.getByLabel('Logo size (%)', { exact: true }).fill('25')
  await root.getByLabel('Edge margin (%)', { exact: true }).fill('2.5')
  const opacity = await slider('Opacity', 'ArrowLeft', 7)
  await root.getByRole('button', { name: 'Top left', exact: true }).click()
  await logo.press('ArrowRight')
  await logo.press('ArrowDown')
  await logo.press('+')
  await setSwitch('Show logo on videos', false)
  assert.equal(await logo.count(), 0)
  await setSwitch('Show logo on videos', true)
  await logo.waitFor()
  await capture('desktop-logo-watermark')
  await logoFile.setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('synthetic invalid logo') })
  assert.equal(logoChanges.length, 0)
  const logoRequest = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/user/brand/logo')
  await logoFile.setInputFiles({ name: 'synthetic-logo.png', mimeType: 'image/png', buffer: syntheticPng })
  await logoRequest
  assert.equal(await saveButton.isDisabled(), true, 'Logo upload disables save until the API finishes')
  releaseLogoUpload()
  await root.getByText('synthetic-logo.png', { exact: true }).waitFor()
  const watermarkSaved = await save()
  assert.equal(watermarkSaved.watermarkSize, 0.26)
  assert.equal(watermarkSaved.watermarkMargin, 0.025)
  assert.equal(watermarkSaved.watermarkOpacity, opacity / 100)
  assert.ok(Number.isFinite(watermarkSaved.watermarkX) && Number.isFinite(watermarkSaved.watermarkY))
  assert.equal(kit.logoUrl, uploadedLogoUrl)
  await root.getByLabel('Logo size (%)', { exact: true }).fill('30')
  const removed = page.waitForResponse(response => response.request().method() === 'DELETE' && new URL(response.url()).pathname === '/api/user/brand/logo')
  await root.getByRole('button', { name: 'Remove', exact: true }).click()
  assert.equal((await removed).status(), 200)
  await discard.click()
  assert.equal(kit.logoUrl, null, 'Discard does not undo the immediately persisted logo removal')
  assert.equal(await root.getByLabel('Logo size (%)', { exact: true }).inputValue(), '26')
  const reuploaded = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/user/brand/logo')
  await logoFile.setInputFiles({ name: 'synthetic-logo.png', mimeType: 'image/png', buffer: syntheticPng })
  assert.equal((await reuploaded).status(), 200)
  await clean()
  await savebar.getByRole('button', { name: 'Reset', exact: true }).click()
  await clean(false)
  assert.equal(await root.getByLabel('Logo size (%)', { exact: true }).inputValue(), '18')
  assert.equal(kit.logoUrl, uploadedLogoUrl, 'Reset preserves the uploaded logo and waits for explicit save')
  await discard.click()
  await clean()
  await dismissToasts()
  console.log('Logo upload/removal persistence, busy states, watermark controls/gestures, permissions, Reset and Discard pass')

  await page.reload({ waitUntil: 'networkidle' })
  await root.waitFor()
  await section('typography')
  assert.equal(await root.getByRole('slider', { name: 'Letter spacing', exact: true }).getAttribute('aria-valuenow'), String(letterSpacing))
  await overview()
  await page.setViewportSize({ width: 390, height: 844 })
  await rememberShell()
  await noOverflow('Mobile overview')
  await capture('mobile-overview')
  await section('styles')
  await capture('mobile-caption-styles')
  await root.getByRole('button', { name: 'Minimal clean', exact: true }).click()
  await preview.locator('[data-brand-preview-expand]').click()
  await page.waitForFunction(() => document.querySelector('[data-brand-workspace][data-preview-expanded], [data-brand-workspace] [data-preview-expanded]')?.getAttribute('data-preview-expanded') === 'true')
  await preview.locator('[data-brand-preview-mode="canvas"]').click()
  const beforePinch = await caption.evaluate(element => parseFloat(getComputedStyle(element).fontSize))
  await pinch(caption, 1.25)
  const afterPinch = await caption.evaluate(element => parseFloat(getComputedStyle(element).fontSize))
  assert.ok(afterPinch > beforePinch * 1.1, 'Two-finger touch gesture increases caption size')
  const savesBeforeSocial = saveAttempts.length
  await preview.locator('[data-brand-preview-mode="social"]').click()
  for (const platform of ['instagram', 'tiktok', 'youtube', 'facebook']) {
    await preview.locator(`[data-brand-social-platform="${platform}"]`).click()
    await noOverflow(`Mobile ${platform} preview`)
    await capture(`mobile-${platform}`)
  }
  assert.equal(saveAttempts.length, savesBeforeSocial, 'Mobile social selection does not save the draft')
  await root.locator('[data-brand-back]').click()
  await page.waitForFunction(() => document.querySelector('[data-brand-workspace][data-preview-expanded], [data-brand-workspace] [data-preview-expanded]')?.getAttribute('data-preview-expanded') === 'false')
  assert.equal(await root.getAttribute('data-section'), 'styles')
  assert.equal(await root.getByRole('button', { name: 'Minimal clean', exact: true }).getAttribute('aria-pressed'), 'true')
  await section('layout')
  await noOverflow('Mobile layout controls')
  await capture('mobile-layout-preview')
  const mobileSaved = await save()
  assert.equal(mobileSaved.captionStyle.preset, 'minimal')
  assert.ok(mobileSaved.captionStyle.size > captionSaved.captionStyle.size * 1.1)
  await section('typography')
  await capture('mobile-typography')
  await section('colors')
  await capture('mobile-colors-effects')
  await root.locator('[data-brand-color-field="caption-text"]').getByRole('button', { name: 'Text color Choose color', exact: true }).click()
  await colorDialog.waitFor()
  const pickerBounds = await colorDialog.boundingBox()
  assert.ok(pickerBounds && pickerBounds.width >= 388, 'Color editing uses a full-width mobile sheet')
  await noOverflow('Mobile color sheet')
  await capture('mobile-color-picker')
  await page.keyboard.press('Escape')
  await colorDialog.waitFor({ state: 'hidden' })
  await section('logo')
  await capture('mobile-logo-watermark')
  await assertShell()

  await overview()
  await page.setViewportSize({ width: 900, height: 1000 })
  await rememberShell()
  await noOverflow('Tablet overview')
  await capture('tablet-overview')
  await section('typography')
  await noOverflow('Tablet typography')
  await page.setViewportSize({ width: 320, height: 780 })
  await rememberShell()
  await noOverflow('320px typography')
  await section('colors')
  await noOverflow('320px colors')
  await section('logo')
  await noOverflow('320px logo controls')
  await assertShell()
  await overview()
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForFunction(() => document.documentElement.classList.contains('light'))
  await page.setViewportSize({ width: 390, height: 844 })
  await noOverflow('Mobile light overview')
  await capture('mobile-light-overview')
  await page.setViewportSize({ width: 1488, height: 1058 })
  await noOverflow('Desktop light overview')
  await capture('desktop-light-overview')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
  await page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click()
  await rememberShell()
  await page.locator('[data-slot="sidebar"] a[href="/dashboard/publish"]').filter({ visible: true }).first().click()
  await page.locator('[data-publishing-workspace]').waitFor()
  await assertShell()
  await page.locator('[data-slot="sidebar"] a[href="/dashboard/brand"]').filter({ visible: true }).first().click()
  await root.waitFor()
  await assertShell()
  canWhiteLabel = true
  await page.reload({ waitUntil: 'networkidle' })
  await root.waitFor()
  await section('logo')
  assert.equal(await badge.isDisabled(), false, 'Explicit white-label permission enables badge control')
  await badge.click()
  await clean(false)
  await discard.click()
  await clean()
  assert.deepEqual(blockedMutations, [], 'All writes remain inside explicit synthetic handlers')
  assert.equal(fontUploads.length, 1)
  assert.deepEqual(logoChanges, ['upload', 'remove', 'upload'])
  assert.equal(successfulSaves.length, 3)
  assert.equal(saveAttempts.length, 4)
  await captureReferenceStates()
  assert.equal(saveAttempts.length, 4, 'Reference capture pass does not persist presentation changes')
  assert.deepEqual(errors, [], 'No unexpected browser runtime or console errors')
  await writeFile(new URL('summary.json', output), JSON.stringify({ passed: true, fastRefreshVerified, fontUploads: fontUploads.length, logoChanges, saves: successfulSaves.length, fontLoads: fontLoads.length, errors }, null, 2))
  console.log('Brand Kit mobile focused previews, touch gestures, responsive dark/light layouts and mounted-shell navigation pass')
  console.log('Brand Kit layout browser checks passed (mocked APIs only)')
} catch (error) {
  if (await video.count()) console.log('Preview diagnostic:', await video.evaluate(element => ({
    time: element.currentTime, duration: element.duration, readyState: element.readyState,
    seeking: element.seeking, seekable: Array.from({ length: element.seekable.length }, (_, index) => [element.seekable.start(index), element.seekable.end(index)])
  })).catch(() => null))
  await capture('failure').catch(() => {})
  throw error
} finally {
  releaseFontUpload()
  releaseLogoUpload()
  await browser.close()
}
