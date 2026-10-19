import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Run against Vite with an installed Playwright entry point. Every account, post,
// preview and API response is synthetic; this harness never contacts a provider.
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
  id: '00000000-0000-4000-8000-000000000021',
  email: 'facebook-composer@example.invalid', name: 'Facebook Composer Test',
  plan: 'pro', credits: 100, access_role: 'member'
}
const facebookAccount = {
  id: '00000000-0000-4000-8000-000000000022', provider: 'facebook',
  name: 'Synthetic Facebook Page', username: 'synthetic_facebook', status: 'connected',
  scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
}
const instagramAccount = {
  id: '00000000-0000-4000-8000-000000000023', provider: 'instagram',
  name: 'Synthetic Instagram', username: 'synthetic_instagram', status: 'connected',
  scopes: ['instagram_business_basic', 'instagram_business_content_publish']
}
const today = new Date()
today.setUTCHours(12, 0, 0, 0)
const imageA = { type: 'image', reference: `publishing/${user.id}/camera.png`, name: 'camera.png' }
const imageB = { type: 'image', reference: `publishing/${user.id}/microphone.png`, name: 'microphone.png' }
const postBase = {
  caption: 'Synthetic draft for browser verification', notes: null,
  platforms: ['facebook'], accountIds: [facebookAccount.id], status: 'draft',
  publishingDestinations: [], scheduledAt: today.toISOString(),
  createdAt: today.toISOString(), updatedAt: today.toISOString(), clip: null,
  facebook: {}
}
const photoId = '00000000-0000-4000-8000-000000000024'
const reelId = '00000000-0000-4000-8000-000000000025'
const posts = new Map([
  [photoId, { ...postBase, id: photoId, title: 'Synthetic Facebook photos', media: [imageA, imageB] }],
  [reelId, { ...postBase, id: reelId, title: 'Synthetic Facebook Reel', media: [
    { type: 'video', reference: `publishing/${user.id}/reel.mp4`, name: 'reel.mp4' }
  ] }]
])
const preview = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#ddd"/><rect x="150" y="100" width="300" height="400" fill="#333"/></svg>').toString('base64')}`

