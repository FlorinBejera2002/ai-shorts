import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// All accounts, posts, uploads and API responses in this runner are synthetic.
// Start Vite separately. Enable source mutation only after concurrent UI edits stop.
if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Bucharest',
  reducedMotion: 'reduce'
})
page.setDefaultTimeout(30000)
const errors = []
const updates = []
const uploads = []
page.on('pageerror', error => errors.push(error.message))
const user = {
  id: '00000000-0000-4000-8000-000000000011',
  email: 'instagram-composer@example.invalid', name: 'Instagram Composer Test',
  plan: 'pro', credits: 100, access_role: 'member'
}
const account = {
  id: '00000000-0000-4000-8000-000000000012', provider: 'instagram',
  name: 'Synthetic Instagram', username: 'synthetic_instagram', status: 'connected',
  scopes: ['instagram_business_basic', 'instagram_business_content_publish']
}
const today = new Date()
today.setUTCHours(12, 0, 0, 0)
const imageA = { type: 'image', reference: `publishing/${user.id}/studio-a.png`, name: 'studio-a.png' }
const imageB = { type: 'image', reference: `publishing/${user.id}/studio-b.png`, name: 'studio-b.png' }
const postBase = {
  caption: 'Synthetic draft for browser verification', notes: null,
  platforms: ['instagram'], accountIds: [account.id], status: 'draft',
  publishingDestinations: [], scheduledAt: today.toISOString(),
  createdAt: today.toISOString(), updatedAt: today.toISOString(), clip: null,
  instagram: { commentEnabled: true, shareToFeed: true }
}
const carouselId = '00000000-0000-4000-8000-000000000013'
const reelId = '00000000-0000-4000-8000-000000000014'
const posts = new Map([
  [carouselId, { ...postBase, id: carouselId, title: 'Synthetic Instagram carousel', media: [imageA, imageB] }],
  [reelId, { ...postBase, id: reelId, title: 'Synthetic Instagram Reel', media: [
    { type: 'video', reference: `publishing/${user.id}/reel.mp4`, name: 'reel.mp4' }
  ] }]
])
const preview = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#ddd"/><rect x="150" y="100" width="300" height="400" fill="#333"/></svg>').toString('base64')}`
const coverReference = `publishing/${user.id}/reel-cover.png`
const coverPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDKsAAAAASUVORK5CYII=', 'base64')

await page.route('**/v1/**', route => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
await page.route('**/api/**', async route => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.pathname === '/api/publishing') return route.fulfill({ json: {
    providers: [{ id: 'instagram', name: 'Instagram', configured: true, supportsPublishing: true }],
    accounts: [account], clips: [], posts: []
  } })
  if (url.pathname === '/api/calendar' && request.method() === 'GET')
    return route.fulfill({ json: { posts: [...posts.values()], clips: [] } })
  if (url.pathname.startsWith('/api/calendar/') && request.method() === 'PATCH') {
    const id = url.pathname.split('/').at(-1)
    const previous = posts.get(id)
    assert.ok(previous, 'Only synthetic post IDs may be updated')
    const body = request.postDataJSON()
    assert.equal(body.status, 'draft', 'The harness must never publish or schedule')
    const post = { ...previous, ...body, updatedAt: new Date().toISOString() }
    updates.push({ id, body })
    posts.set(id, post)
    return route.fulfill({ json: { post } })
  }
  if (url.pathname === '/api/publishing/media/preview')
    return route.fulfill({ json: { url: preview } })
  if (url.pathname === '/api/publishing/media' && request.method() === 'POST') {
    uploads.push(request.postDataBuffer())
    return route.fulfill({ json: { type: 'image', reference: coverReference, name: 'reel-cover.png' } })
  }
  if (url.pathname === '/api/user/profile') return route.fulfill({ json: { profile: {
    ...user, image: null, provider: 'password', canChangePassword: true,
    recentlyAuthenticated: true, emailVerified: today.toISOString(), createdAt: today.toISOString()
  } } })
  if (url.pathname === '/api/workspace-agent/runs')
    return route.fulfill({ json: { runs: [], has_more: false } })
  if (url.pathname === '/api/workspace-agent/suggestions')
    return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  assert.equal(request.method(), 'GET', `Unexpected mutation: ${request.method()} ${url.pathname}`)
  return route.fulfill({ json: {} })
})

// Media lives in the composer's media dialog; each photo opens its own editor dialog.
// Platform options (Instagram settings) live in the platform options dialog.
const mediaDialog = () => page.locator('[data-post-media-dialog]')
const imageEditor = () => page.locator('[data-publishing-image-editor]')
const platformDialog = () => page.locator('[data-platform-options]')

