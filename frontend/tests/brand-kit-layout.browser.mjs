import assert from 'node:assert/strict'
import { mkdir, readFile, stat, utimes, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { syntheticMp4Response, syntheticPng } from './fixtures/synthetic-media.mjs'

// Brand kit editor (canvas Br-*): every control, desktop + phone, light + dark, with mocked APIs.
// Start Vite separately. Accounts, kits, fonts, logos and clips are synthetic; unexpected writes are blocked.
if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
const output = new URL('../test-results/brand-kit-layout/', import.meta.url)
const assets = new URL('../../backend/internal/captions/assets/', import.meta.url)
const catalog = JSON.parse(await readFile(new URL('catalog.json', assets), 'utf8'))
const user = {
  id: '00000000-0000-4000-8000-000000000811', email: 'brand-kit-layout@example.invalid',
  name: 'Design Workspace', plan: 'pro', credits: 100, access_role: 'member'
}
const customFontId = '00000000-0000-4000-8000-000000000812'
const initialStyle = {
  version: 1, preset: 'classic', font_id: 'builtin:inter', weight: 700, size: 0.05, text_color: '#FFFFFF',
  outline_color: '#000000', outline: 2, shadow: 0, background_color: '#000000', background_opacity: 0,
  highlight_color: '#FFE066', align: 'center', max_width: 0.88, max_lines: 2, line_spacing: 1.15,
  letter_spacing: 0, word_spacing: 0, position: { x: 0.5, y: 0.6, anchor: 'center' }
}
const logoSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="90"><path d="M16 8h62L30 45h48L16 82h62" fill="#7847ff"/><text x="92" y="60" font-family="sans-serif" font-size="34" font-weight="700" fill="#fff">studio</text></svg>'
const poster = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960"><rect width="540" height="960" fill="#3b4a5e"/><circle cx="270" cy="380" r="160" fill="#c99a6b"/><rect y="640" width="540" height="320" fill="#25303f"/></svg>').toString('base64')}`
const presetNames = [
  'Active word color', 'Classic subtitles', 'Minimal clean', 'Bold outlined', 'High-contrast box', 'Large headline',
  'Word by word', 'Karaoke fill', 'Active word background', 'Phrase pop-in', 'Subtle fade', 'Stacked two lines'
]
const errors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })

function freshKit(overrides = {}) {
  return {
    logoUrl: `${origin}/__brand-fixture__/logo.svg`, primaryColor: '#000000', secondaryColor: '#FFFFFF', fontFamily: 'Inter',
    applyBrandColors: false, applyBrandFont: false, subtitleFont: 'Inter Bold', subtitleColor: '#FFFFFF',
    subtitleBgColor: '#000000', subtitleBgOpacity: 0, subtitlePosition: 'bottom', watermarkEnabled: true,
    watermarkSize: 0.18, watermarkMargin: 0.025, watermarkX: null, watermarkY: null, watermarkPosition: 'bottom-right',
    watermarkOpacity: 0.8, hidePlatformBadge: false, captionStyle: structuredClone(initialStyle), ...overrides
  }
}

