import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { deflateSync, crc32 } from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Canvas coverage for the Publish composer previews and photo editor. Every API response is synthetic;
// mutations are captured by the mock and never reach a backend.
if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
const output = new URL('../test-results/publish-preview-photos-canvas/', import.meta.url)
const timeZone = 'Europe/Bucharest'
const user = {
  id: '00000000-0000-4000-8000-000000000093',
  email: 'publish-preview-photos@example.invalid', name: 'Design Workspace',
  plan: 'pro', credits: 100, access_role: 'member'
}
const providerNames = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' }
const platformOrder = ['Instagram', 'Facebook', 'TikTok', 'YouTube']
const accounts = Object.entries(providerNames).map(([provider, name], index) => ({
  id: `00000000-0000-4000-8000-0000000003${index}0`, provider, name: `Synthetic ${name}`,
  username: 'sneepcutstudio', status: 'connected',
  scopes: ['video_publish', 'video.publish', 'instagram_business_content_publish']
}))
const account = provider => accounts.find(item => item.provider === provider)
const caption = 'Canvas preview caption for the synthetic post.'
const altOne = 'A synthetic studio window at dusk.'
const dimensions = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }
const schemes = ['light', 'dark']
const results = []

// Two-colour PNG fixtures (360x640) generated in-process so crops have real overflow to move.
function makePng(width, height, [red, green, blue]) {
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x++) row.set([red, green, blue], 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type), data])
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ])
}
const photos = [
  { name: 'photo-one.png', reference: `publishing/${user.id}/photo-one.png`, png: makePng(360, 640, [36, 52, 79]) },
  { name: 'photo-two.png', reference: `publishing/${user.id}/photo-two.png`, png: makePng(360, 640, [120, 84, 60]) }
]
const dataUrl = png => `data:image/png;base64,${png.toString('base64')}`
const photoByReference = reference => photos.find(item => item.reference === reference)
const planned = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()