await page.route('**/v1/**', route => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
await page.route('**/api/**', async route => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  if (path === '/api/publishing') return route.fulfill({ json: {
    providers: ['facebook', 'instagram'].map(id => ({
      id, name: id === 'facebook' ? 'Facebook' : 'Instagram',
      configured: true, supportsPublishing: true
    })),
    accounts: [facebookAccount, instagramAccount], clips: [], posts: []
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
  if (path === '/api/publishing/media/preview')
    return route.fulfill({ json: { url: preview } })
  if (path === '/api/user/profile') return route.fulfill({ json: { profile: {
    ...user, image: null, provider: 'password', canChangePassword: true,
    recentlyAuthenticated: true, emailVerified: today.toISOString(), createdAt: today.toISOString()
  } } })
  if (path === '/api/workspace-agent/runs')
    return route.fulfill({ json: { runs: [], has_more: false } })
  if (path === '/api/workspace-agent/suggestions')
    return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  assert.equal(request.method(), 'GET', `Unexpected mutation: ${request.method()} ${path}`)
  return route.fulfill({ json: {} })
})

const imageRow = name => page.locator('li').filter({
  has: page.getByRole('button', { name: `Edit ${name}`, exact: true })
})

async function openPost(id) {
  const title = posts.get(id).title
  const open = page.getByRole('button', { name: `Open post ${title}`, exact: true })
  const edit = page.getByRole('button', { name: `Edit ${title}`, exact: true })
  await open.or(edit).first().click()
  await page.getByLabel('Post title', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Post title', { exact: true }).inputValue(), title)
}

async function openImage(name) {
  const button = page.getByRole('button', { name: `Edit ${name}`, exact: true })
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click()
  await imageRow(name).getByLabel('Alternative text', { exact: true }).waitFor()
  return imageRow(name)
}

async function openPreferences(provider) {
  const button = page.getByRole('button', { name: new RegExp(`${provider} Preferences`) })
  if (await button.getAttribute('aria-expanded') !== 'true') await button.click()
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

async function moveSlider(scope, label, key, count) {
  const slider = scope.getByRole('slider', { name: label, exact: true })
  for (let index = 0; index < count; index++) await slider.press(key)
  return Number(await slider.getAttribute('aria-valuenow'))
}

async function savePost(id) {
  const response = page.waitForResponse(value =>
    value.request().method() === 'PATCH' && new URL(value.url()).pathname === `/api/calendar/${id}`)
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  assert.equal((await response).status(), 200)
  await page.getByRole('button', { name: 'New post', exact: true }).waitFor()
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
    window.facebookDashboardProbe = {
      main: document.querySelector('main'),
      sidebar: document.querySelector('[data-slot="sidebar"]'),
      header: document.querySelector('header.studio-topbar'),
      sidebarState: document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')
    }
  })
}

async function assertDashboardIdentity() {
  assert.deepEqual(await page.evaluate(() => {
    const probe = window.facebookDashboardProbe
    return {
      main: !!probe?.main && probe.main === document.querySelector('main'),
      sidebar: !!probe?.sidebar && probe.sidebar === document.querySelector('[data-slot="sidebar"]'),
      header: !!probe?.header && probe.header === document.querySelector('header.studio-topbar'),
      sidebarState: !!probe?.sidebar && probe.sidebarState === document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')
    }
  }), { main: true, sidebar: true, header: true, sidebarState: true }, 'Composer navigation preserves dashboard DOM and sidebar state')
}

function assertFacebookFields(payload, expected) {
  assert.deepEqual(payload.facebook, expected, 'Facebook options contain only its supported settings')
  assert.equal(payload.facebook.coverReference, undefined)
  assert.equal(payload.facebook.collaborators, undefined)
  assert.equal(payload.facebook.audioName, undefined)
  assert.equal(payload.facebook.trialReel, undefined)
}

async function verifyFastRefresh() {
  if (process.env.RUN_FAST_REFRESH !== '1') {
    console.log('SKIPPED Fast Refresh source mutation; set RUN_FAST_REFRESH=1 after UI edits finish')
    return
  }
  const sourcePath = new URL('../src/components/calendar/post-settings-section.tsx', import.meta.url)
  const anchor = 'aria-labelledby={`${idPrefix}-title`}'
  const probe = `${anchor} data-facebook-refresh-probe="updated"`
  const source = await readFile(sourcePath, 'utf8')
  assert.equal(source.split(anchor).length, 2, 'Settings section refresh anchor is unique')
  await page.evaluate(() => {
    window.facebookSectionProbe = [...document.querySelectorAll('section')].find(section =>
      section.querySelector('h3')?.textContent === 'Facebook Preferences')
  })
  try {
    await writeFile(sourcePath, source.replace(anchor, probe))
    await page.locator('[data-facebook-refresh-probe="updated"]').waitFor()
    assert.equal(await page.getByRole('button', { name: /Facebook Preferences/ }).getAttribute('aria-expanded'), 'true', 'Fast Refresh preserves settings expansion state')
    assert.equal(await page.getByLabel('Facebook location', { exact: true }).inputValue(), '123456789')
    assert.equal(await imageRow(imageA.name).getByLabel('Alternative text', { exact: true }).inputValue(), 'A studio camera beside a window.')
    assert.equal(await page.evaluate(() => window.facebookSectionProbe === document.querySelector('[data-facebook-refresh-probe]')), true, 'Fast Refresh preserves the settings section DOM')
    await assertDashboardIdentity()
  } finally {
    const current = await readFile(sourcePath, 'utf8')
    if (current.includes(probe)) await writeFile(sourcePath, current.replace(probe, anchor))
  }
  await page.waitForFunction(() => document.querySelectorAll('[data-facebook-refresh-probe]').length === 0)
  console.log('Settings section Fast Refresh preserves expansion, form values and dashboard DOM')
}

try {
  await page.goto(`${origin}/dashboard/publish`, { waitUntil: 'networkidle', timeout: 180000 })
  await page.getByRole('button', { name: 'New post', exact: true }).waitFor()
  await page.locator('[data-sidebar="trigger"]').first().click()
  await rememberDashboard()
  await openPost(photoId)
  await assertDashboardIdentity()
  await choose('Photo format', 'Portrait (4:5)')
  const first = await openImage(imageA.name)
  await first.getByLabel('Alternative text', { exact: true }).fill('A studio camera beside a window.')
  const cropX = await moveSlider(first, 'Horizontal position', 'ArrowRight', 7)
  const cropY = await moveSlider(first, 'Vertical position', 'ArrowLeft', 9)
  const cropZoom = await moveSlider(first, 'Zoom', 'ArrowRight', 15)
  assert.equal(await first.getByLabel('Tag people', { exact: true }).count(), 0, 'Facebook photos omit Instagram username tags')
  const second = await openImage(imageB.name)
  await second.getByLabel('Alternative text', { exact: true }).fill('A microphone on a wooden desk.')
  await page.getByRole('button', { name: `Drag to reorder ${imageB.name}`, exact: true }).press('ArrowUp')
  await openPreferences('Facebook')
  await page.getByLabel('Facebook location', { exact: true }).fill('123456789')
  assert.equal(await page.getByLabel('Facebook Reel title', { exact: true }).count(), 0, 'Photo posts omit Reel-only controls')
  assert.equal(await page.getByRole('switch', { name: 'AI-generated Facebook Reel', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: /Instagram Preferences/ }).count(), 0)
  await verifyFastRefresh()

  const saved = await savePost(photoId)
  assert.deepEqual(saved.platforms, ['facebook'])
  assert.equal(saved.instagram, undefined)
  assert.deepEqual(saved.media.map(item => item.reference), [imageB.reference, imageA.reference])
  assert.equal(saved.media[0].altText, 'A microphone on a wooden desk.')
  assert.equal(saved.media[1].altText, 'A studio camera beside a window.')
  assert.deepEqual(saved.media[1].crop, { aspectRatio: '4:5', x: cropX / 100, y: cropY / 100, zoom: cropZoom })
  assert.ok(saved.media.every(item => !item.userTags?.length))
  assertFacebookFields(saved, { placeId: '123456789' })
  await assertDashboardIdentity()
  await openPost(photoId)
  const restored = await openImage(imageA.name)
  assert.equal(await restored.getByLabel('Alternative text', { exact: true }).inputValue(), saved.media[1].altText)
  assert.equal(Number(await restored.getByRole('slider', { name: 'Zoom', exact: true }).getAttribute('aria-valuenow')), cropZoom)
  await openPreferences('Facebook')
  assert.equal(await page.getByLabel('Facebook location', { exact: true }).inputValue(), '123456789')
  console.log('Facebook photo crop, alt text, order and location survive save and reopen')

  await page.setViewportSize({ width: 390, height: 844 })
  await restored.getByLabel('Alternative text', { exact: true }).fill('Mobile edit: a camera beside a window.')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'Mobile composer does not overflow horizontally')
  await capture('facebook-composer-mobile')
  const mobileSaved = await savePost(photoId)
  assert.equal(mobileSaved.media[1].altText, 'Mobile edit: a camera beside a window.')
  console.log('Mobile Facebook composer saves per-image edits without overflow')

  await page.setViewportSize({ width: 1440, height: 1000 })
  // The responsive drawer replaces the desktop sidebar during a viewport change.
  // Compare subsequent route transitions against the newly mounted desktop shell.
  await page.locator('[data-slot="sidebar"][data-state]').waitFor()
  await page.waitForFunction(() => document.querySelector('header.studio-topbar') !== null)
  await rememberDashboard()
  await openPost(reelId)
  await openPreferences('Facebook')
  assert.equal(await page.getByLabel('Alternative text', { exact: true }).count(), 0)
  assert.equal(await page.getByLabel('Original audio name', { exact: true }).count(), 0)
  assert.equal(await page.getByLabel('Cover frame (seconds)', { exact: true }).count(), 0)
  assert.equal(await page.getByLabel('Reel cover', { exact: true }).count(), 0)
  assert.equal(await page.getByRole('combobox', { name: 'Trial Reel', exact: true }).count(), 0)
  await page.getByLabel('Facebook Reel title', { exact: true }).fill('A day in the synthetic studio')
  await page.getByLabel('Facebook location', { exact: true }).fill('987654321')
  await page.getByRole('switch', { name: 'AI-generated Facebook Reel', exact: true }).click()
  const expectedReel = { placeId: '987654321', reelTitle: 'A day in the synthetic studio', isAiGenerated: true }
  const reelSaved = await savePost(reelId)
  assertFacebookFields(reelSaved, expectedReel)
  assert.equal(reelSaved.instagram, undefined)
  await openPost(reelId)
  await openPreferences('Facebook')
  assert.equal(await page.getByLabel('Facebook Reel title', { exact: true }).inputValue(), expectedReel.reelTitle)
  assert.equal(await page.getByLabel('Facebook location', { exact: true }).inputValue(), expectedReel.placeId)
  assert.equal(await page.getByRole('switch', { name: 'AI-generated Facebook Reel', exact: true }).getAttribute('aria-checked'), 'true')
  await assertDashboardIdentity()
  await capture('facebook-composer-reel')
  // Full-page screenshots can temporarily resize the layout viewport. Record
  // the resulting desktop shell before checking subsequent user navigation.
  await rememberDashboard()
  await savePost(reelId)
  await assertDashboardIdentity()
  console.log('Facebook Reel title, location and AI disclosure survive save and reopen')

  await openPost(photoId)
  const instagramChoice = page.getByRole('button', { name: /@synthetic_instagram Instagram/ })
  assert.equal(await instagramChoice.getAttribute('aria-pressed'), 'false')
  await instagramChoice.click()
  const mixedImage = await openImage(imageA.name)
  assert.equal(await mixedImage.getByLabel('Alternative text', { exact: true }).inputValue(), 'Mobile edit: a camera beside a window.')
  await mixedImage.getByLabel('Tag people', { exact: true }).fill('@synthetic_artist')
  await mixedImage.getByRole('button', { name: 'Add', exact: true }).click()
  await openPreferences('Instagram')
  await page.getByLabel('Collaborators', { exact: true }).fill('synthetic_artist')
  await page.getByLabel('Location', { exact: true }).fill('222222222')
  await openPreferences('Facebook')
  assert.equal(await page.getByLabel('Facebook location', { exact: true }).inputValue(), '123456789')
  const mixedSaved = await savePost(photoId)
  assert.deepEqual([...mixedSaved.platforms].sort(), ['facebook', 'instagram'])
  assertFacebookFields(mixedSaved, { placeId: '123456789' })
  assert.equal(mixedSaved.instagram.locationId, '222222222')
  assert.deepEqual(mixedSaved.instagram.collaborators, ['synthetic_artist'])
  assert.deepEqual(mixedSaved.media[1].userTags, [{ username: 'synthetic_artist', x: 0.5, y: 0.5 }])
  assert.deepEqual(mixedSaved.media[1].crop, saved.media[1].crop)
  await openPost(photoId)
  await instagramChoice.click()
  await openImage(imageA.name)
  assert.equal(await page.getByLabel('Tag people', { exact: true }).count(), 0)
  const facebookOnly = await savePost(photoId)
  assert.deepEqual(facebookOnly.platforms, ['facebook'])
  assert.equal(facebookOnly.instagram, undefined, 'Deselected Instagram options are omitted from the outgoing draft')
  assertFacebookFields(facebookOnly, { placeId: '123456789' })
  await assertDashboardIdentity()
  console.log('Mixed Instagram/Facebook selection shares photo edits and isolates destination options')
  assert.deepEqual(errors, [], 'No browser runtime errors')
  console.log('Facebook composer browser checks passed (mocked APIs only)')
} catch (error) {
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true })
  await page.screenshot({
    path: fileURLToPath(new URL('../test-results/facebook-composer-failure.png', import.meta.url)),
    fullPage: true
  }).catch(() => {})
  throw error
} finally {
  await browser.close()
}