/** One browser context with the editor's API mocked; `state` drives loading/error/empty variants. */
async function fixture(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 900 }, colorScheme: options.dark ? 'dark' : 'light',
    hasTouch: Boolean(options.touch), reducedMotion: 'reduce', timezoneId: 'Europe/Bucharest'
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  page.setDefaultNavigationTimeout(120000)
  const f = {
    context, page, kit: freshKit(options.kit), saves: [], blocked: [], fontUploads: 0, fontRemovals: [], logoChanges: [], fontLoads: [],
    canWhiteLabel: false, failNextSave: false, failKit: Boolean(options.failKit), holdKit: Boolean(options.holdKit),
    clips: options.noClips ? [] : [{ id: '00000000-0000-4000-8000-000000000813', title: 'Synthetic clip', thumbnailUrl: poster, previewUrl: `${origin}/__brand-fixture__/clip.mp4`, fileUrl: `${origin}/__brand-fixture__/clip.mp4`, duration: 2 }],
    fonts: catalog.map((font) => ({ id: font.id, family: font.family, category: font.category, weights: font.weights, romanian: true }))
  }
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/^Failed to load resource:.*(503|405)/.test(message.text())) errors.push(message.text())
  })
  const held = []
  f.releaseKit = () => held.splice(0).forEach((resolve) => resolve())
  await context.route('**/v1/**', (route) => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
  await context.route('**/__brand-fixture__/clip.mp4', (route) => route.fulfill(syntheticMp4Response(route.request().headers().range)))
  await context.route('**/__brand-fixture__/*logo.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: logoSvg }))
  await context.route('**/api/**', async (route) => {
    const request = route.request(), method = request.method(), url = new URL(request.url()), path = url.pathname
    if (path === '/api/user/brand') {
      if (f.holdKit) await new Promise((resolve) => held.push(resolve))
      if (f.failKit) return route.fulfill({ status: 503, json: { error: 'Synthetic outage' } })
      if (method === 'PUT') {
        const payload = request.postDataJSON()
        assert.equal(payload.logoUrl, undefined, 'The logo is changed only through its own endpoint')
        if (f.failNextSave) {
          f.failNextSave = false
          return route.fulfill({ status: 503, json: { error: 'Synthetic temporary save failure' } })
        }
        f.kit = { ...f.kit, ...payload }
        f.saves.push(structuredClone(payload))
      }
      if (['GET', 'PUT'].includes(method)) return route.fulfill({ json: { brandKit: f.kit, plan: 'pro', canWhiteLabel: f.canWhiteLabel } })
    }
    if (path === '/api/user/brand/fonts') {
      if (method === 'GET') return route.fulfill({ json: { fonts: f.fonts } })
      if (method === 'POST') {
        assert.equal(url.searchParams.get('license_confirmed'), 'true', 'Custom fonts need the licence confirmation')
        f.fontUploads++
        const font = { id: customFontId, family: 'Synthetic Display', category: 'custom', weights: [700], romanian: false }
        f.fonts.push(font)
        return route.fulfill({ status: 201, json: { font } })
      }
      if (method === 'DELETE') {
        f.fontRemovals.push(url.searchParams.get('id'))
        return route.fulfill({ status: 204, body: '' })
      }
    }
    if (path === '/api/user/brand/font-file') {
      f.fontLoads.push(`${url.searchParams.get('id')}:${url.searchParams.get('weight')}`)
      const font = catalog.find((item) => item.id === url.searchParams.get('id')) ?? catalog.find((item) => item.id === 'builtin:open-sans')
      const file = font.files[url.searchParams.get('weight')] ?? Object.values(font.files)[0]
      return route.fulfill({ contentType: 'font/ttf', body: await readFile(new URL(file, assets)) })
    }
    if (path === '/api/user/brand/logo') {
      if (method === 'POST') {
        f.logoChanges.push('upload')
        f.kit = { ...f.kit, logoUrl: `${origin}/__brand-fixture__/uploaded-logo.svg` }
        return route.fulfill({ json: { brandKit: f.kit } })
      }
      if (method === 'DELETE') {
        f.logoChanges.push('remove')
        f.kit = { ...f.kit, logoUrl: null }
        return route.fulfill({ json: { brandKit: f.kit } })
      }
    }
    if (method !== 'GET') {
      f.blocked.push(`${method} ${path}`)
      return route.fulfill({ status: 405, json: { error: 'Unexpected mutation blocked by the synthetic fixture' } })
    }
    if (path === '/api/clips/library') return route.fulfill({ json: { clips: f.clips, total: f.clips.length, hasMore: false } })
    if (path === '/api/brand-kits') return route.fulfill({ json: { kits: [], plan: 'pro', canWhiteLabel: f.canWhiteLabel } })
    return route.fulfill({ json: {} })
  })
  f.editor = page.locator('[data-brand-workspace]')
  f.preview = page.locator('[data-brand-preview]')
  f.saveCard = page.locator('[data-brand-save-bar]')
  f.caption = f.preview.locator('[data-brand-caption]')
  f.logo = f.preview.locator('[data-brand-logo-preview]')
  f.open = async (path = '/dashboard/brand/default') => {
    await page.goto(`${origin}${path}`, { waitUntil: 'load' })
  }
  f.ready = async () => {
    await f.editor.waitFor()
    await f.caption.waitFor()
  }
  f.close = () => context.close()
  return f
}

/** `dragging` keeps the pointer where it is so a held drag is captured as is. */
async function capture(f, name, { dragging = false } = {}) {
  await mkdir(output, { recursive: true })
  if (!dragging) {
    await f.page.mouse.move(0, 0)
    await f.page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  }
  await f.page.locator('img').evaluateAll((images) => Promise.all(images.filter((image) => image.getBoundingClientRect().width > 0).map((image) => image.decode().catch(() => {}))))
  await f.page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: true })
}

