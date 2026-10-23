import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Run Vite separately. All identities, media and responses are synthetic. The
// only accepted writes are mocked draft saves and mocked image uploads.
if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
const output = new URL('../test-results/post-composer-layout/', import.meta.url)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width: 1488, height: 1058 }, timezoneId: 'Europe/Bucharest',
  colorScheme: 'dark', reducedMotion: 'reduce'
})
const page = await context.newPage()
page.setDefaultTimeout(30000)
const errors = []
const writes = []
const blockedMutations = []
const uploads = []
const clipRequests = []
const creatorRequests = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text())
})

const user = {
  id: '00000000-0000-4000-8000-000000000091',
  email: 'post-composer-layout@example.invalid', name: 'Design Workspace',
  plan: 'pro', credits: 100, access_role: 'member'
}
const providerNames = {
  instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube'
}
const accounts = Object.entries(providerNames).map(([provider, name], index) => ({
  id: `00000000-0000-4000-8000-0000000001${index}0`, provider,
  name: `Synthetic ${name}`, username: 'sneepcutstudio', status: 'connected',
  scopes: ['video_publish', 'video.publish', 'instagram_business_content_publish']
}))
const account = provider => accounts.find(item => item.provider === provider)
const clipId = index => `00000000-0000-4000-8000-0000000002${index}0`
const titles = [
  'A new perspective', 'Behind the scenes', 'Made for your next story',
  'Street details', 'Morning routine', 'Small moments', 'Studio light', 'Another story'
]
const thumbnail = index => `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#f7ba72"/><stop offset="1" stop-color="#876e6a"/></linearGradient></defs><rect width="360" height="640" fill="#282320"/><path d="M25 75 335 130V500H25Z" fill="url(#sky)"/><circle cx="${250 - index * 8}" cy="300" r="45" fill="#ffe1a1"/><path d="M25 75v425M125 93v407M230 112v388M335 130v370" stroke="#292b29" stroke-width="10"/><path d="M0 500h360v140H0" fill="#5a432d"/><path d="M55 465H310M85 465v135M285 465v135" stroke="#2b251f" stroke-width="12"/><rect x="142" y="410" width="76" height="49" rx="4" fill="#9a8b7c"/><path d="M30 480v-80q-40-40-23-53 27 5 23 59 38-73 51-44-6 22-50 63" fill="#3d5130"/><path d="M10 476h43l-7 40H17Z" fill="#77715d"/></svg>`
).toString('base64')}`
const videoUrl = `${origin}/__post-composer-fixture__/preview.mp4`
// Two-second silent synthetic H.264 media, shared with the publishing runner.
const video = Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANzbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAp50cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAFoAAACgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAIWbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAUABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABwW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAYFzdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAFoAoABIAAAASAAAAAAAAAABFExhdmM2My4xLjEwMiBsaWJ4MjY0AAAAAAAAAAAAAAAAGP//AAAAL2F2Y0MBQsAK/+EAGGdCwAraGFeTwEQAAAMABAAAAwBQPEiagAEABGjOD8gAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAD8AAAAAAAAAAYc3R0cwAAAAAAAAABAAAAFAAABAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAFAAAAAEAAABkc3RzegAAAAAAAAAAAAAAFAAAAD4AAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAAFHN0Y28AAAAAAAAAAQAAA6MAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYzLjEuMTAyAAAACGZyZWUAAAEEbWRhdAAAADpliIQ6EYoAAi7xwY+Tk5OTk6666666666666666666666666666666666666666666666666666668AAAABkGaID6B7AAAAAZBmkA+gewAAAAGQZpgPoHsAAAABkGagBCgewAAAAZBmqAQoHsAAAAGQZrAEKB7AAAABkGa4BCgewAAAAZBmwAQoHsAAAAGQZsgEKB7AAAABkGbQBCgewAAAAZBm2AQoHsAAAAGQZuAEKB7AAAABkGboBCgewAAAAZBm8AQoHsAAAAGQZvgEKB7AAAABkGaABCgewAAAAZBmiAQoHsAAAAGQZpAEKB7AAAABkGaYBCgew==', 'base64')
const clips = titles.map((title, index) => ({
  id: clipId(index), title, duration: [28, 35, 42, 21, 32, 18, 25, 30][index],
  viralScore: 8, tiktokEligible: true, thumbnailUrl: thumbnail(index),
  fileUrl: `${origin}/__post-composer-fixture__/original.mp4`,
  captionInstagram: 'A different perspective. Inside our creative studio.',
  captionTiktok: 'A different perspective. Inside our creative studio.', captionYoutube: null
}))
const uploadReference = `publishing/${user.id}/synthetic-upload.png`
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDKsAAAAASUVORK5CYII=', 'base64')
const existingId = '00000000-0000-4000-8000-000000000301'
const existingCaption = 'A saved synthetic story, ready to edit.'
const planned = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
const posts = new Map([[existingId, {
  id: existingId, title: titles[0], caption: existingCaption, notes: null,
  platforms: ['instagram'], accountIds: [account('instagram').id],
  status: 'draft', scheduledAt: planned, createdAt: planned, updatedAt: planned,
  clip: clips[0], media: [], publishingDestinations: [],
  instagram: { commentEnabled: true, shareToFeed: true, locationId: '123456789' }
}]])
let createdId = null

await context.route('**/v1/**', route => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
await context.route('**/__post-composer-fixture__/preview.mp4', route => route.fulfill({ contentType: 'video/mp4', body: video }))
await context.route('**/api/**', async route => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.pathname === '/api/publishing' && request.method() === 'GET')
    return route.fulfill({ json: {
      providers: Object.entries(providerNames).map(([id, name]) => ({ id, name, configured: true, supportsPublishing: true })),
      accounts, clips, posts: []
    } })
  if (url.pathname === '/api/calendar' && request.method() === 'GET')
    return route.fulfill({ json: { posts: [...posts.values()], clips } })
  if ((url.pathname === '/api/calendar' && request.method() === 'POST') ||
      (url.pathname.startsWith('/api/calendar/') && request.method() === 'PATCH')) {
    const body = request.postDataJSON()
    if (body.status !== 'draft') {
      blockedMutations.push(`${request.method()} ${url.pathname} (${body.status})`)
      return route.fulfill({ status: 405, json: { error: 'Only synthetic draft saves are allowed' } })
    }
    const id = request.method() === 'POST'
      ? `00000000-0000-4000-8000-0000000004${writes.length}0`
      : url.pathname.split('/').at(-1)
    if (request.method() === 'PATCH') assert.ok(posts.has(id), 'Only a synthetic post may be updated')
    else createdId = id
    const post = {
      ...posts.get(id), ...body, id,
      clip: clips.find(item => item.id === body.clipId) ?? null,
      media: body.media ?? [], publishingDestinations: [], createdAt: planned, updatedAt: planned
    }
    writes.push({ id, method: request.method(), body })
    posts.set(id, post)
    return route.fulfill({ json: { post } })
  }
  if (url.pathname === '/api/publishing/media' && request.method() === 'POST') {
    uploads.push(request.postDataBuffer())
    return route.fulfill({ json: { type: 'image', reference: uploadReference, name: 'synthetic-upload.png' } })
  }
  if (request.method() !== 'GET') {
    blockedMutations.push(`${request.method()} ${url.pathname}`)
    return route.fulfill({ status: 405, json: { error: 'Unexpected API writes are blocked' } })
  }
  const clip = clips.find(item => url.pathname === `/api/clips/${item.id}`)
  if (clip) {
    clipRequests.push(clip.id)
    return route.fulfill({ json: { id: clip.id, preview_url: videoUrl, file_url: clip.fileUrl, thumbnail_url: clip.thumbnailUrl } })
  }
  if (url.pathname === `/api/publishing/accounts/${account('tiktok').id}/options`) {
    creatorRequests.push(account('tiktok').id)
    return route.fulfill({ json: {
      privacyLevels: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
      commentDisabled: false, duetDisabled: false, stitchDisabled: false,
      maxDuration: 600, nickname: 'Synthetic TikTok'
    } })
  }
  if (url.pathname === '/api/publishing/media/preview')
    return route.fulfill({ json: { url: thumbnail(0) } })
  if (url.pathname === '/api/user/profile') return route.fulfill({ json: { profile: {
    ...user, image: null, provider: 'password', canChangePassword: true,
    recentlyAuthenticated: true, emailVerified: planned, createdAt: planned
  } } })
  if (url.pathname === '/api/workspace-agent/runs') return route.fulfill({ json: { runs: [], has_more: false } })
  if (url.pathname === '/api/workspace-agent/suggestions') return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  return route.fulfill({ json: {} })
})

const root = page.locator('[data-post-composer]')
const preview = page.locator('[data-composer-preview]')
const caption = page.getByLabel('Post text', { exact: true })
const mediaDialog = page.getByRole('dialog', { name: 'Change media', exact: true })
const optionsDialog = page.getByRole('dialog', { name: 'Platform options', exact: true })
const modeTab = name => root.getByRole('tab', { name, exact: true })
const accountTile = provider => root.locator(`[data-composer-account="${account(provider).id}"]`)
const clipButton = index => mediaDialog.getByRole('button').filter({ hasText: titles[index] })

async function rememberShell() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => {
    window.composerShellProbe = {
      main: document.querySelector('main'), sidebar: document.querySelector('[data-slot="sidebar"]'),
      header: document.querySelector('header.studio-topbar'),
      sidebarState: document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')
    }
  })
}

async function assertShell() {
  assert.equal(await page.evaluate(() => {
    const probe = window.composerShellProbe
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    return !!probe?.main && !!probe.header && probe.main === document.querySelector('main') &&
      probe.header === document.querySelector('header.studio-topbar') && probe.sidebar === sidebar &&
      probe.sidebarState === sidebar?.getAttribute('data-state')
  }), true, 'Composer routes and dialogs preserve dashboard DOM and sidebar state')
}

async function noOverflow(label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true,
    `${label}: no horizontal page overflow`)
}

async function capture(name, options = {}) {
  await mkdir(output, { recursive: true })
  await page.evaluate(resetScroll => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    if (resetScroll) window.scrollTo(0, 0)
  }, options.scrollTop !== false)
  await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode().catch(() => {}))))
  await preview.locator('video').evaluateAll(videos => {
    for (const video of videos) {
      if (video.getBoundingClientRect().width > 0 && video.readyState < 2) {
        video.preload = 'auto'
        video.load()
      }
    }
  })
  await page.waitForFunction(() => [...document.querySelectorAll('[data-composer-preview] video')]
    .filter(video => video.getBoundingClientRect().width > 0)
    .every(video => video.readyState >= 2))
  await page.waitForLoadState('networkidle')
  const mobileDialog = page.viewportSize().width < 768 &&
    (await mediaDialog.isVisible() || await optionsDialog.isVisible())
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: options.fullPage ?? !mobileDialog })
}

async function openMedia() {
  await root.getByRole('button', { name: 'Change media', exact: true }).click()
  await mediaDialog.waitFor()
}

async function openOptions() {
  await root.getByRole('button', { name: 'Platform options', exact: true }).click()
  await optionsDialog.waitFor()
}

async function assertOpenerFocus(label) {
  await page.waitForFunction(name => [...document.querySelectorAll('[data-post-composer] button')]
    .some(button => button.textContent.trim() === name && document.activeElement === button), label)
}

async function assertDraftState(text) {
  assert.equal(await caption.inputValue(), text, 'Unsaved public post text survives dialogs')
  assert.equal(await accountTile('instagram').getAttribute('aria-pressed'), 'true')
  assert.equal(await accountTile('tiktok').getAttribute('aria-pressed'), 'true')
  await assertShell()
}

async function saveDraft(method) {
  const response = page.waitForResponse(response => new URL(response.url()).pathname.startsWith('/api/calendar') && response.request().method() === method)
  await root.getByRole('button', { name: 'Save draft', exact: true }).click()
  assert.equal((await response).status(), 200)
  await page.getByRole('button', { name: 'New post', exact: true }).first().waitFor()
  await assertShell()
  const dismissToast = page.locator('div.animate-toast-in').getByRole('button', { name: 'Close', exact: true })
  while (await dismissToast.count()) await dismissToast.last().click()
  return writes.at(-1).body
}

async function verifyFastRefresh(text) {
  if (process.env.RUN_FAST_REFRESH !== '1') {
    console.log('SKIPPED Fast Refresh source probe; set RUN_FAST_REFRESH=1 after concurrent source edits stop')
    return
  }
  const sourcePath = new URL('../src/components/calendar/post-composer.tsx', import.meta.url)
  const anchor = 'data-post-composer="" data-publishing-workspace=""'
  const probe = `${anchor} data-composer-refresh-probe="updated"`
  const source = await readFile(sourcePath, 'utf8')
  assert.equal(source.split(anchor).length, 2, 'Composer refresh probe anchor is unique')
  await openOptions()
  try {
    await writeFile(sourcePath, source.replace(anchor, probe))
    await page.locator('[data-composer-refresh-probe="updated"]').waitFor()
    assert.equal(await optionsDialog.isVisible(), true, 'Fast Refresh preserves the component-local open drawer state')
    assert.equal(await optionsDialog.getByLabel('Location', { exact: true }).inputValue(), '123456789')
    await assertDraftState(text)
  } finally {
    const current = await readFile(sourcePath, 'utf8')
    if (current.includes(probe)) await writeFile(sourcePath, current.replace(probe, anchor))
  }
  await page.waitForFunction(() => !document.querySelector('[data-composer-refresh-probe]'))
  await optionsDialog.getByRole('button', { name: 'Done', exact: true }).click()
  await optionsDialog.waitFor({ state: 'hidden' })
  await assertDraftState(text)
  console.log('Composer Fast Refresh preserves drawer state, unsaved caption, destinations, options and dashboard DOM')
}

async function assertFullscreenDialog(dialog, label) {
  const bounds = await dialog.boundingBox()
  assert.ok(bounds && bounds.x <= 1 && bounds.width >= 388, `${label} fills the mobile viewport width`)
  assert.ok(bounds.y <= 80 && bounds.height >= 700, `${label} uses a focused mobile view`)
  await noOverflow(label)
}

try {
  await page.goto(`${origin}/dashboard/publish`, { waitUntil: 'networkidle', timeout: 180000 })
  await page.getByRole('button', { name: 'New post', exact: true }).first().waitFor()
  await page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click()
  await rememberShell()
  await page.getByRole('button', { name: 'New post', exact: true }).first().click()
  await root.waitFor()
  assert.equal(await page.getByLabel('Post title', { exact: true }).isVisible(), false, 'Minimal composer initially shows one public text editor')
  await assertShell()
  // The first route proves the collapsed sidebar is retained. Expand it again
  // for captures matching the approved desktop reference, then keep that state.
  await page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click()
  await rememberShell()
  const text = 'A different perspective. Inside our creative studio. Unsaved test copy.'
  await caption.fill(text)
  await accountTile('tiktok').click()
  await assertDraftState(text)
  await modeTab('Schedule').click()
  await root.getByRole('button', { name: 'Schedule post', exact: true }).click()
  assert.equal(writes.length, 0, 'Scheduling without media does not issue a mutation')
  await root.getByText(/Add photos or videos|choose a linked clip|TikTok.*clip/i).first().waitFor()

  await openMedia()
  await mediaDialog.getByRole('tab', { name: 'My clips', exact: true }).click()
  await mediaDialog.getByRole('searchbox', { name: 'Search clips', exact: true }).fill('Street details')
  await clipButton(3).waitFor()
  assert.equal(await clipButton(0).count(), 0, 'Clip search filters results')
  await mediaDialog.getByRole('searchbox', { name: 'Search clips', exact: true }).fill('')
  await mediaDialog.getByRole('button', { name: 'Next clips page', exact: true }).click()
  await clipButton(6).waitFor()
  await clipButton(6).click()
  await mediaDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await mediaDialog.waitFor({ state: 'hidden' })
  await assertOpenerFocus('Change media')
  assert.equal(await preview.locator('video').count(), 0, 'Cancel discards the pending clip choice')
  await assertDraftState(text)
  await openMedia()
  await mediaDialog.getByRole('tab', { name: 'My clips', exact: true }).click()
  const previousPage = mediaDialog.getByRole('button', { name: 'Previous clips page', exact: true })
  if (await previousPage.isEnabled()) await previousPage.click()
  await clipButton(0).click()
  await capture('desktop-change-media-clips')
  await mediaDialog.getByRole('button', { name: 'Use clip', exact: true }).click()
  await mediaDialog.waitFor({ state: 'hidden' })
  await assertOpenerFocus('Change media')
  await preview.locator('video').first().waitFor()
  assert.equal(await preview.locator('video').first().getAttribute('src'), videoUrl)
  assert.ok(clipRequests.includes(clipId(0)), 'Composer resolves the direct clip preview URL')
  const player = preview.locator('video').first()
  await player.evaluate(element => { element.preload = 'auto'; element.load() })
  await page.waitForFunction(() => document.querySelector('[data-composer-preview] video')?.readyState >= 2)
  await player.evaluate(async element => { element.muted = true; await element.play() })
  await page.waitForFunction(() => document.querySelector('[data-composer-preview] video')?.currentTime > 0)
  await player.evaluate(element => { element.pause(); element.load() })
  await page.waitForFunction(() => document.querySelector('[data-composer-preview] video')?.readyState >= 2)
  assert.equal(await player.evaluate(element => element.controls), true, 'Preview has working native video controls')
  await assertDraftState(text)

  await openOptions()
  await optionsDialog.getByRole('tab', { name: 'Instagram', exact: true }).click()
  const location = optionsDialog.getByLabel(/Location( ID)?(?: \(optional\))?$/, { exact: false })
  await location.fill('555666777')
  await optionsDialog.getByRole('switch', { name: /AI-generated/i }).click()
  await optionsDialog.getByRole('switch', { name: /^Share to feed$/i }).click()
  await optionsDialog.getByRole('button', { name: 'Cancel', exact: true }).last().click()
  await optionsDialog.waitFor({ state: 'hidden' })
  await assertOpenerFocus('Platform options')
  await openOptions()
  await optionsDialog.getByRole('tab', { name: 'Instagram', exact: true }).click()
  assert.equal(await location.inputValue(), '', 'Cancel restores the Instagram options snapshot')
  assert.equal(await optionsDialog.getByRole('switch', { name: /AI-generated/i }).getAttribute('aria-checked'), 'false')
  assert.equal(await optionsDialog.getByRole('switch', { name: /^Share to feed$/i }).getAttribute('aria-checked'), 'true')
  await location.fill('123456789')
  await optionsDialog.getByRole('switch', { name: /AI-generated/i }).click()
  await capture('desktop-platform-options')
  await optionsDialog.getByRole('tab', { name: 'TikTok', exact: true }).click()
  const tikTokSection = optionsDialog.getByRole('button', { name: /TikTok (?:options|settings|preferences)/i })
  if (await tikTokSection.count() && await tikTokSection.getAttribute('aria-expanded') !== 'true') await tikTokSection.click()
  await optionsDialog.getByText(/Who can view this post|Privacy|Audience/i).first().waitFor()
  assert.ok(creatorRequests.length > 0, 'Selected TikTok account loads creator capabilities')
  await optionsDialog.getByRole('button', { name: 'Only me', exact: true }).click()
  await optionsDialog.getByRole('button', { name: 'Done', exact: true }).click()
  await verifyFastRefresh(text)
  await optionsDialog.waitFor({ state: 'hidden' })
  await assertDraftState(text)
  await openOptions()
  await optionsDialog.getByRole('tab', { name: 'Instagram', exact: true }).click()
  assert.equal(await location.inputValue(), '123456789', 'Done retains Instagram options')
  assert.equal(await optionsDialog.getByRole('switch', { name: /AI-generated/i }).getAttribute('aria-checked'), 'true')
  await optionsDialog.getByRole('button', { name: 'Done', exact: true }).click()

  await modeTab('Draft').click()
  assert.equal(await modeTab('Draft').getAttribute('aria-selected'), 'true')
  await modeTab('Publish now').click()
  assert.equal(await modeTab('Publish now').getAttribute('aria-selected'), 'true')
  assert.equal(writes.length, 0, 'Choosing a mode never publishes automatically')
  await modeTab('Schedule').click()
  await noOverflow('Desktop composer')
  await capture('desktop-new-post')
  await root.getByRole('button', { name: 'Schedule post', exact: true }).click()
  await root.getByText('Load and complete the required TikTok audience and policy settings.', { exact: true }).waitFor()
  assert.equal(writes.length, 0, 'Scheduling preserves required provider validation')
  const saved = await saveDraft('POST')
  assert.equal(saved.status, 'draft')
  assert.equal(saved.caption, text)
  assert.equal(saved.clipId, clipId(0))
  assert.ok(saved.title && saved.title.length <= 120, 'Internal title is derived without a second public field')
  assert.deepEqual([...saved.accountIds].sort(), [account('instagram').id, account('tiktok').id].sort())
  assert.equal(saved.instagram.locationId, '123456789')
  assert.equal(saved.instagram.isAiGenerated, true)
  assert.equal(saved.instagram.shareToFeed, true)
  console.log('Desktop layout, clip search/paging, deferred media choice, option snapshots, mode selection and draft payload pass')

  // Open an existing synthetic record through the real router and replace its
  // video with a device image only after the media dialog is confirmed.
  await page.getByRole('tab', { name: 'Drafts', exact: true }).click()
  await page.locator(`[data-publishing-post="${createdId}"]`).click()
  await page.locator('[data-publishing-preview]').getByRole('button', { name: 'Edit post', exact: true }).click()
  await root.waitFor()
  assert.equal(await caption.inputValue(), text)
  await assertShell()
  await root.locator('summary').filter({ hasText: 'More options' }).click()
  await page.getByLabel('Post title', { exact: true }).fill('Synthetic internal draft title')
  await root.locator('summary').filter({ hasText: 'More options' }).click()
  await openMedia()
  await mediaDialog.getByRole('tab', { name: 'From device', exact: true }).click()
  await mediaDialog.locator('input[type="file"]').first().setInputFiles({ name: 'synthetic-upload.png', mimeType: 'image/png', buffer: image })
  await mediaDialog.getByRole('button', { name: 'Use media', exact: true }).waitFor({ state: 'visible' })
  await mediaDialog.getByRole('button', { name: 'Use media', exact: true }).click({ trial: true })
  await capture('desktop-change-media-device')
  await mediaDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await mediaDialog.waitFor({ state: 'hidden' })
  assert.equal(await preview.locator('video').first().getAttribute('src'), videoUrl, 'Cancel preserves the current clip after an upload')
  await assertDraftState(text)
  await openMedia()
  await mediaDialog.getByRole('tab', { name: 'From device', exact: true }).click()
  await mediaDialog.locator('input[type="file"]').first().setInputFiles({ name: 'synthetic-upload.png', mimeType: 'image/png', buffer: image })
  const useMedia = mediaDialog.getByRole('button', { name: 'Use media', exact: true })
  await useMedia.click()
  await mediaDialog.waitFor({ state: 'hidden' })
  await preview.locator('img:not([data-platform-mark])').first().waitFor()
  assert.equal(await preview.locator('video').count(), 0, 'Confirmed image replaces the linked clip')
  await assertDraftState(text)
  const updated = await saveDraft('PATCH')
  assert.equal(updated.clipId, null, 'Uploaded media clears the associated clip')
  assert.equal(updated.media[0].reference, uploadReference)
  assert.equal(updated.caption, text)
  assert.equal(updated.title, 'Synthetic internal draft title', 'Optional internal metadata remains editable in More options')
  assert.ok(uploads.length >= 2, 'Device upload uses the mocked media API')
  console.log('Edit route and device upload preserve text/accounts; Cancel discards and Use media applies the replacement')

  await page.setViewportSize({ width: 390, height: 844 })
  await rememberShell()
  await page.getByRole('button', { name: 'New post', exact: true }).first().click()
  await root.waitFor()
  const mobileText = 'A mobile story preserved through focused views.'
  await caption.fill(mobileText)
  await accountTile('tiktok').click()
  await openMedia()
  await assertFullscreenDialog(mediaDialog, 'Mobile media picker')
  await mediaDialog.getByRole('tab', { name: 'My clips', exact: true }).click()
  await clipButton(0).click()
  await capture('mobile-change-media-clips')
  await mediaDialog.getByRole('button', { name: 'Use clip', exact: true }).click()
  await mediaDialog.waitFor({ state: 'hidden' })
  await assertDraftState(mobileText)
  await openOptions()
  await assertFullscreenDialog(optionsDialog, 'Mobile platform options')
  await optionsDialog.getByRole('tab', { name: 'Instagram', exact: true }).click()
  await capture('mobile-platform-options')
  await optionsDialog.getByRole('button', { name: 'Done', exact: true }).click()
  await optionsDialog.waitFor({ state: 'hidden' })
  await assertOpenerFocus('Platform options')
  await assertDraftState(mobileText)
  await modeTab('Schedule').click()
  await noOverflow('Mobile composer')
  await capture('mobile-new-post', { fullPage: false })
  await root.getByRole('combobox', { name: 'Time zone', exact: true }).scrollIntoViewIfNeeded()
  await capture('mobile-schedule-controls', { fullPage: false, scrollTop: false })
  await openMedia()
  await mediaDialog.getByRole('tab', { name: 'From device', exact: true }).click()
  await noOverflow('Mobile device upload')
  await capture('mobile-change-media-device')
  await mediaDialog.getByRole('button', { name: /Back|Cancel/, exact: false }).first().click()
  await mediaDialog.waitFor({ state: 'hidden' })
  await assertDraftState(mobileText)
  await root.getByRole('button', { name: 'Back to publishing', exact: true }).click()
  await page.getByRole('button', { name: 'New post', exact: true }).first().waitFor()
  await assertShell()
  console.log('Mobile focused media/options views, compact composer, back navigation and shell identity pass')
  assert.deepEqual(blockedMutations, [], 'No publishing, scheduling or unexpected API mutations')
  assert.equal(writes.length, 2, 'Only the intended synthetic create/update drafts were saved')
  assert.deepEqual(errors, [], 'No browser runtime errors')
  console.log('Post composer browser checks passed (mocked APIs only)')
} catch (error) {
  await capture('failure').catch(() => {})
  throw error
} finally {
  await browser.close()
}