async function runScenario(browser, label, viewport, colorScheme) {
  const context = await browser.newContext({ viewport, timeZone, colorScheme, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  const errors = []
  const mutations = []
  const uploads = []
  let nextUpload = 0
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  await context.route('**/v1/**', route => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
  await context.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    if (url.pathname === '/api/publishing' && method === 'GET') {
      return route.fulfill({ json: {
        providers: Object.entries(providerNames).map(([id, name]) => ({ id, name, configured: true, supportsPublishing: true })),
        accounts, clips: [], posts: []
      } })
    }
    if (url.pathname === '/api/calendar' && method === 'GET') return route.fulfill({ json: { posts: [], clips: [] } })
    if (url.pathname === '/api/calendar' && method === 'POST') {
      const body = request.postDataJSON()
      mutations.push({ method, body })
      const post = { ...body, id: '00000000-0000-4000-8000-000000000501', clip: null, publishingDestinations: [], createdAt: planned, updatedAt: planned }
      return route.fulfill({ json: { post } })
    }
    if (url.pathname === '/api/publishing/media' && method === 'POST') {
      uploads.push(request.postDataBuffer())
      const photo = photos[nextUpload++ % photos.length]
      return route.fulfill({ json: { type: 'image', reference: photo.reference, name: photo.name } })
    }
    if (url.pathname === '/api/publishing/media/preview') {
      const photo = photoByReference(url.searchParams.get('reference'))
      return route.fulfill({ json: { url: dataUrl(photo?.png ?? photos[0].png) } })
    }
    if (url.pathname === `/api/publishing/accounts/${account('tiktok').id}/options`) {
      return route.fulfill({ json: {
        privacyLevels: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
        commentDisabled: false, duetDisabled: false, stitchDisabled: false, maxDuration: 600, nickname: 'Synthetic TikTok'
      } })
    }
    if (url.pathname === '/api/user/profile') return route.fulfill({ json: { profile: { ...user, image: null, provider: 'password', canChangePassword: true, recentlyAuthenticated: true, emailVerified: planned, createdAt: planned } } })
    if (url.pathname.startsWith('/api/workspace-agent/')) return route.fulfill({ json: { runs: [], suggestions: [], capabilities: [], has_more: false } })
    if (method !== 'GET') return route.fulfill({ status: 405, json: { error: 'Unexpected synthetic write blocked' } })
    return route.fulfill({ json: {} })
  })

  const root = page.locator('[data-post-composer]')
  const preview = page.locator('[data-composer-preview]')
  const accountTile = provider => root.locator(`[data-composer-account="${account(provider).id}"]`)
  const mediaDialog = page.getByRole('dialog', { name: 'Media', exact: true })
  const expandedDialog = page.getByRole('dialog', { name: 'Preview', exact: true })
  const editor = page.getByRole('dialog', { name: 'Edit photo', exact: true })
  const isPhone = viewport.width < 768
  const frameOf = scope => scope.locator('[data-positionable]')

  async function setAccount(provider, selected) {
    if (await accountTile(provider).getAttribute('aria-pressed') !== String(selected)) await accountTile(provider).click()
    assert.equal(await accountTile(provider).getAttribute('aria-pressed'), String(selected), `${provider} selection is ${selected}`)
  }
  async function openComposer() {
    await page.goto(`${origin}/dashboard/publish/new`, { waitUntil: 'load', timeout: 180000 })
    await root.waitFor()
  }
  async function openMedia() {
    await root.getByRole('button', { name: 'Change media', exact: true }).click()
    await mediaDialog.waitFor()
  }
  async function assertFits(locator, name) {
    const box = await locator.boundingBox()
    assert.ok(box, `${name} is rendered`)
    assert.ok(box.x >= -1 && box.x + box.width <= viewport.width + 1, `${name} stays inside the viewport`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow`)
  }
  async function screenshot(name) {
    await mkdir(output, { recursive: true })
    await page.waitForLoadState('load')
    await page.screenshot({ path: fileURLToPath(new URL(`${label}-${name}.png`, output)) })
  }
  async function overlayFor(scope, provider) {
    const overlay = scope.locator(`[data-platform-overlay="${provider}"]`)
    await overlay.waitFor()
    return overlay
  }
  async function frameTransform(scope) {
    await frameOf(scope).waitFor()
    return frameOf(scope).locator('img').evaluate(element => `${element.style.left}|${element.style.top}`)
  }
  async function dragFrame(scope, dx, dy) {
    await frameOf(scope).waitFor()
    const box = await frameOf(scope).boundingBox()
    assert.ok(box, 'Crop frame is rendered')
    const startX = box.x + box.width / 2
    const startY = box.y + box.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + dx, startY + dy, { steps: 6 })
    await page.mouse.up()
  }

  try {
    await openComposer()
    await assertFits(root, 'Composer')
    for (const provider of Object.keys(providerNames)) await setAccount(provider, true)
    await root.getByLabel('Post text', { exact: true }).fill(caption)

    // Upload two photos; the preview becomes a photo carousel.
    await openMedia()
    await mediaDialog.getByRole('tab', { name: 'From device', exact: true }).click()
    for (const photo of photos) {
      await mediaDialog.locator('input[type="file"]').first().setInputFiles({ name: photo.name, mimeType: 'image/png', buffer: photo.png })
      await mediaDialog.getByRole('button', { name: `Edit ${photo.name}`, exact: true }).waitFor()
    }
    await mediaDialog.getByRole('button', { name: 'Use media', exact: true }).click()
    await mediaDialog.waitFor({ state: 'hidden' })
    assert.ok(uploads.length >= 2, 'Both photos use the mocked media API')
    await preview.locator('[data-publishing-media-stage] img').first().waitFor()

    // Platform tabs follow the fixed Instagram, Facebook, TikTok, YouTube order and each switches its overlay.
    const tabNames = await preview.getByRole('tab').evaluateAll(tabs => tabs.map(tab => tab.getAttribute('aria-label')))
    assert.deepEqual(tabNames, platformOrder, 'Preview tabs follow the platform order')
    for (const provider of Object.keys(providerNames)) {
      await preview.getByRole('tab', { name: providerNames[provider], exact: true }).click()
      assert.equal(await preview.getByRole('tab', { name: providerNames[provider], exact: true }).getAttribute('aria-selected'), 'true')
      const overlay = await overlayFor(preview, provider)
      assert.equal(await overlay.getAttribute('data-chrome'), 'off', `${provider} inline preview hides the phone chrome`)
      assert.equal(await overlay.getByText(caption, { exact: false }).count() > 0, true, `${provider} overlay carries the post caption`)
      assert.equal(await overlay.getByText('@sneepcutstudio', { exact: true }).count() > 0, true, `${provider} overlay carries the connected account`)
    }
    assert.equal(await preview.locator('[data-platform-overlay="youtube"]').count(), 1, 'Only the selected platform overlay is mounted')
    await screenshot('inline-youtube')
    await preview.getByRole('tab', { name: 'Instagram', exact: true }).click()

    // Carousel navigation inside the preview.
    await preview.getByText('1 of 2', { exact: true }).waitFor()
    await preview.getByRole('button', { name: 'Previous media', exact: true }).waitFor()
    await preview.getByRole('button', { name: 'Next media', exact: true }).click()
    await preview.getByText('2 of 2', { exact: true }).waitFor()
    assert.equal(await preview.getByRole('button', { name: 'Next media', exact: true }).isDisabled(), true, 'Next is disabled on the last photo')
    await preview.getByRole('button', { name: 'Previous media', exact: true }).click()
    await preview.getByText('1 of 2', { exact: true }).waitFor()

    // Expanded preview: opens with the same platforms, switches tabs, and closes back to the expand control.
    const expandButton = preview.getByRole('button', { name: 'Expand preview', exact: true })
    await expandButton.click()
    await expandedDialog.waitFor()
    for (const provider of ['tiktok', 'youtube', 'facebook', 'instagram']) {
      await expandedDialog.getByRole('tab', { name: providerNames[provider], exact: true }).click()
      const overlay = await overlayFor(expandedDialog, provider)
      assert.equal(await overlay.getAttribute('data-chrome'), 'on', `${provider} expanded preview shows the phone chrome`)
    }
    await screenshot('expanded')
    await expandedDialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
    await expandedDialog.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Expand preview')

    // Photo editor: format, zoom, reset, drag and arrow positioning, alt text, tags, cancel and done.
    await openMedia()
    const firstRow = mediaDialog.getByRole('button', { name: `Edit ${photos[0].name}`, exact: true })
    await firstRow.click()
    await editor.waitFor()
    await editor.getByRole('radio', { name: '4:5', exact: true }).check({ force: true })
    await frameOf(editor).waitFor()
    const zoom = editor.getByRole('slider', { name: 'Zoom', exact: true })
    for (let index = 0; index < 10; index++) await zoom.press('ArrowRight')
    assert.equal(Number(await zoom.getAttribute('aria-valuenow')) > 1, true, 'Zoom slider increases')
    await editor.getByRole('button', { name: 'Reset crop', exact: true }).click()
    assert.equal(Number(await zoom.getAttribute('aria-valuenow')), 1, 'Reset crop restores zoom')
    const beforeDrag = await frameTransform(editor)
    await dragFrame(editor, 0, 36)
    const afterDrag = await frameTransform(editor)
    assert.notEqual(afterDrag, beforeDrag, 'Dragging the crop frame repositions the photo')
    await frameOf(editor).focus()
    await frameOf(editor).press('ArrowUp')
    assert.notEqual(await frameTransform(editor), afterDrag, 'Arrow keys reposition the crop frame')
    for (let index = 0; index < 10; index++) await zoom.press('ArrowRight')
    const zoomed = Number(await zoom.getAttribute('aria-valuenow'))
    await editor.getByLabel('Alternative text', { exact: true }).fill(altOne)
    await editor.getByLabel('Tag people', { exact: true }).fill('sneep_artist')
    await editor.getByRole('button', { name: 'Add', exact: true }).click()
    await editor.getByLabel('Tag people', { exact: true }).fill('sneep_editor')
    await editor.getByRole('button', { name: 'Add', exact: true }).click()
    await editor.getByRole('button', { name: 'Remove tag for sneep_editor', exact: true }).click()
    assert.equal(await editor.locator('summary').filter({ hasText: '@sneep_artist' }).count(), 1, 'Tag chips add and remove')
    assert.equal(await editor.getByRole('button', { name: 'Remove tag for sneep_editor', exact: true }).count(), 0, 'Removed tag leaves the list')
    await editor.getByRole('button', { name: 'Done', exact: true }).click()
    await editor.waitFor({ state: 'hidden' })
    await screenshot('photo-editor')

    // Cancel discards alt text edits on the second photo.
    await mediaDialog.getByRole('button', { name: `Edit ${photos[1].name}`, exact: true }).click()
    await editor.waitFor()
    await editor.getByLabel('Alternative text', { exact: true }).fill('Discarded alt text.')
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
    await editor.waitFor({ state: 'hidden' })

    // Reorder: the second photo moves to the front with the keyboard handle.
    await mediaDialog.getByRole('button', { name: `Drag to reorder ${photos[1].name}`, exact: true }).press('ArrowUp')
    await mediaDialog.getByRole('button', { name: 'Use media', exact: true }).click()
    await mediaDialog.waitFor({ state: 'hidden' })
    await preview.getByText('1 of 2', { exact: true }).waitFor()
    await screenshot('media-saved')

    await assertFits(preview, 'Preview pane')
    if (isPhone) assert.equal(await preview.getByRole('button', { name: 'Expand preview', exact: true }).isVisible(), true, 'Phones keep the expand control in the card header')

    // Save draft sends the order, crop, alt text and tags with the post.
    const saved = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === '/api/calendar')
    await root.getByRole('button', { name: 'Save draft', exact: true }).click()
    assert.equal((await saved).status(), 200)
    const body = mutations.at(-1).body
    assert.deepEqual(body.media.map(item => item.reference), [photos[1].reference, photos[0].reference], 'Reordered media reaches the payload')
    const edited = body.media.find(item => item.reference === photos[0].reference)
    assert.equal(edited.altText, altOne, 'Alt text reaches the payload')
    assert.equal(edited.crop.aspectRatio, '4:5', 'Format reaches the payload')
    assert.equal(edited.crop.zoom, zoomed, 'Zoom reaches the payload')
    assert.notEqual(edited.crop.y, 0.5, 'Vertical drag reaches the payload')
    assert.deepEqual(edited.userTags.map(tag => tag.username), ['sneep_artist'], 'Tagged usernames reach the payload')
    assert.equal(body.media.find(item => item.reference === photos[1].reference).altText, undefined, 'Cancelled alt text is not saved')
    assert.deepEqual([...body.platforms].sort(), ['facebook', 'instagram', 'tiktok', 'youtube'].sort(), 'Every selected destination is kept')

    assert.deepEqual(errors, [], `${label}: no console or runtime errors`)
    results.push(`${label}: passed`)
  } catch (error) {
    await screenshot('failure').catch(() => {})
    console.error(`${label} errors:`, errors.slice(0, 6))
    throw error
  } finally {
    await context.close()
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const only = process.env.CANVAS_SCENARIO
  for (const [name, viewport] of Object.entries(dimensions))
    for (const scheme of schemes) {
      if (only && only !== `${name}-${scheme}`) continue
      await runScenario(browser, `${name}-${scheme}`, viewport, scheme)
    }
  console.log(results.join('\n'))
  console.log('Publish preview and photo canvas browser checks passed (mocked APIs only)')
} finally {
  await browser.close()
}