async function openPost(id) {
  const postTitle = posts.get(id).title
  const open = page.getByRole('button', { name: `Open post ${postTitle}`, exact: true })
  const edit = page.getByRole('button', { name: `Edit ${postTitle}`, exact: true })
  // The queue opens on Scheduled; drafts live under All. A row click opens the detail, whose Edit opens the composer.
  const all = page.locator('[data-publishing-workspace]').getByRole('tab', { name: /^All/ })
  if (await all.count() && (await all.getAttribute('aria-selected')) !== 'true') await all.click()
  await open.or(edit).first().click()
  const editPost = page.getByRole('button', { name: 'Edit post', exact: true })
  const title = page.getByLabel('Post title', { exact: true })
  await title.or(editPost).first().waitFor({ state: 'attached' })
  if (!(await title.count())) await editPost.click()
  await title.waitFor({ state: 'attached' })
  assert.equal(await title.inputValue(), posts.get(id).title)
}

async function openMediaDialog() {
  await page.getByRole('button', { name: 'Change media', exact: true }).first().click()
  await mediaDialog().waitFor()
}

async function confirmMedia() {
  await mediaDialog().getByRole('button', { name: 'Use media', exact: true }).click()
  await mediaDialog().waitFor({ state: 'detached' })
}

async function openImage(name) {
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click()
  const editor = imageEditor()
  await editor.getByLabel('Alternative text', { exact: true }).waitFor()
  return editor
}

async function closeImage(editor) {
  await editor.getByRole('button', { name: 'Done', exact: true }).last().click()
  await editor.waitFor({ state: 'detached' })
}

async function openPreferences() {
  await page.getByRole('button', { name: 'Platform options', exact: true }).click()
  await platformDialog().getByLabel('Collaborators', { exact: true }).waitFor()
}

async function closePreferences() {
  await platformDialog().getByRole('button', { name: 'Done', exact: true }).click()
  await platformDialog().waitFor({ state: 'detached' })
}

async function choose(label, option) {
  const control = page.getByRole('combobox', { name: label, exact: true })
  if (await control.evaluate(element => element.tagName) === 'SELECT')
    await control.selectOption({ label: option })
  else {
    await control.click()
    await page.getByRole('option', { name: option, exact: true }).click()
  }
}

async function moveSlider(scope, label, key, count = 1) {
  const slider = scope.getByRole('slider', { name: label, exact: true })
  for (let index = 0; index < count; index++) await slider.press(key)
  return Number(await slider.getAttribute('aria-valuenow'))
}

// The crop position is moved on the crop stage itself (no slider): arrow keys nudge the photo under the frame.
async function nudgeCropFrame(scope, key, count) {
  const frame = scope.locator('[data-positionable]')
  await frame.focus()
  for (let index = 0; index < count; index++) await frame.press(key)
}

async function savePost(id) {
  const response = page.waitForResponse(value =>
    value.request().method() === 'PATCH' && new URL(value.url()).pathname === `/api/calendar/${id}`)
  // Draft posts submit through the composer's primary "Save draft" action.
  await page.getByRole('button', { name: 'Save draft', exact: true }).click()
  assert.equal((await response).status(), 200)
  await page.getByRole('button', { name: 'New post', exact: true }).first().waitFor()
  return updates.at(-1).body
}

async function capture(name) {
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true })
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo(0, 0)
  })
  await page.screenshot({ path: fileURLToPath(new URL(`../test-results/${name}.png`, import.meta.url)), fullPage: true })
}

async function rememberDashboard() {
  await page.locator('[data-slot="sidebar"][data-variant]').waitFor()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => {
    window.instagramDashboardProbe = {
      main: document.querySelector('main'),
      sidebar: document.querySelector('[data-slot="sidebar"]'),
      header: document.querySelector('header.studio-topbar'),
      sidebarState: document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')
    }
  })
}

async function assertDashboardIdentity() {
  assert.equal(await page.evaluate(() => {
    const probe = window.instagramDashboardProbe
    return !!probe?.main && !!probe.sidebar && !!probe.header &&
      probe.main === document.querySelector('main') &&
      probe.sidebar === document.querySelector('[data-slot="sidebar"]') &&
      probe.header === document.querySelector('header.studio-topbar') &&
      probe.sidebarState === document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')
  }), true, 'Navigation and component updates preserve dashboard DOM and sidebar state')
}

