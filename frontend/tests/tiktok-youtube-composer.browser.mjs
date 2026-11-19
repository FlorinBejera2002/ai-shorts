import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Every account, media preview and API response is synthetic. This runner may
// save only mocked drafts and never publishes to TikTok, YouTube or Facebook.
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
page.on('pageerror', error => errors.push(error.message))
const user = {
  id: '00000000-0000-4000-8000-000000000031',
  email: 'video-composer@example.invalid', name: 'Video Composer Test',
  plan: 'pro', credits: 100, access_role: 'member'
}
const facebookAccount = {
  id: '00000000-0000-4000-8000-000000000032', provider: 'facebook',
  name: 'Synthetic Facebook Page', username: 'synthetic_facebook', status: 'connected',
  scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
}
const tiktokAccount = {
  id: '00000000-0000-4000-8000-000000000033', provider: 'tiktok',
  name: 'Synthetic TikTok', username: 'synthetic_tiktok', status: 'connected',
  scopes: ['video.publish']
}
const youtubeAccount = {
  id: '00000000-0000-4000-8000-000000000034', provider: 'youtube',
  name: 'Synthetic YouTube Channel', username: 'synthetic_youtube', status: 'connected',
  scopes: ['video_publish']
}
const today = new Date()
today.setUTCHours(12, 0, 0, 0)
const photos = ['camera.png', 'microphone.png', 'studio.png'].map(name => ({
  type: 'image', reference: `publishing/${user.id}/${name}`, name
}))
const [imageA, imageB, imageC] = photos
const video = { type: 'video', reference: `publishing/${user.id}/studio.mp4`, name: 'studio.mp4' }
const replacement = { type: 'video', reference: `publishing/${user.id}/replacement.mp4`, name: 'replacement.mp4' }
const postBase = {
  caption: 'Synthetic draft for browser verification', notes: null,
  status: 'draft', publishingDestinations: [], scheduledAt: today.toISOString(),
  createdAt: today.toISOString(), updatedAt: today.toISOString(), clip: null
}
const photoId = '00000000-0000-4000-8000-000000000035'
const videoId = '00000000-0000-4000-8000-000000000036'
const posts = new Map([
  [photoId, { ...postBase, id: photoId, title: 'Synthetic TikTok photos',
    platforms: ['facebook'], accountIds: [facebookAccount.id], media: photos,
    facebook: { placeId: '123456789' } }],
  [videoId, { ...postBase, id: videoId, title: 'Synthetic TikTok and YouTube video',
    platforms: ['tiktok'], accountIds: [tiktokAccount.id], media: [video] }]
])
const preview = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#ddd"/><rect x="150" y="100" width="300" height="400" fill="#333"/></svg>').toString('base64')}`