async function noOverflow(f, name) {
  assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow`)
  const fits = await f.page.evaluate(() => {
    const stage = document.querySelector('[data-brand-preview-stage]')?.getBoundingClientRect()
    const caption = document.querySelector('[data-brand-caption]')?.getBoundingClientRect()
    return !stage || !caption || (caption.left >= stage.left - 1 && caption.right <= stage.right + 1 && caption.top >= stage.top - 1 && caption.bottom <= stage.bottom + 1)
  })
  assert.equal(fits, true, `${name}: caption stays inside the clip`)
}

const saveState = (f) => f.saveCard.getAttribute('data-brand-save-state')

async function save(f) {
  const response = f.page.waitForResponse((item) => item.request().method() === 'PUT' && new URL(item.url()).pathname === '/api/user/brand')
  await f.saveCard.getByRole('button', { name: 'Save', exact: true }).click()
  assert.equal((await response).status(), 200)
  await f.page.waitForFunction(() => document.querySelector('[data-brand-save-bar]')?.getAttribute('data-brand-save-state') === 'saved')
  return f.saves.at(-1)
}

async function drag(f, locator, dx, dy) {
  const box = await locator.boundingBox()
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await f.page.mouse.move(x, y)
  await f.page.mouse.down()
  await f.page.mouse.move(x + dx / 2, y + dy / 2, { steps: 3 })
  await f.page.mouse.move(x + dx, y + dy, { steps: 3 })
}

async function pinch(f, locator, factor) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  const radius = Math.min(18, box.width / 4)
  const client = await f.context.newCDPSession(f.page)
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: x - radius, y }, { id: 2, x: x + radius, y }] })
    for (let step = 1; step <= 6; step++) {
      const spread = radius * (1 + ((factor - 1) * step) / 6)
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x - spread, y }, { id: 2, x: x + spread, y }] })
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await client.detach()
  }
}

/** Presses an arrow key on a slider until it reads `text` (each press is one step). */
async function slideTo(slider, key, text) {
  await slider.focus()
  for (let step = 0; step < 12 && (await slider.getAttribute('aria-valuetext')) !== text; step++) {
    const before = await slider.getAttribute('aria-valuetext')
    await slider.press(key)
    await slider.page().waitForFunction(([node, value]) => node.getAttribute('aria-valuetext') !== value, [await slider.elementHandle(), before])
  }
  assert.equal(await slider.getAttribute('aria-valuetext'), text)
}

const radio = (scope, group, name) => scope.getByRole('radiogroup', { name: group, exact: true }).getByRole('radio', { name, exact: true })

async function chooseSelect(f, label, option) {
  await f.editor.getByRole('combobox', { name: label, exact: true }).click()
  await f.page.getByRole('option', { name: option, exact: true }).click()
  assert.match(await f.editor.getByRole('combobox', { name: label, exact: true }).innerText(), new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}

// ---------------------------------------------------------------- captions card
async function captions() {
  const f = await fixture()
  try {
    await f.open()
    await f.ready()
    assert.ok(f.fontLoads.length <= 3, `The first paint loads only the selected font (${f.fontLoads.length})`)
    const card = f.page.locator('[data-brand-captions]')
    assert.match(await card.innerText(), /Captions\s+12 styles/)
    assert.equal(await saveState(f), 'saved')
    assert.match(await f.saveCard.innerText(), /Everything is saved/)

    // Twelve styles in the canvas order; each selects and the save card turns unsaved.
    const presets = card.getByRole('group', { name: 'Caption style' }).getByRole('button')
    assert.deepEqual(await presets.evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))), presetNames)
    for (const [index, name] of presetNames.entries()) {
      await presets.nth(index).click()
      assert.equal(await presets.nth(index).getAttribute('aria-pressed'), 'true', `${name} is selected`)
    }
    assert.equal(await saveState(f), 'unsaved')
    assert.match(await f.saveCard.innerText(), /Unsaved changes/)
    await f.saveCard.getByRole('button', { name: 'Discard', exact: true }).click()
    assert.equal(await saveState(f), 'saved')
    assert.equal(await presets.nth(1).getAttribute('aria-pressed'), 'true', 'Discard restores the saved style')

    // Font picker: search, choose, and the upload entry (Br-Fonts).
    const fontButton = card.getByRole('button', { name: /^Font\s/ })
    await fontButton.click()
    const picker = f.page.getByRole('dialog', { name: 'Fonts' })
    await picker.getByRole('searchbox', { name: 'Search fonts' }).fill('Open Sans')
    assert.deepEqual(await picker.getByRole('option').allInnerTexts(), ['Open Sans'])
    await picker.getByRole('option', { name: 'Open Sans', exact: true }).click()
    assert.match(await fontButton.innerText(), /Open Sans/)
    await chooseSelect(f, 'Weight', 'Regular · 400')

    // Colours: swatch picker, hex typing, validation blocks saving.
    const textHex = card.getByRole('textbox', { name: 'Text color hex code' })
    await textHex.fill('ff0000')
    assert.equal(await textHex.inputValue(), 'ff0000')
    await card.getByRole('textbox', { name: 'Active word hex code' }).fill('12')
    await card.getByRole('textbox', { name: 'Active word hex code' }).blur()
    await card.getByRole('alert').filter({ hasText: 'Enter a valid hex color' }).waitFor()
    assert.equal(await f.saveCard.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true, 'Invalid colours block saving')
    await card.getByRole('textbox', { name: 'Active word hex code' }).fill('FACC15')
    await card.getByRole('button', { name: 'Choose text color' }).click()
    await f.page.keyboard.press('Escape')

    // Size slider, lines, alignment, animation and effects.
    const size = card.getByRole('slider', { name: 'Text size', exact: true })
    await slideTo(size, 'ArrowRight', '6%')
    await radio(card, 'Lines', '3').click()
    await radio(card, 'Lines', '3').press('ArrowLeft')
    assert.equal(await radio(card, 'Lines', '2').getAttribute('aria-checked'), 'true', 'Arrow keys move through Lines')
    await radio(card, 'Lines', '1').click()
    await radio(card, 'Alignment', 'Left').click()
    await chooseSelect(f, 'Animation', 'Phrase pop')
    await card.getByRole('switch', { name: 'Outline', exact: true }).click()
    await card.getByRole('switch', { name: 'Background', exact: true }).click()
    await capture(f, 'desktop-light-unsaved')
    let payload = await save(f)
    assert.equal(payload.captionStyle.font_id, 'builtin:open-sans')
    assert.equal(payload.captionStyle.weight, 400)
    assert.equal(payload.captionStyle.text_color, '#FF0000')
    assert.equal(payload.captionStyle.highlight_color, '#FACC15')
    assert.equal(payload.captionStyle.size, 0.06)
    assert.equal(payload.captionStyle.max_lines, 1)
    assert.equal(payload.captionStyle.align, 'left')
    assert.equal(payload.captionStyle.animation, 'phrase-pop')
    assert.equal(payload.captionStyle.outline_enabled, false)
    assert.equal(payload.captionStyle.background_enabled, true)
    const notice = f.page.locator('[data-toast-illustrated]').filter({ hasText: 'Brand kit saved' })
    await notice.waitFor()
    assert.equal((await notice.innerText()).trim(), 'Brand kit saved', 'The saved toast carries only its title')
    await capture(f, 'desktop-light-saved')

    // Drag the caption: guides appear, it snaps to the centre line and the upper third; reset puts it back.
    await radio(card, 'Lines', '2').click()
    const stage = await f.page.locator('[data-brand-preview-stage]').boundingBox()
    const box = await f.caption.boundingBox()
    const third = stage.y + stage.height / 3
    await drag(f, f.caption, 2, third - (box.y + box.height / 2) + 2)
    await f.page.locator('[data-drag="caption"] [data-brand-preview-guides]').waitFor()
    assert.equal(await f.page.locator('[data-brand-preview-guides] [data-active]').count(), 2, 'Centre line and third light up')
    await capture(f, 'desktop-light-drag-caption', { dragging: true })
    await f.page.mouse.up()
    assert.equal(await f.page.locator('[data-brand-preview-guides]').count(), 0, 'Guides leave with the drag')
    await f.caption.press('ArrowDown')
    payload = await save(f)
    assert.equal(payload.captionStyle.position.x, 0.5)
    assert.ok(Math.abs(payload.captionStyle.position.y - (1 / 3 + 0.01)) < 1e-6, `Snapped to the third, then nudged: ${payload.captionStyle.position.y}`)
    await card.getByRole('button', { name: 'Reset position', exact: true }).click()
    payload = await save(f)
    assert.deepEqual(payload.captionStyle.position, { x: 0.5, y: 0.84, anchor: 'center' })

    // Custom font upload (Br-FontUpload): needs a file and the licence; selects the font; warns about diacritics.
    await fontButton.click()
    await picker.getByRole('button', { name: /Upload your font/ }).click()
    const dialog = f.page.getByRole('dialog', { name: 'Upload your font' })
    const upload = dialog.getByRole('button', { name: 'Upload font', exact: true })
    assert.equal(await upload.isDisabled(), true)
    await capture(f, 'desktop-light-font-upload')
    await dialog.getByLabel('Choose font').setInputFiles({ name: 'Synthetic.ttf', mimeType: 'font/ttf', buffer: Buffer.from('synthetic-font') })
    assert.match(await dialog.innerText(), /Synthetic\.ttf/)
    assert.equal(await upload.isDisabled(), true, 'Licence confirmation is required')
    await dialog.getByRole('checkbox', { name: 'I have permission to use this font.' }).check()
    await upload.click()
    await dialog.waitFor({ state: 'detached' })
    assert.equal(f.fontUploads, 1)
    assert.match(await fontButton.innerText(), /Synthetic Display/)
    await card.getByRole('alert').filter({ hasText: 'Romanian characters' }).waitFor()
    await fontButton.click()
    await picker.getByRole('button', { name: 'Remove selected font' }).click()
    assert.deepEqual(f.fontRemovals, [customFontId])
    await f.page.waitForFunction(() => /Inter/.test(document.querySelector('[data-brand-captions]')?.innerText ?? ''))
    await f.saveCard.getByRole('button', { name: 'Discard', exact: true }).click()

    // Cancel closes the dialog without uploading.
    await fontButton.click()
    await picker.getByRole('button', { name: /Upload your font/ }).click()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })

    // Reset to defaults, then a failed save keeps the edits unsaved.
    await f.saveCard.getByRole('button', { name: 'Reset', exact: true }).click()
    assert.equal(await saveState(f), 'unsaved')
    f.failNextSave = true
    const failed = f.page.waitForResponse((item) => item.request().method() === 'PUT' && item.status() === 503)
    await f.saveCard.getByRole('button', { name: 'Save', exact: true }).click()
    await failed
    assert.equal(await saveState(f), 'unsaved', 'A failed save keeps the changes')
    payload = await save(f)
    assert.equal(payload.captionStyle, null, 'Reset restores the default caption style')
    assert.deepEqual(f.blocked, [])
  } finally {
    await f.close()
  }
  console.log('Captions card: 12 styles, font search + upload + removal, weight, colours + validation, size, lines, alignment, animation, effects, drag + snap + reset, save/discard/reset/failure passed')
}

// ---------------------------------------------------------------- logo screen
async function logo() {
  const f = await fixture()
  try {
    await f.open()
    await f.ready()
    const summary = f.editor.locator('[data-brand-logo-summary]')
    assert.match(await summary.innerText(), /Logo & watermark\s+Size 18% · Opacity 80%/)
    await f.page.evaluate(() => { window.brandShell = { main: document.querySelector('main'), sidebar: document.querySelector('[data-slot="sidebar"]') } })
    await summary.click()
    await f.editor.locator('[data-brand-logo]').waitFor()
    assert.equal(await f.editor.getAttribute('data-view'), 'logo')
    assert.equal(await f.page.locator('[data-brand-preview-guides]').count(), 1, 'The safe zone shows on the logo screen')
    const logoCard = f.editor.locator('[data-brand-logo]')
    await f.page.waitForFunction(() => /SVG · 240 × 90/.test(document.querySelector('[data-brand-logo]')?.innerText ?? ''))
    assert.match(await logoCard.innerText(), /logo\.svg/)
    const settings = f.editor.locator('[data-brand-watermark]')
    const outro = settings.getByRole('switch', { name: 'Sneep Cut ending' })
    assert.equal(await outro.isDisabled(), true, 'The ending is removable on Agency only')
    assert.equal(await settings.getByRole('link', { name: 'Remove with the Agency plan' }).getAttribute('href'), '/dashboard/billing')
    await capture(f, 'desktop-light-logo')

    // Sliders and the watermark switch.
    const sizeSlider = settings.getByRole('slider', { name: 'Size', exact: true })
    await slideTo(sizeSlider, 'ArrowLeft', '17%')
    const opacity = settings.getByRole('slider', { name: 'Opacity', exact: true })
    await slideTo(opacity, 'ArrowRight', '81%')
    await settings.getByRole('switch', { name: 'Show logo on videos' }).click()
    assert.equal(await f.logo.count(), 0, 'A hidden watermark leaves the preview')
    await settings.getByRole('switch', { name: 'Show logo on videos' }).click()
    let payload = await save(f)
    assert.equal(payload.watermarkSize, 0.17)
    assert.equal(payload.watermarkOpacity, 0.81)
    assert.equal(payload.watermarkEnabled, true)

    // Drag the logo onto the safe zone corner: it snaps and the zone's edges light up.
    const stage = await f.page.locator('[data-brand-preview-stage]').boundingBox()
    const mark = await f.logo.boundingBox()
    await drag(f, f.logo, stage.x + stage.width * 0.08 - mark.x + 2, stage.y + stage.height * 0.08 - mark.y + 2)
    await f.page.locator('[data-brand-preview-guides] [data-left][data-top]').waitFor()
    await capture(f, 'desktop-light-drag-logo', { dragging: true })
    await f.page.mouse.up()
    await f.logo.press('Equal')
    payload = await save(f)
    assert.ok(payload.watermarkSize > 0.17, 'The + key grows the logo')
    assert.ok(Number.isFinite(payload.watermarkX) && Number.isFinite(payload.watermarkY))

    // Replace, remove (empty upload card) and upload again.
    await logoCard.getByLabel('Upload logo').setInputFiles({ name: 'brand.png', mimeType: 'image/png', buffer: syntheticPng })
    await f.page.waitForFunction(() => document.querySelector('[data-brand-logo] img')?.getAttribute('src')?.startsWith('blob:'))
    await logoCard.getByRole('button', { name: 'Remove', exact: true }).click()
    const empty = f.editor.locator('[data-brand-logo-empty]')
    await empty.waitFor()
    await empty.getByLabel('Upload logo').setInputFiles({ name: 'brand.png', mimeType: 'image/png', buffer: syntheticPng })
    await logoCard.waitFor()
    assert.deepEqual(f.logoChanges, ['upload', 'remove', 'upload'])

    // Back keeps the dashboard shell mounted.
    await f.editor.getByRole('button', { name: 'Back', exact: true }).click()
    await f.page.locator('[data-brand-captions]').waitFor()
    assert.equal(await f.page.evaluate(() => window.brandShell.main === document.querySelector('main') && window.brandShell.sidebar === document.querySelector('[data-slot="sidebar"]')), true)

    // With white-label rights the ending can be switched off.
    f.canWhiteLabel = true
    await f.open()
    await f.ready()
    await f.editor.locator('[data-brand-logo-summary]').click()
    await outro.click()
    assert.equal(await settings.getByRole('link', { name: 'Remove with the Agency plan' }).count(), 0)
    payload = await save(f)
    assert.equal(payload.hidePlatformBadge, true)
    assert.deepEqual(f.blocked, [])
  } finally {
    await f.close()
  }
  console.log('Logo screen: summary, meta, size/opacity/visibility, drag + snap to the safe zone, +/- keys, replace/remove/upload, Agency ending, Back passed')
}

// ---------------------------------------------------------------- preview card
async function preview() {
  const f = await fixture()
  try {
    await f.open()
    await f.ready()
    const ratios = f.preview.getByRole('radiogroup', { name: 'Preview aspect ratio' })
    const stage = f.preview.locator('[data-ratio]')
    for (const ratio of ['1:1', '16:9', '9:16']) {
      await ratios.getByRole('radio', { name: ratio, exact: true }).click()
      assert.equal(await stage.getAttribute('data-ratio'), ratio)
    }
    const targets = f.preview.getByRole('radiogroup', { name: 'Show on' }).getByRole('radio')
    assert.deepEqual(await targets.evaluateAll((items) => items.map((item) => item.getAttribute('aria-label'))), ['Canvas', 'Instagram', 'Facebook', 'TikTok', 'YouTube'])
    await ratios.getByRole('radio', { name: '16:9', exact: true }).click()
    for (const [platform, placement] of [['Instagram', 'Instagram Reels'], ['Facebook', 'Facebook Reels'], ['TikTok', 'TikTok'], ['YouTube', 'YouTube Shorts']]) {
      await f.preview.getByRole('radio', { name: platform, exact: true }).click()
      assert.match(await f.preview.innerText(), new RegExp(`Simulated preview · Sample data[\\s\\S]*${placement}`))
      assert.equal(await stage.getAttribute('data-ratio'), '9:16', 'Platform players are vertical')
      await f.preview.locator(`[data-brand-social-overlay="${platform.toLowerCase()}"]`).waitFor()
      assert.equal(await f.preview.locator('[data-brand-playback]').count(), 0)
      if (platform === 'Instagram') await capture(f, 'desktop-light-social')
    }
    await f.preview.getByRole('radio', { name: 'Facebook', exact: true }).click()
    await f.preview.getByRole('radio', { name: 'Facebook', exact: true }).press('ArrowLeft')
    assert.equal(await f.preview.getByRole('radio', { name: 'Instagram', exact: true }).getAttribute('aria-checked'), 'true', 'Arrow keys move through the platforms')
    await f.preview.getByRole('radio', { name: 'Canvas', exact: true }).click()
    assert.equal(await stage.getAttribute('data-ratio'), '16:9', 'Canvas keeps the chosen ratio')
    await ratios.getByRole('radio', { name: '9:16', exact: true }).click()

    // Player bar: play/pause, sound, seek and full screen.
    const play = f.preview.locator('[data-brand-preview-play]')
    await f.page.waitForFunction(() => !document.querySelector('[data-brand-preview-play]')?.disabled)
    await play.click()
    await f.preview.getByRole('button', { name: 'Pause preview' }).waitFor()
    await f.preview.getByRole('button', { name: 'Pause preview' }).click()
    await f.preview.getByRole('button', { name: 'Play preview' }).waitFor()
    await f.preview.getByRole('button', { name: 'Unmute preview' }).click()
    await f.preview.getByRole('button', { name: 'Mute preview' }).waitFor()
    await f.preview.getByRole('slider', { name: 'Seek preview' }).evaluate((input) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await f.page.waitForFunction(() => Math.abs(document.querySelector('[data-brand-preview-video]').currentTime - 1) < 0.2)
    await f.preview.getByRole('button', { name: 'Expand preview' }).click()
    await f.page.waitForFunction(() => document.fullscreenElement?.hasAttribute('data-ratio'))
    await f.page.evaluate(() => document.exitFullscreen())
    assert.equal(await saveState(f), 'saved', 'Preview controls never change the kit')
    assert.deepEqual(f.saves, [])
  } finally {
    await f.close()
  }
  console.log('Preview: ratios, Instagram/Facebook/TikTok/YouTube simulations, play/pause/mute/seek/full screen passed')
}

// ---------------------------------------------------------------- loading, error, no clip, no logo
async function states() {
  const loading = await fixture({ holdKit: true, failKit: true })
  try {
    await loading.open()
    await loading.page.locator('[data-brand-loading]').waitFor()
    assert.equal(await loading.page.locator('[data-brand-loading]').getAttribute('aria-label'), 'Loading brand kit')
    await capture(loading, 'desktop-light-loading')
    loading.holdKit = false
    loading.releaseKit()
    const error = loading.page.locator('[data-brand-error]')
    await error.waitFor()
    assert.match(await error.innerText(), /Brand kit unavailable\s+We couldn't load the saved settings\.\s+Try again/)
    await capture(loading, 'desktop-light-error')
    loading.failKit = false
    await error.getByRole('button', { name: 'Try again' }).click()
    await loading.ready()
  } finally {
    await loading.close()
  }
  const bare = await fixture({ noClips: true, kit: { logoUrl: null } })
  try {
    await bare.open()
    await bare.editor.waitFor()
    const noClip = bare.preview.locator('[data-brand-no-clip]')
    await noClip.waitFor()
    assert.match(await noClip.innerText(), /Choose a video or photo\s+See the style on your own clip\.\s+Choose media/)
    const empty = bare.editor.locator('[data-brand-logo-empty]')
    assert.match(await empty.innerText(), /Logo & watermark\s+PNG, JPG or WEBP · up to 5MB/)
    await capture(bare, 'desktop-light-empty')
    await noClip.getByLabel('Choose media').setInputFiles({ name: 'frame.png', mimeType: 'image/png', buffer: syntheticPng })
    await bare.caption.waitFor()
    assert.equal(await noClip.count(), 0, 'A chosen file replaces the empty state')
    assert.equal(await bare.preview.locator('[data-brand-playback]').count(), 0, 'Photos have no player bar')
    await empty.getByLabel('Upload logo').setInputFiles({ name: 'brand.png', mimeType: 'image/png', buffer: syntheticPng })
    await bare.editor.locator('[data-brand-logo-summary]').waitFor()
    assert.deepEqual(bare.logoChanges, ['upload'])
  } finally {
    await bare.close()
  }
  console.log('States: loading skeleton, error + retry, no clip + local media, no logo + upload passed')
}

// ---------------------------------------------------------------- phone: order, sheets, touch gestures
async function phone() {
  const f = await fixture({ viewport: { width: 390, height: 844 }, touch: true })
  try {
    await f.open()
    await f.ready()
    const top = async (selector) => (await f.page.locator(selector).first().boundingBox()).y
    const order = [await top('[data-kit-header]'), await top('[data-brand-preview]'), await top('[data-brand-captions]'), await top('[data-brand-logo-summary]'), await top('[data-brand-save-bar]')]
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'Phone order: kit, preview, captions, logo, save')
    await noOverflow(f, 'Phone editor')
    await capture(f, 'mobile-light-main')

    // Pinch the caption and the logo.
    const before = f.kit.captionStyle.size
    await pinch(f, f.caption, 1.5)
    await pinch(f, f.logo, 1.4)
    assert.equal(await saveState(f), 'unsaved')
    await f.page.locator('[data-brand-save-bar]').scrollIntoViewIfNeeded()
    await capture(f, 'mobile-light-unsaved')
    const payload = await save(f)
    assert.ok(payload.captionStyle.size > before, `Pinch grows the caption: ${payload.captionStyle.size}`)
    assert.ok(payload.watermarkSize > 0.18, `Pinch grows the logo: ${payload.watermarkSize}`)
    const saved = f.page.locator('[data-toast-illustrated]').filter({ hasText: 'Brand kit saved' })
    await saved.waitFor()
    const savedBox = await saved.boundingBox()
    const viewport = f.page.viewportSize()
    assert.ok(Math.abs(savedBox.x + savedBox.width / 2 - viewport.width / 2) < 2, 'The saved toast is centred')
    assert.ok(savedBox.y > viewport.height / 2 && savedBox.y + savedBox.height < viewport.height, 'The saved toast sits at the bottom')

    // Font upload opens as a bottom sheet; the logo screen keeps Back first.
    await f.page.locator('[data-brand-captions]').getByRole('button', { name: /^Font\s/ }).click()
    await f.page.getByRole('dialog', { name: 'Fonts' }).getByRole('button', { name: /Upload your font/ }).click()
    const sheet = f.page.getByRole('dialog', { name: 'Upload your font' })
    await sheet.waitFor()
    await f.page.waitForTimeout(400)
    const box = await sheet.boundingBox()
    assert.ok(Math.abs(box.y + box.height - 844) < 2, 'Font upload is a bottom sheet')
    await capture(f, 'mobile-light-font-upload')
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click()
    await f.editor.locator('[data-brand-logo-summary]').click()
    assert.ok(await top('[data-brand-back]') < await top('[data-brand-preview]'))
    assert.ok(await top('[data-brand-preview]') < await top('[data-brand-logo]'))
    await noOverflow(f, 'Phone logo screen')
    await capture(f, 'mobile-light-logo')
  } finally {
    await f.close()
  }
  console.log('Phone: canvas order, pinch caption + logo, saved toast, font sheet, logo screen passed')
}

// ---------------------------------------------------------------- dark
async function dark() {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const f = await fixture({ dark: true, viewport })
    const name = viewport.width < 1024 ? 'mobile' : 'desktop'
    try {
      await f.open()
      await f.ready()
      assert.equal(await f.page.evaluate(() => document.documentElement.classList.contains('dark')), true)
      const colors = await f.page.evaluate(() => {
        const selected = document.querySelector('[role="radiogroup"] [aria-checked="true"]')
        const card = document.querySelector('[data-brand-captions]')
        return { selected: getComputedStyle(selected).backgroundColor, card: getComputedStyle(card).backgroundColor }
      })
      assert.deepEqual(colors, { selected: 'rgb(142, 155, 176)', card: 'rgb(24, 31, 43)' }, 'Dark selected segment and card colours')
      await noOverflow(f, `Dark ${name}`)
      await capture(f, `${name}-dark-main`)
      await f.editor.locator('[data-brand-logo-summary]').click()
      await f.editor.locator('[data-brand-logo]').waitFor()
      await capture(f, `${name}-dark-logo`)
    } finally {
      await f.close()
    }
  }
  console.log('Dark: desktop + phone editor and logo screen passed')
}

// Optional: component Fast Refresh keeps unsaved edits, the open view and the mounted video.
async function fastRefresh() {
  if (process.env.RUN_FAST_REFRESH !== '1') {
    console.log('SKIPPED Fast Refresh source probe; set RUN_FAST_REFRESH=1 after concurrent source edits stop')
    return
  }
  const f = await fixture()
  const sourcePath = new URL('../src/components/dashboard/brand/caption-card.tsx', import.meta.url)
  const anchor = 'data-brand-captions=""'
  const marker = `${anchor} data-brand-refresh-probe="updated"`
  const timestamps = await stat(sourcePath)
  const source = await readFile(sourcePath, 'utf8')
  try {
    await f.open()
    await f.ready()
    await f.page.getByRole('button', { name: 'Karaoke fill', exact: true }).click()
    await f.page.evaluate(() => { window.refreshProbe = { root: document.querySelector('[data-brand-workspace]'), video: document.querySelector('[data-brand-preview-video]') } })
    await writeFile(sourcePath, source.replace(anchor, marker))
    await f.page.locator('[data-brand-refresh-probe="updated"]').waitFor()
    assert.equal(await saveState(f), 'unsaved')
    assert.equal(await f.page.evaluate(() => window.refreshProbe.root === document.querySelector('[data-brand-workspace]') && window.refreshProbe.video === document.querySelector('[data-brand-preview-video]')), true)
  } finally {
    await writeFile(sourcePath, source)
    await utimes(sourcePath, timestamps.atime, timestamps.mtime)
    await f.close()
  }
  console.log('Fast Refresh keeps unsaved edits, workspace DOM and native video')
}

// BRAND_FLOWS=logo,preview runs a subset while iterating; the default runs every flow.
const flows = { captions, logo, preview, states, phone, dark, fastRefresh }
const selected = process.env.BRAND_FLOWS ? process.env.BRAND_FLOWS.split(',') : Object.keys(flows)
try {
  for (const name of selected) await flows[name]()
  assert.deepEqual(errors, [], 'No unexpected browser runtime or console errors')
  await writeFile(new URL('summary.json', output), JSON.stringify({ passed: true, errors }, null, 2))
  console.log('Brand kit editor browser checks passed (mocked APIs only)')
} finally {
  await browser.close()
}