async function verifyFastRefresh(editor) {
  if (process.env.RUN_FAST_REFRESH !== '1') {
    console.log('SKIPPED Fast Refresh source mutation; set RUN_FAST_REFRESH=1 after UI edits finish')
    return
  }
  const sourcePath = new URL('../src/components/calendar/publishing-image-editor.tsx', import.meta.url)
  const anchor = '<div className={styles.controls}>'
  const probe = anchor.replace('<div ', '<div data-instagram-refresh-probe="updated" ')
  const source = await readFile(sourcePath, 'utf8')
  assert.equal(source.split(anchor).length, 2, 'Refresh probe anchor is unique')
  const unsavedTag = editor.getByLabel('Tag people', { exact: true })
  await unsavedTag.fill('unsaved_tag_state')
  try {
    await writeFile(sourcePath, source.replace(anchor, probe))
    await page.locator('[data-instagram-refresh-probe="updated"]').first().waitFor()
    assert.equal(await unsavedTag.inputValue(), 'unsaved_tag_state', 'Fast Refresh preserves local child input state')
    assert.equal(await editor.getByLabel('Alternative text', { exact: true }).inputValue(), 'A studio camera beside a window.')
    await assertDashboardIdentity()
  } finally {
    const current = await readFile(sourcePath, 'utf8')
    if (current.includes(probe)) await writeFile(sourcePath, current.replace(probe, anchor))
  }
  await page.waitForFunction(() => document.querySelectorAll('[data-instagram-refresh-probe]').length === 0)
  console.log('Component Fast Refresh preserves local input, form values and dashboard DOM')
}