await page.route('**/v1/**', route => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
await page.route('**/api/**', async route => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  if (path === '/api/publishing') return route.fulfill({ json: {
    providers: ['facebook', 'tiktok', 'youtube'].map(id => ({
      id, name: { facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' }[id],
      configured: true, supportsPublishing: true, youtubeAuditApproved: true
    })), accounts: [facebookAccount, tiktokAccount, youtubeAccount], clips: [], posts: []
  } })
  if (path === `/api/publishing/accounts/${tiktokAccount.id}/options`)
    return route.fulfill({ json: {
      privacyLevels: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
      commentDisabled: false, duetDisabled: false, stitchDisabled: false,
      maxDuration: 600, nickname: 'Synthetic TikTok'
    } })
  if (path === '/api/calendar' && request.method() === 'GET')
    return route.fulfill({ json: { posts: [...posts.values()], clips: [] } })
  if (path.startsWith('/api/calendar/') && request.method() === 'PATCH') {
    const id = path.split('/').at(-1)
    const previous = posts.get(id)
    assert.ok(previous, 'Only synthetic post IDs may be updated')
    const body = request.postDataJSON()
    assert.equal(body.status, 'draft', 'The harness must never publish or schedule')
    const post = { ...previous, ...body, updatedAt: new Date().toISOString() }
    updates.push({ id, body })
    posts.set(id, post)
    return route.fulfill({ json: { post } })
  }
  if (path === '/api/publishing/media/preview') return route.fulfill({ json: { url: preview } })
  if (path === '/api/publishing/media' && request.method() === 'POST') return route.fulfill({ json: replacement })
  if (path === '/api/user/profile') return route.fulfill({ json: { profile: {
    ...user, image: null, provider: 'password', canChangePassword: true,
    recentlyAuthenticated: true, emailVerified: today.toISOString(), createdAt: today.toISOString()
  } } })
  if (path === '/api/workspace-agent/runs') return route.fulfill({ json: { runs: [], has_more: false } })
  if (path === '/api/workspace-agent/suggestions') return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  assert.equal(request.method(), 'GET', `Unexpected mutation: ${request.method()} ${path}`)
  return route.fulfill({ json: {} })
})

// Media lives in the composer's media dialog; each photo opens its own editor dialog.
// Platform options (TikTok, YouTube, Facebook) live in the platform options dialog.
const mediaDialog = () => page.locator('[data-post-media-dialog]')
const imageEditor = () => page.locator('[data-publishing-image-editor]')
const platformDialog = () => page.locator('[data-platform-options]')
const platformNames = { facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' }
// Account tiles are labelled "<platform>: <username>".
const accountChoice = provider => page.getByRole('button', {
  name: `${platformNames[provider]}: synthetic_${provider}`, exact: true
})
const reviewConsent = () => platformDialog().getByRole('switch', { name: /I reviewed the channel/ })

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

async function cancelMedia() {
  await mediaDialog().getByRole('button', { name: 'Cancel', exact: true }).click()
  await mediaDialog().waitFor({ state: 'detached' })
}

async function openImage(name) {
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click()
  const editor = imageEditor()
  // Phones collapse the optional alternative text panel; it is absent for TikTok-only photos.
  const altDisclosure = editor.getByRole('button', { name: 'Alternative text', exact: true })
  if (await altDisclosure.count() && await altDisclosure.getAttribute('aria-expanded') !== 'true') await altDisclosure.click()
  await editor.getByRole('slider', { name: 'Zoom', exact: true }).waitFor()
  return editor
}

async function closeImage(editor) {
  await editor.getByRole('button', { name: 'Done', exact: true }).last().click()
  await editor.waitFor({ state: 'detached' })
}

async function openPreferences(provider) {
  if (!(await platformDialog().count()))
    await page.getByRole('button', { name: 'Platform options', exact: true }).click()
  await platformDialog().getByRole('tab', { name: platformNames[provider], exact: true }).click()
}

// Audience questions are yes/no radio groups under their question heading.
async function answerQuestion(question, answer) {
  const group = platformDialog().locator('section')
    .filter({ has: page.getByRole('heading', { name: question, exact: true }) })
  // The visible pill is the label wrapping the visually hidden radio input.
  const choice = group.locator('label').filter({ hasText: new RegExp(`^${answer}$`) })
  await choice.click()
  assert.equal(await choice.locator('input').isChecked(), true, `${question} records ${answer}`)
}

// Description, tags, license and embedding sit in the YouTube "More options" disclosure.
async function openYouTubeAdvanced() {
  const disclosure = platformDialog().locator('details').filter({ hasText: 'More options' })
  if (await disclosure.getAttribute('open') === null) await disclosure.locator('summary').click()
}

async function closePreferences() {
  await platformDialog().getByRole('button', { name: 'Done', exact: true }).click()
  await platformDialog().waitFor({ state: 'detached' })
}

async function choose(scope, label, option) {
  const control = scope.getByRole('combobox', { name: label, exact: true })
  if (await control.evaluate(element => element.tagName) === 'SELECT')
    await control.selectOption({ label: option })
  else {
    await control.click()
    await page.getByRole('option', { name: option, exact: true }).click()
  }
}

async function savePost(id) {
  const response = page.waitForResponse(value => value.request().method() === 'PATCH' &&
    new URL(value.url()).pathname === `/api/calendar/${id}`)
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
  // Allow the media-query subscriber to finish replacing the mobile drawer
  // after a viewport change before recording the desktop route identity.
  await page.locator('[data-slot="sidebar"][data-variant]').waitFor()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => {
    window.videoDashboardProbe = {
      main: document.querySelector('main'), sidebar: document.querySelector('[data-slot="sidebar"]'),
      header: document.querySelector('header.studio-topbar'),
      sidebarState: document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')
    }
  })
}

async function assertDashboardIdentity() {
  assert.deepEqual(await page.evaluate(() => {
    const probe = window.videoDashboardProbe
    return {
      main: !!probe?.main && probe.main === document.querySelector('main'),
      sidebar: !!probe?.sidebar && probe.sidebar === document.querySelector('[data-slot="sidebar"]'),
      header: !!probe?.header && probe.header === document.querySelector('header.studio-topbar'),
      sidebarState: !!probe?.sidebar && probe.sidebarState === document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')
    }
  }), { main: true, sidebar: true, header: true, sidebarState: true }, 'Composer navigation preserves dashboard DOM and sidebar state')
}

async function verifyFastRefresh() {
  if (process.env.RUN_FAST_REFRESH !== '1') {
    console.log('SKIPPED YouTube Fast Refresh source mutation; set RUN_FAST_REFRESH=1 after UI edits finish')
    return
  }
  const sourcePath = new URL('../src/components/calendar/youtube-advanced-settings.tsx', import.meta.url)
  const anchor = '<div className="space-y-4">'
  const probe = '<div className="space-y-4" data-youtube-refresh-probe="updated">'
  const source = await readFile(sourcePath, 'utf8')
  assert.equal(source.split(anchor).length, 2, 'YouTube advanced settings refresh anchor is unique')
  const tagsText = 'studio tour, camera, Romanian video, '
  await platformDialog().getByLabel('Tags', { exact: true }).fill(tagsText)
  await platformDialog().getByLabel('Tags', { exact: true }).evaluate(element => {
    window.youtubeSettingsProbe = element.parentElement.parentElement
  })
  try {
    await writeFile(sourcePath, source.replace(anchor, probe))
    await page.locator('[data-youtube-refresh-probe="updated"]').waitFor()
    assert.equal(await platformDialog().getByLabel('Tags', { exact: true }).inputValue(), tagsText, 'Fast Refresh preserves in-progress local tag input')
    assert.equal(await platformDialog().getByRole('switch', { name: 'Allow embedding', exact: true }).getAttribute('aria-checked'), 'false')
    assert.equal(await reviewConsent().getAttribute('aria-checked'), 'false')
    assert.equal(await page.evaluate(() => window.youtubeSettingsProbe === document.querySelector('[data-youtube-refresh-probe]')), true, 'Fast Refresh preserves the advanced-settings DOM')
    await assertDashboardIdentity()
  } finally {
    const current = await readFile(sourcePath, 'utf8')
    if (current.includes(probe)) await writeFile(sourcePath, current.replace(probe, anchor))
  }
  await page.waitForFunction(() => !document.querySelector('[data-youtube-refresh-probe]'))
  console.log('YouTube Fast Refresh preserves local tag text, form settings and dashboard DOM')
}

try {
  await page.goto(`${origin}/dashboard/publish`, { waitUntil: 'networkidle', timeout: 180000 })
  await page.getByRole('button', { name: 'New post', exact: true }).first().waitFor()
  await page.locator('[data-sidebar="trigger"]').first().click()
  await rememberDashboard()
  await openPost(photoId)
  await accountChoice('tiktok').click()
  await page.getByRole('button', { name: 'Platform options', exact: true }).waitFor()
  await openMediaDialog()
  for (const image of photos)
    assert.equal(await mediaDialog().getByRole('button', { name: `Edit ${image.name}`, exact: true }).count(), 1, 'Selecting TikTok preserves uploaded photos')
  await cancelMedia()
  await accountChoice('facebook').click()
  await openMediaDialog()
  const first = await openImage(imageA.name)
  await first.getByRole('radio', { name: '4:5', exact: true }).check()
  await first.getByRole('slider', { name: 'Zoom', exact: true }).press('ArrowRight')
  assert.equal(await first.getByLabel('Alternative text', { exact: true }).count(), 0, 'TikTok omits unsupported alternative text')
  assert.equal(await first.getByLabel('Tag people', { exact: true }).count(), 0, 'TikTok omits Instagram tags')
  await closeImage(first)
  await confirmMedia()
  await openPreferences('tiktok')
  await choose(platformDialog(), 'TikTok cover photo', `2. ${imageB.name}`)
  await platformDialog().getByRole('switch', { name: 'AI-generated content', exact: true }).click()
  await platformDialog().getByRole('switch', { name: 'Add music automatically', exact: true }).click()
  await closePreferences()
  // Reordering happens in the media dialog; the TikTok cover must follow its photo.
  await openMediaDialog()
  await page.getByRole('button', { name: `Drag to reorder ${imageC.name}`, exact: true }).press('Home')
  await confirmMedia()
  await openPreferences('tiktok')
  assert.equal(await platformDialog().getByRole('combobox', { name: 'TikTok cover photo', exact: true }).innerText(), `3. ${imageB.name}`, 'TikTok cover follows its photo when another photo moves')
  await closePreferences()
  const saved = await savePost(photoId)
  assert.deepEqual(saved.platforms, ['tiktok'])
  assert.deepEqual(saved.media.map(item => item.reference), [imageC.reference, imageA.reference, imageB.reference])
  assert.deepEqual(saved.media[1].crop, { aspectRatio: '4:5', x: 0.5, y: 0.5, zoom: 1.01 })
  assert.equal(saved.tiktok.photoCoverIndex, 2)
  assert.equal(saved.tiktok.autoAddMusic, true)
  assert.equal(saved.tiktok.isAigc, true)
  assert.equal(saved.tiktok.videoCoverTimestampMs, undefined)
  assert.equal(saved.facebook, undefined)
  assert.equal(saved.instagram, undefined)
  assert.equal(saved.youtube, undefined)
  await assertDashboardIdentity()
  await openPost(photoId)
  await openPreferences('tiktok')
  assert.equal(await platformDialog().getByRole('combobox', { name: 'TikTok cover photo', exact: true }).innerText(), `3. ${imageB.name}`)
  assert.equal(await platformDialog().getByRole('switch', { name: 'AI-generated content', exact: true }).getAttribute('aria-checked'), 'true')
  assert.equal(await platformDialog().getByRole('switch', { name: 'Add music automatically', exact: true }).getAttribute('aria-checked'), 'true')
  await closePreferences()
  await openMediaDialog()
  const restored = await openImage(imageA.name)
  assert.equal(await restored.getByRole('slider', { name: 'Zoom', exact: true }).getAttribute('aria-valuenow'), '1.01')
  await closeImage(restored)
  await cancelMedia()
  console.log('TikTok selection preserves media; photo crop, cover identity, AI and music survive save/reopen')

  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'Mobile TikTok composer does not overflow horizontally')
  await capture('tiktok-composer-mobile')
  await openMediaDialog()
  await page.getByRole('button', { name: `Remove ${imageB.name}`, exact: true }).click()
  await confirmMedia()
  await openPreferences('tiktok')
  assert.equal(await platformDialog().getByRole('combobox', { name: 'TikTok cover photo', exact: true }).innerText(), `1. ${imageC.name}`, 'Removing the cover falls back to the first photo')
  await closePreferences()
  const removed = await savePost(photoId)
  assert.equal(removed.tiktok.photoCoverIndex, 0)
  assert.deepEqual(removed.media.map(item => item.reference), [imageC.reference, imageA.reference])
  console.log('Mobile TikTok editor has no overflow and removal resets the selected cover safely')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('[data-slot="sidebar"][data-state]').waitFor()
  await page.waitForFunction(() => document.querySelector('header.studio-topbar') !== null)
  await rememberDashboard()
  await openPost(photoId)
  await accountChoice('facebook').click()
  await openMediaDialog()
  const mixedPhoto = await openImage(imageA.name)
  await mixedPhoto.getByLabel('Alternative text', { exact: true }).fill('A camera in the studio.')
  assert.equal(await mixedPhoto.getByLabel('Tag people', { exact: true }).count(), 0)
  await closeImage(mixedPhoto)
  await confirmMedia()
  await openPreferences('facebook')
  await platformDialog().getByLabel('Facebook location', { exact: true }).fill('987654321')
  await closePreferences()
  const mixedPhotos = await savePost(photoId)
  assert.deepEqual([...mixedPhotos.platforms].sort(), ['facebook', 'tiktok'])
  assert.deepEqual(mixedPhotos.facebook, { placeId: '987654321' })
  assert.equal(mixedPhotos.tiktok.photoCoverIndex, 0)
  assert.equal(mixedPhotos.tiktok.isAigc, true)
  assert.equal(mixedPhotos.media[1].altText, 'A camera in the studio.')
  assert.deepEqual(mixedPhotos.media[1].crop, saved.media[1].crop)
  await assertDashboardIdentity()
  console.log('TikTok/Facebook share crop edits and preserve destination-specific options')

  await openPost(videoId)
  await openPreferences('tiktok')
  assert.equal(await platformDialog().getByLabel('Alternative text', { exact: true }).count(), 0)
  assert.equal(await platformDialog().getByRole('combobox', { name: 'TikTok cover photo', exact: true }).count(), 0)
  await platformDialog().getByLabel('TikTok cover frame (seconds)', { exact: true }).fill('2.5')
  await closePreferences()
  const videoSaved = await savePost(videoId)
  assert.equal(videoSaved.tiktok.videoCoverTimestampMs, 2500)
  assert.equal(videoSaved.tiktok.photoCoverIndex, undefined)
  await assertDashboardIdentity()
  await openPost(videoId)
  await openMediaDialog()
  assert.equal(await mediaDialog().getByRole('button', { name: `Edit ${video.name}`, exact: true }).count(), 0, 'Videos have no photo editor')
  await cancelMedia()
  await openPreferences('tiktok')
  assert.equal(await platformDialog().getByLabel('TikTok cover frame (seconds)', { exact: true }).inputValue(), '2.5')
  await closePreferences()
  await accountChoice('youtube').click()
  await assertDashboardIdentity()
  await openMediaDialog()
  assert.equal(await mediaDialog().getByRole('button', { name: `Remove ${video.name}`, exact: true }).count(), 1, 'YouTube selection retains the uploaded video')
  await cancelMedia()
  await openPreferences('youtube')
  await platformDialog().getByLabel('YouTube video title (up to 100 characters)', { exact: true }).fill('Synthetic studio tour')
  await openYouTubeAdvanced()
  await platformDialog().getByLabel('YouTube description (up to 5,000 UTF-8 bytes)', { exact: true }).fill('A synthetic video used only for browser verification.')
  await answerQuestion('Is this video made for kids?', 'No')
  await answerQuestion('Does this video contain realistic altered or synthetic content?', 'No')
  await reviewConsent().click()
  assert.equal(await reviewConsent().getAttribute('aria-checked'), 'true')
  await platformDialog().getByLabel('Tags', { exact: true }).fill('studio tour, camera, Romanian video')
  assert.equal(await reviewConsent().getAttribute('aria-checked'), 'false', 'Tag changes require renewed upload review')
  await choose(platformDialog(), 'License', 'Creative Commons – Attribution')
  await assertDashboardIdentity()
  const embedding = platformDialog().getByRole('switch', { name: 'Allow embedding', exact: true })
  assert.equal(await embedding.getAttribute('aria-checked'), 'true')
  await embedding.click()
  assert.equal(await embedding.getAttribute('aria-checked'), 'false')
  await assertDashboardIdentity()
  await verifyFastRefresh()
  await closePreferences()
  const youtubeSaved = await savePost(videoId)
  assert.deepEqual([...youtubeSaved.platforms].sort(), ['tiktok', 'youtube'])
  assert.deepEqual(youtubeSaved.youtube.tags, ['studio tour', 'camera', 'Romanian video'])
  assert.equal(youtubeSaved.youtube.license, 'creativeCommon')
  assert.equal(youtubeSaved.youtube.embeddable, false)
  assert.equal(youtubeSaved.youtube.termsAccepted, false)
  assert.equal(youtubeSaved.tiktok.videoCoverTimestampMs, 2500)
  assert.equal(youtubeSaved.facebook, undefined)
  assert.equal(youtubeSaved.instagram, undefined)
  await assertDashboardIdentity()
  await openPost(videoId)
  await openPreferences('youtube')
  await openYouTubeAdvanced()
  assert.equal(await platformDialog().getByLabel('Tags', { exact: true }).inputValue(), 'studio tour, camera, Romanian video')
  assert.equal(await platformDialog().getByRole('combobox', { name: 'License', exact: true }).innerText(), 'Creative Commons – Attribution')
  assert.equal(await embedding.getAttribute('aria-checked'), 'false')
  assert.equal(await reviewConsent().getAttribute('aria-checked'), 'false', 'Reopening a draft requires fresh upload review')
  await reviewConsent().click()
  await embedding.click()
  assert.equal(await reviewConsent().getAttribute('aria-checked'), 'false', 'Embedding changes require renewed upload review')
  await embedding.click()
  await assertDashboardIdentity()
  await closePreferences()
  // Capture after route-identity checks: full-page screenshots can resize the
  // browser's layout viewport temporarily and replace responsive UI surfaces.
  await capture('youtube-composer-advanced')
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'Mobile YouTube composer does not overflow horizontally')
  await capture('youtube-composer-mobile')
  const mobileYouTube = await savePost(videoId)
  assert.equal(mobileYouTube.youtube.embeddable, false)
  assert.deepEqual(mobileYouTube.youtube.tags, youtubeSaved.youtube.tags)
  console.log('YouTube tags, license and explicit embedding=false survive save/reopen; settings reset review consent')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('[data-slot="sidebar"][data-state]').waitFor()
  await rememberDashboard()
  await openPost(videoId)
  await openPreferences('youtube')
  await reviewConsent().click()
  assert.equal(await reviewConsent().getAttribute('aria-checked'), 'true')
  await closePreferences()
  // A single-video post cannot be emptied, so replace the video with a new upload first.
  await openMediaDialog()
  await mediaDialog().locator('input[type="file"]').setInputFiles({ name: replacement.name, mimeType: 'video/mp4', buffer: Buffer.from('synthetic video') })
  await mediaDialog().getByRole('button', { name: `Remove ${replacement.name}`, exact: true }).waitFor()
  await mediaDialog().getByRole('button', { name: `Remove ${video.name}`, exact: true }).click()
  await confirmMedia()
  await openPreferences('youtube')
  assert.equal(await reviewConsent().getAttribute('aria-checked'), 'false', 'Media changes require renewed YouTube upload review')
  await closePreferences()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'New post', exact: true }).first().waitFor()
  await openPost(videoId)
  await accountChoice('youtube').click()
  await openPreferences('tiktok')
  assert.equal(await platformDialog().getByRole('tab', { name: 'YouTube', exact: true }).count(), 0, 'Deselected YouTube options are hidden')
  await closePreferences()
  const tiktokOnly = await savePost(videoId)
  assert.deepEqual(tiktokOnly.platforms, ['tiktok'])
  assert.equal(tiktokOnly.youtube, undefined, 'Deselected YouTube options are omitted')
  assert.equal(tiktokOnly.tiktok.videoCoverTimestampMs, 2500)
  await assertDashboardIdentity()
  assert.deepEqual(errors, [], 'No browser runtime errors')
  console.log('TikTok/YouTube composer browser checks passed (mocked APIs only)')
} catch (error) {
  await capture('tiktok-youtube-composer-failure').catch(() => {})
  throw error
} finally {
  await browser.close()
}