try {
  await page.goto(`${origin}/dashboard/publish`, { waitUntil: 'networkidle', timeout: 180000 })
  await page.getByRole('button', { name: 'New post', exact: true }).first().waitFor()
  await page.locator('[data-sidebar="trigger"]').first().click()
  await rememberDashboard()
  await openPost(carouselId)
  await assertDashboardIdentity()
  await openMediaDialog()
  // The carousel format is chosen in the first photo's editor and applies to every photo.
  const first = await openImage(imageA.name)
  await first.getByRole('radio', { name: '4:5', exact: true }).check()
  // Zoom first: at zoom 1 a 4:5 crop of a landscape photo has no vertical room to move.
  const cropZoom = await moveSlider(first, 'Zoom', 'ArrowRight', 15)
  await nudgeCropFrame(first, 'ArrowRight', 7)
  await nudgeCropFrame(first, 'ArrowUp', 9)
  await first.getByLabel('Alternative text', { exact: true }).fill('A studio camera beside a window.')
  await first.getByLabel('Tag people', { exact: true }).fill('@sneep_artist')
  await first.getByRole('button', { name: 'Add', exact: true }).click()
  await first.locator('summary').filter({ hasText: '@sneep_artist' }).click()
  const tagX = await moveSlider(first, 'sneep_artist: horizontal position', 'ArrowRight', 4)
  const tagY = await moveSlider(first, 'sneep_artist: vertical position', 'ArrowLeft', 6)
  await verifyFastRefresh(first)
  await closeImage(first)
  const second = await openImage(imageB.name)
  await second.getByLabel('Alternative text', { exact: true }).fill('A microphone on a wooden desk.')
  await closeImage(second)
  await page.getByRole('button', { name: `Drag to reorder ${imageB.name}`, exact: true }).press('ArrowUp')
  await confirmMedia()
  await openPreferences()
  await platformDialog().getByLabel('Collaborators', { exact: true }).fill('sneep_artist, sneep_editor')
  await platformDialog().getByLabel('Location', { exact: true }).fill('123456789')
  assert.equal(await platformDialog().getByLabel('Original audio name', { exact: true }).count(), 0, 'Photo carousels omit Reel-only controls')
  assert.equal(await platformDialog().getByLabel('Cover frame (seconds)', { exact: true }).count(), 0)
  await closePreferences()

  const saved = await savePost(carouselId)
  assert.deepEqual(saved.media.map(item => item.reference), [imageB.reference, imageA.reference])
  assert.equal(saved.media[0].altText, 'A microphone on a wooden desk.')
  assert.equal(saved.media[1].altText, 'A studio camera beside a window.')
  // Crop starts centred at (0.5, 0.5). ArrowRight moves the photo right, which lowers crop x; ArrowUp moves it up, which raises crop y.
  assert.equal(saved.media[1].crop.aspectRatio, '4:5')
  assert.equal(saved.media[1].crop.zoom, cropZoom)
  assert.ok(saved.media[1].crop.x < 0.5, 'Arrow right repositions the crop to the right in the payload')
  assert.ok(saved.media[1].crop.y > 0.5, 'Arrow up repositions the crop upward in the payload')
  assert.deepEqual(saved.media[1].userTags, [{ username: 'sneep_artist', x: tagX / 100, y: tagY / 100 }])
  assert.equal(saved.instagram.locationId, '123456789')
  assert.deepEqual(saved.instagram.collaborators, ['sneep_artist', 'sneep_editor'])
  await assertDashboardIdentity()
  await openPost(carouselId)
  await openMediaDialog()
  const restored = await openImage(imageA.name)
  assert.equal(await restored.getByLabel('Alternative text', { exact: true }).inputValue(), saved.media[1].altText)
  assert.equal(Number(await restored.getByRole('slider', { name: 'Zoom', exact: true }).getAttribute('aria-valuenow')), cropZoom)
  await closeImage(restored)
  await confirmMedia()
  await openPreferences()
  assert.equal(await platformDialog().getByLabel('Location', { exact: true }).inputValue(), '123456789')
  await closePreferences()
  console.log('Carousel crop, alt text, positioned tags, order and advanced settings survive save and reopen')

  await page.setViewportSize({ width: 390, height: 844 })
  await openMediaDialog()
  const mobileEditor = await openImage(imageA.name)
  await mobileEditor.getByLabel('Alternative text', { exact: true }).fill('Mobile edit: a camera beside a window.')
  await closeImage(mobileEditor)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'Mobile composer does not overflow horizontally')
  await capture('instagram-composer-mobile')
  await confirmMedia()
  const mobileSaved = await savePost(carouselId)
  assert.equal(mobileSaved.media[1].altText, 'Mobile edit: a camera beside a window.')
  console.log('Mobile composer remains usable and saves per-image edits')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await rememberDashboard()
  await openPost(reelId)
  await openPreferences()
  assert.equal(await page.getByLabel('Alternative text', { exact: true }).count(), 0, 'Reels omit photo alt-text controls')
  await platformDialog().getByLabel('Original audio name', { exact: true }).fill('Synthetic studio audio')
  await platformDialog().getByLabel('Cover frame (seconds)', { exact: true }).fill('1.5')
  await platformDialog().getByRole('switch', { name: 'AI-generated content', exact: true }).click()
  await choose('Trial Reel', 'Trial — share manually')
  await closePreferences()
  const reelSaved = await savePost(reelId)
  assert.equal(reelSaved.instagram.audioName, 'Synthetic studio audio')
  assert.equal(reelSaved.instagram.thumbOffset, 1500)
  assert.equal(reelSaved.instagram.isAiGenerated, true)
  assert.equal(reelSaved.instagram.trialReel, 'MANUAL')
  await openPost(reelId)
  await openPreferences()
  assert.equal(await platformDialog().getByLabel('Original audio name', { exact: true }).inputValue(), 'Synthetic studio audio')
  assert.equal(await platformDialog().getByLabel('Cover frame (seconds)', { exact: true }).inputValue(), '1.5')
  const coverPreview = page.waitForResponse(value => {
    const url = new URL(value.url())
    return url.pathname === '/api/publishing/media/preview' && url.searchParams.get('reference') === coverReference
  })
  // The compact cover drawer labels its file input with the Cover group copy.
  await platformDialog().getByLabel('Cover', { exact: true }).setInputFiles({ name: 'reel-cover.png', mimeType: 'image/png', buffer: coverPng })
  await coverPreview
  await platformDialog().getByRole('img', { name: 'Reel cover', exact: true }).waitFor()
  await assertDashboardIdentity()
  await capture('instagram-composer-reel')
  // Full-page screenshots can temporarily resize the layout viewport. Keep
  // navigation checks scoped to the desktop shell after capture completes.
  await rememberDashboard()
  await closePreferences()
  const coveredReel = await savePost(reelId)
  await assertDashboardIdentity()
  assert.equal(uploads.length, 1)
  assert.equal(coveredReel.instagram.coverReference, coverReference)
  assert.equal(coveredReel.instagram.thumbOffset, undefined, 'A custom cover replaces the selected video frame')
  console.log('Reel audio, thumbnail time, AI disclosure, trial mode and uploaded cover persist')
  assert.deepEqual(errors, [], 'No browser runtime errors')
  console.log('Instagram composer browser checks passed (mocked APIs only)')
} catch (error) {
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true })
  await page.screenshot({
    path: fileURLToPath(new URL('../test-results/instagram-composer-failure.png', import.meta.url)),
    fullPage: true
  }).catch(() => {})
  throw error
} finally {
  await browser.close()
}
