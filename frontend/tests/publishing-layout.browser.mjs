import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Start Vite separately. Every identity, post and media response is synthetic;
// unexpected API writes are blocked rather than forwarded to a running backend.
if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
const output = new URL('../test-results/publishing-layout/', import.meta.url)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width: 1488, height: 1058 },
  timezoneId: 'Europe/Bucharest', colorScheme: 'dark', reducedMotion: 'reduce'
})
const page = await context.newPage()
page.setDefaultTimeout(30000)
const errors = []
const blockedMutations = []
const requestedRanges = []
const clipRequests = new Map()
const expectedHttpFailures = new Set()
let unavailableClipId = null
let calendarState = 'ready'
let accountState = 'connected'
let pendingCalendar = null
page.on('pageerror', error => {
  errors.push(error.message)
  console.error('Browser runtime error:', error.message)
})
page.on('console', message => {
  if (message.type() === 'error') {
    if (expectedHttpFailures.has(message.location().url) && /503/.test(message.text())) return
    errors.push(message.text())
    console.error('Browser console error:', message.text())
  }
})

const user = {
  id: '00000000-0000-4000-8000-000000000051',
  email: 'publishing-layout@example.invalid', name: 'Design Workspace',
  plan: 'pro', credits: 100, access_role: 'member'
}
const providerNames = {
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube'
}
const accounts = Object.entries(providerNames).map(([provider, name], index) => ({
  id: `00000000-0000-4000-8000-00000000006${index}`,
  provider, name: `Synthetic ${name}`, username: 'sneepcutstudio',
  status: 'connected', scopes: ['video_publish', 'video.publish']
}))
const currentMonth = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit'
}).format(new Date()).split('-')
const year = Number(currentMonth[0])
const month = Number(currentMonth[1]) - 1
const date = (day, hour = 15) => new Date(Date.UTC(year, month, day, hour)).toISOString()
const id = index => `00000000-0000-4000-8000-00000000007${index}`
const clipId = index => `00000000-0000-4000-8000-00000000008${index}`

function illustration(scene) {
  const detail = scene === 'camera'
    ? '<rect x="82" y="233" width="204" height="130" rx="16" fill="#101113"/><rect x="99" y="250" width="128" height="89" fill="#b6c2ba"/><circle cx="257" cy="283" r="19" fill="#596166"/><path d="M177 363 130 600M201 363 246 600M190 363 187 600" stroke="#17191d" stroke-width="15"/><rect x="125" y="196" width="101" height="40" rx="12" fill="#262b2e"/>'
    : '<path d="M50 460H315M90 460V590M283 460V590" stroke="#3b2518" stroke-width="13"/><rect x="138" y="397" width="71" height="57" rx="5" fill="#8d8174"/><path d="M226 468v89h42v-89" fill="#242423"/><path d="M250 557v34M224 593h52" stroke="#181c20" stroke-width="8"/>'
  const sky = scene === 'studio' ? '#d8e7ec' : '#f1a358'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640" viewBox="0 0 360 640"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${sky}"/><stop offset="1" stop-color="#bf6844"/></linearGradient><linearGradient id="floor" x2="0" y2="1"><stop stop-color="#8b6139"/><stop offset="1" stop-color="#2c241c"/></linearGradient></defs><rect width="360" height="640" fill="#332c26"/><path d="M32 102 333 148V480H32Z" fill="url(#sky)"/><circle cx="273" cy="295" r="51" fill="#ffe8a1" opacity=".9"/><path d="M35 403h25v-62h28v36h16v-99h27v82h25v-31h30v55h16v-94h22v83h35v-49h28v80h47v90H35Z" fill="#6f5c57" opacity=".7"/><path d="M30 103v380M126 117v366M231 132v350M335 148v332" stroke="#292b29" stroke-width="10"/><path d="M0 485h360v155H0Z" fill="url(#floor)"/><path d="m130 485 53 155h91l-47-155M44 486 8 640M326 485l32 155" fill="#e9b55d" opacity=".25"/>${detail}<path d="M33 510v-91M33 470q-54-80-28-86 32 9 29 61M33 459q39-102 56-72-3 27-55 95M33 446q-37-103-15-107 23 14 15 87M310 475v-69M310 450q-37-82-48-51 2 25 48 66M310 438q31-90 42-64 0 27-42 81" fill="#33432c" stroke="#233125" stroke-width="4"/><path d="m10 504 47-2-7 42H17Zm280-30h43l-7 35h-28Z" fill="#6f6248"/><path d="M0 0h360v98L0 34Z" fill="#29211c"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const thumbnails = ['sunset', 'camera', 'studio'].map(illustration)
const videoUrl = `${origin}/__publishing-fixture__/preview.mp4`
const originalVideoUrl = `${origin}/__publishing-fixture__/alternate-original.mp4`
// A two-second silent synthetic H.264 clip. Its source and controls can be checked
// without relying on local user media, external URLs, FFmpeg or actual playback.
const video = Buffer.from("AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANzbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAp50cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAFoAAACgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAIWbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAUABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABwW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAYFzdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAFoAoABIAAAASAAAAAAAAAABFExhdmM2My4xLjEwMiBsaWJ4MjY0AAAAAAAAAAAAAAAAGP//AAAAL2F2Y0MBQsAK/+EAGGdCwAraGFeTwEQAAAMABAAAAwBQPEiagAEABGjOD8gAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAD8AAAAAAAAAAYc3R0cwAAAAAAAAABAAAAFAAABAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAFAAAAAEAAABkc3RzegAAAAAAAAAAAAAAFAAAAD4AAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAAFHN0Y28AAAAAAAAAAQAAA6MAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYzLjEuMTAyAAAACGZyZWUAAAEEbWRhdAAAADpliIQ6EYoAAi7xwY+Tk5OTk6666666666666666666666666666666666666666666666666666668AAAABkGaID6B7AAAAAZBmkA+gewAAAAGQZpgPoHsAAAABkGagBCgewAAAAZBmqAQoHsAAAAGQZrAEKB7AAAABkGa4BCgewAAAAZBmwAQoHsAAAAGQZsgEKB7AAAABkGbQBCgewAAAAZBm2AQoHsAAAAGQZuAEKB7AAAABkGboBCgewAAAAZBm8AQoHsAAAAGQZvgEKB7AAAABkGaABCgewAAAAZBmiAQoHsAAAAGQZpAEKB7AAAABkGaYBCgew==", 'base64')
const titles = ['A new perspective', 'Behind the scenes', 'Made for your next story']
const publishingClips = titles.map((title, index) => ({
  id: clipId(index), title, duration: [28, 35, 42][index],
  tiktokEligible: true, thumbnailUrl: thumbnails[index], fileUrl: originalVideoUrl
}))
const calendarClips = publishingClips.map(clip => ({
  ...clip, viralScore: 8, captionTiktok: null, captionInstagram: null, captionYoutube: null
}))
const imageReference = `publishing/${user.id}/studio.png`
const posts = [
  ...titles.map((title, index) => ({
    id: id(index), title, status: 'scheduled', scheduledAt: date(23 + index, index === 1 ? 13 : 15),
    platforms: index === 0 ? ['instagram', 'tiktok'] : ['tiktok'],
    clip: calendarClips[index], media: []
  })),
  { id: id(3), title: 'Publishing in progress', status: 'publishing', scheduledAt: date(22), platforms: ['tiktok'], clip: calendarClips[1], media: [] },
  { id: id(4), title: 'A post that needs attention', status: 'failed', scheduledAt: date(21), platforms: ['instagram'], clip: null, media: [], publishingError: 'Synthetic provider failure. Review the connected account.' },
  { id: id(5), title: 'An unfinished story', status: 'draft', scheduledAt: date(24), platforms: ['instagram'], clip: null, media: [{ type: 'image', reference: imageReference, name: 'studio.png' }] },
  { id: id(6), title: 'A story already shared', status: 'published', scheduledAt: date(20), platforms: ['youtube'], clip: calendarClips[2], media: [] }
].map(post => ({
  caption: 'Every great story starts with a different perspective. Here is a look at what we have been creating this week.',
  notes: null, publishingDestinations: [], createdAt: date(19), updatedAt: date(22),
  ...post,
  accountIds: accounts.filter(account => post.platforms.includes(account.provider)).map(account => account.id)
}))

await context.route('**/v1/**', route => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
await context.route('**/__publishing-fixture__/preview.mp4', route => route.fulfill({
  contentType: 'video/mp4', body: video
}))
await context.route('**/api/**', route => {
  const request = route.request()
  const url = new URL(request.url())
  if (request.method() !== 'GET') {
    blockedMutations.push(`${request.method()} ${url.pathname}`)
    return route.fulfill({ status: 405, json: { error: 'Browser fixture forbids API writes' } })
  }
  if (url.pathname === '/api/publishing') return route.fulfill({ json: {
    providers: Object.entries(providerNames).map(([provider, name]) => ({
      id: provider, name, configured: true, supportsPublishing: true
    })), accounts: accountState === 'empty' ? [] : accounts, clips: publishingClips, posts: []
  } })
  const requestedClip = publishingClips.find(clip => url.pathname === `/api/clips/${clip.id}`)
  if (requestedClip) {
    clipRequests.set(requestedClip.id, (clipRequests.get(requestedClip.id) ?? 0) + 1)
    if (unavailableClipId === requestedClip.id) {
      expectedHttpFailures.add(url.href)
      return route.fulfill({ status: 503, json: { error: 'Synthetic temporary preview failure' } })
    }
    return route.fulfill({ json: {
      id: requestedClip.id, preview_url: videoUrl,
      file_url: originalVideoUrl, thumbnail_url: requestedClip.thumbnailUrl
    } })
  }
  if (url.pathname === `/api/publishing/accounts/${accounts.find(account => account.provider === 'tiktok').id}/options`)
    return route.fulfill({ json: {
      privacyLevels: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
      commentDisabled: false, duetDisabled: false, stitchDisabled: false,
      maxDuration: 600, nickname: 'Synthetic TikTok'
    } })
  if (url.pathname === '/api/calendar') {
    if (calendarState === 'loading') { pendingCalendar = route; return }
    if (calendarState === 'error') {
      expectedHttpFailures.add(url.href)
      return route.fulfill({ status: 503, json: { error: 'Synthetic calendar failure' } })
    }
    const start = new Date(url.searchParams.get('start'))
    const end = new Date(url.searchParams.get('end'))
    requestedRanges.push({ start: start.toISOString(), end: end.toISOString() })
    return route.fulfill({ json: {
      posts: calendarState === 'empty' ? [] : posts.filter(post => new Date(post.scheduledAt) >= start && new Date(post.scheduledAt) < end),
      clips: calendarClips
    } })
  }
  if (url.pathname === '/api/publishing/media/preview')
    return route.fulfill({ json: { url: thumbnails[2] } })
  if (url.pathname === '/api/user/profile') return route.fulfill({ json: { profile: {
    ...user, image: null, provider: 'password', canChangePassword: true,
    recentlyAuthenticated: true, emailVerified: date(1), createdAt: date(1)
  } } })
  if (url.pathname === '/api/workspace-agent/runs')
    return route.fulfill({ json: { runs: [], has_more: false } })
  if (url.pathname === '/api/workspace-agent/suggestions')
    return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  return route.fulfill({ json: {} })
})

const workspace = page.locator('[data-publishing-workspace]')
const preview = page.locator('[data-publishing-preview]')
const tab = name => page.getByRole('tab', { name, exact: true })
const row = index => page.locator(`[data-publishing-post="${id(index)}"]`)

async function assertRows(indices) {
  await page.waitForFunction(expected => {
    const actual = [...document.querySelectorAll('[data-publishing-post]')].map(element => element.getAttribute('data-publishing-post')).sort()
    return JSON.stringify(actual) === JSON.stringify(expected)
  }, indices.map(id).sort())
}

async function assertPreview(index) {
  await preview.getByRole('heading', { name: posts[index].title, exact: true }).waitFor()
}

async function assertNoOverflow(label) {
  assert.equal(await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1
  ), true, `${label}: page has no horizontal overflow`)
}

async function assertReferenceStyles(mobile = false) {
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  const palette = dark ? {
    canvas: 'rgb(14, 19, 28)', row: 'rgb(27, 49, 83)', primary: 'rgb(122, 167, 255)',
    surface: 'rgb(24, 31, 43)', info: 'rgb(28, 49, 81)', infoText: 'rgb(172, 203, 255)'
  } : {
    canvas: 'rgb(245, 247, 251)', row: 'rgb(238, 244, 255)', primary: 'rgb(37, 99, 235)',
    surface: 'rgb(255, 255, 255)', info: 'rgb(233, 241, 255)', infoText: 'rgb(29, 78, 216)'
  }
  const style = (locator, property) => locator.evaluate((element, property) =>
    getComputedStyle(element).getPropertyValue(property), property)
  const selectedRow = workspace.locator('[data-publishing-post][aria-pressed="true"]')
  assert.equal(await style(workspace, 'background-color'), palette.canvas, 'Publish canvas follows the active theme')
  assert.equal(await style(selectedRow, 'background-color'), palette.row, 'Selection uses the theme-specific blue surface')
  assert.equal(await style(selectedRow, 'border-radius'), '16px', 'Post rows retain the reference corner radius')
  assert.equal(await style(selectedRow, 'border-top-width'), '0px', 'Selection does not add a row border')
  const selectionShadow = await style(selectedRow, 'box-shadow')
  assert.ok(selectionShadow.includes(palette.primary) && selectionShadow.includes('2px') && selectionShadow.includes('inset'), 'Selected rows retain the theme-specific blue inset outline')
  const create = workspace.getByRole('button', { name: 'New post', exact: true }).first()
  assert.equal(await style(create, 'background-color'), palette.primary, 'The primary action follows the active theme')
  if (mobile) {
    const bounds = await create.boundingBox()
    assert.equal(bounds.width, 44, 'Mobile New post is a compact circular action')
    assert.equal(bounds.height, 44)
    assert.equal(await style(create, 'border-radius'), '50%')
  } else {
    assert.equal(await style(preview, 'background-color'), palette.surface)
    assert.equal(await style(preview, 'border-radius'), '24px')
    assert.equal(await style(preview, 'border-top-width'), '0px')
    assert.equal(await style(create, 'border-radius'), '999px')
    const status = row(0).locator('[data-status="scheduled"]')
    assert.equal(await style(status, 'background-color'), palette.info)
    assert.equal(await style(status, 'color'), palette.infoText)
    assert.equal(await style(status, 'border-radius'), '999px')
  }
}

async function switchTheme(theme) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => {
    window.publishingThemeProbe = {
      document,
      workspace: document.querySelector('[data-publishing-workspace]'),
      selectedRow: document.querySelector('[data-publishing-post][aria-pressed="true"]'),
      selectedTab: document.querySelector('[role="tab"][aria-selected="true"]'),
      preview: document.querySelector('[data-post-preview]'),
      dialog: document.querySelector('[role="dialog"]'),
      savedView: sessionStorage.getItem('sneepcut:publishing-view:v1')
    }
  })
  await page.emulateMedia({ colorScheme: theme })
  await page.waitForFunction(theme => document.documentElement.classList.contains(theme), theme)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const retained = await page.evaluate(() => {
    const probe = window.publishingThemeProbe
    return {
      document: probe?.document === document,
      workspace: probe?.workspace === document.querySelector('[data-publishing-workspace]'),
      selectedRow: probe?.selectedRow === document.querySelector('[data-publishing-post][aria-pressed="true"]'),
      selectedTab: probe?.selectedTab === document.querySelector('[role="tab"][aria-selected="true"]'),
      preview: probe?.preview === document.querySelector('[data-post-preview]'),
      dialog: probe?.dialog === document.querySelector('[role="dialog"]'),
      savedView: probe?.savedView === sessionStorage.getItem('sneepcut:publishing-view:v1')
    }
  })
  for (const [name, stable] of Object.entries(retained)) {
    assert.equal(stable, true, `Switching to ${theme} preserves ${name}`)
  }
  await assertShell()
}

async function capture(name) {
  await mkdir(output, { recursive: true })
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo(0, 0)
  })
  await page.locator('img').evaluateAll(images => Promise.all(images
    .filter(image => image.getBoundingClientRect().width > 0)
    .map(image => image.decode().catch(() => {}))))
  await preview.locator('video').evaluateAll(videos => {
    for (const video of videos) {
      if (video.getBoundingClientRect().width > 0 && video.readyState < 2) {
        video.preload = 'auto'
        video.load()
      }
    }
  })
  await page.waitForFunction(() => [...document.querySelectorAll('[data-publishing-preview] video')]
    .filter(video => video.getBoundingClientRect().width > 0)
    .every(video => video.readyState >= 2))
  // Native video controls finish their loading fade after the media request;
  // settling the network also keeps captures free of that transient throbber.
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: false })
}

async function rememberShell() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => {
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    window.publishingLayoutProbe = {
      main: document.querySelector('main'), sidebar,
      header: document.querySelector('header.studio-topbar'),
      mobileHeader: (() => {
        const toggle = document.querySelector('[data-publishing-workspace] button[aria-controls="dashboard-navigation"]')
        return toggle?.getBoundingClientRect().width > 0 ? toggle.parentElement : null
      })(),
      sidebarState: sidebar?.getAttribute('data-state')
    }
  })
}

async function assertShell() {
  assert.equal(await page.evaluate(() => {
    const probe = window.publishingLayoutProbe
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    return !!probe?.main && !!probe.header &&
      probe.main === document.querySelector('main') &&
      probe.header === document.querySelector('header.studio-topbar') &&
      (!probe.mobileHeader || probe.mobileHeader === document.querySelector('[data-publishing-workspace] button[aria-controls="dashboard-navigation"]')?.parentElement) &&
      probe.sidebar === sidebar && probe.sidebarState === sidebar?.getAttribute('data-state')
  }), true, 'Interactions and routes preserve dashboard DOM and sidebar state')
}

async function selectTab(name, indices) {
  await tab(name).click()
  assert.equal(await tab(name).getAttribute('aria-selected'), 'true')
  await assertRows(indices)
}

async function verifyMobileMenu() {
  const toggle = workspace.locator('button[aria-controls="dashboard-navigation"]')
  await toggle.waitFor({ state: 'visible' })
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
  await toggle.click()
  const sidebar = page.locator('[data-slot="sidebar"][data-mobile="true"]')
  await sidebar.waitFor({ state: 'visible' })
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
  await sidebar.getByRole('button', { name: 'Close navigation', exact: true }).click()
  await sidebar.waitFor({ state: 'detached' })
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
  await assertShell()
}

async function verifyEmptyMonth() {
  const lastRange = requestedRanges.at(-1)
  await page.getByRole('button', { name: /Next (month|period)/i }).click()
  await assertRows([])
  assert.notDeepEqual(requestedRanges.at(-1), lastRange, 'Next month requests a new range')
  await workspace.getByText(/no (scheduled |matching )?posts|nothing (scheduled|planned)|no posts/i).first().waitFor()
  assert.equal(await preview.locator('[data-post-preview]').count(), 0, 'Empty month has no stale post detail')
  await preview.getByText('Select a post to see its preview here.', { exact: true }).waitFor()
  for (const name of ['Drafts', 'Published']) {
    await selectTab(name, [])
    const emptyMessage = name === 'Drafts' ? 'No drafts this month' : 'No published posts this month'
    await workspace.getByText(emptyMessage, { exact: true }).waitFor()
  }
  await selectTab('Scheduled', [])
  await capture('desktop-empty-month')
  const emptyRange = requestedRanges.at(-1)
  await page.getByRole('button', { name: 'New post', exact: true }).first().click()
  await page.getByRole('button', { name: 'Back to publishing', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Back to publishing', exact: true }).click()
  await page.getByRole('button', { name: /Previous (month|period)/i }).waitFor()
  await assertRows([])
  assert.equal(requestedRanges.at(-1).start, emptyRange.start, 'Returning from a new post restores the selected month')
  assert.equal(await tab('Scheduled').getAttribute('aria-selected'), 'true')
  await page.getByRole('button', { name: /Previous (month|period)/i }).click()
  await assertRows([0, 1, 2, 3, 4])
  await page.getByRole('button', { name: /Next (month|period)/i }).click()
  await assertRows([])
  await page.getByRole('button', { name: 'Today', exact: true }).click()
  await assertRows([0, 1, 2, 3, 4])
}

try {
  await page.goto(`${origin}/dashboard/publish`, { waitUntil: 'networkidle', timeout: 180000 })
  await workspace.waitFor()
  await assertRows([0, 1, 2, 3, 4, 5, 6])
  assert.equal(await tab('All').getAttribute('aria-selected'), 'true')
  await workspace.getByRole('heading', { name: 'Undated', exact: true }).waitFor()
  await workspace.getByRole('button', { name: 'Resolve', exact: true }).click()
  await assertPreview(4)
  await row(0).click()
  await assertPreview(0)
  await assertReferenceStyles()
  const player = preview.locator('video')
  await player.evaluate(element => { element.preload = 'auto'; element.load() })
  await page.waitForFunction(() => document.querySelector('[data-publishing-preview] video')?.readyState >= 2)
  await player.evaluate(async element => { element.muted = true; await element.play() })
  await page.waitForFunction(() => document.querySelector('[data-publishing-preview] video')?.currentTime > 0)
  await player.evaluate(element => { element.pause(); element.load() })
  await page.waitForFunction(() => document.querySelector('[data-publishing-preview] video')?.readyState >= 2)
  console.log('Synthetic clip reaches readyState >= 2, plays, advances and pauses')
  await assertNoOverflow('Desktop dark')
  await capture('desktop-dark')
  assert.equal(await preview.locator('video').getAttribute('src'), videoUrl, 'Clip preview prefers the direct clip record preview URL over the original')
  assert.ok(clipRequests.get(clipId(0)) >= 1, 'Selected clip is fetched directly even when the publishing list has a fallback URL')
  assert.equal(await preview.locator('video').evaluate(element => element.controls), true, 'Video has native controls')
  assert.equal(await row(0).locator('img:not([data-platform-mark])').getAttribute('src'), thumbnails[0], 'Post row shows its clip thumbnail')

  // Collapse once, then preserve that deliberate sidebar state throughout routes.
  await page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click()
  await rememberShell()
  const selectionUrl = page.url()
  const priorClipFetches = clipRequests.get(clipId(1)) ?? 0
  unavailableClipId = clipId(1)
  await row(1).click()
  await assertPreview(1)
  await preview.getByText('Preview unavailable', { exact: true }).waitFor()
  assert.ok(clipRequests.get(clipId(1)) > priorClipFetches, 'Selecting the post fetches its unavailable clip record')
  const failedClipFetches = clipRequests.get(clipId(1))
  unavailableClipId = null
  await preview.getByRole('button', { name: 'Try again', exact: true }).click()
  await preview.locator('video').waitFor()
  assert.equal(clipRequests.get(clipId(1)), failedClipFetches + 1, 'Retry fetches a fresh clip record')
  assert.equal(await preview.locator('video').getAttribute('src'), videoUrl)
  console.log('Direct clip preview prefers preview_url and a failed lookup retries with a fresh request')
  assert.equal(page.url(), selectionUrl, 'Desktop row selection does not navigate')
  await assertShell()
  await row(3).click()
  await assertPreview(3)
  await row(4).click()
  await assertPreview(4)
  await preview.getByText(posts[4].publishingError, { exact: true }).waitFor()

  await selectTab('Scheduled', [0, 1, 2, 3, 4])
  await tab('Scheduled').focus()
  await tab('Scheduled').press('ArrowRight')
  await page.waitForFunction(() => [...document.querySelectorAll('[role="tab"]')].some(element => element.textContent === 'Drafts' && element.getAttribute('aria-selected') === 'true'))
  await assertRows([5])
  await row(5).click()
  await assertPreview(5)
  await preview.locator('img').first().waitFor()
  await tab('Drafts').press('ArrowRight')
  await assertRows([6])
  assert.equal(await tab('Published').getAttribute('aria-selected'), 'true', 'Arrow keys activate the next status tab')
  await row(6).click()
  await assertPreview(6)
  await selectTab('Scheduled', [0, 1, 2, 3, 4])
  await verifyEmptyMonth()
  await assertShell()
  console.log('Status groups retain scheduled, publishing, failed, draft and published posts; tab keys and month navigation pass')

  await page.getByRole('button', { name: /^TikTok – Connected$/ }).click()
  const connections = page.getByRole('dialog', { name: 'Connected accounts', exact: true })
  await connections.waitFor()
  for (const name of Object.values(providerNames)) await connections.getByText(name, { exact: true }).first().waitFor()
  await page.keyboard.press('Escape')
  await connections.waitFor({ state: 'hidden' })
  await assertShell()

  await row(0).click()
  await page.setViewportSize({ width: 1488, height: 600 })
  await page.evaluate(() => window.scrollTo(0, 180))
  await preview.getByRole('button', { name: 'Edit post', exact: true }).click()
  const rememberedScroll = await page.evaluate(() => JSON.parse(sessionStorage.getItem('sneepcut:publishing-view:v1')).scrollY)
  assert.ok(rememberedScroll > 0, 'The route transition remembers a nonzero queue scroll position')
  await page.waitForURL(url => url.pathname.endsWith(`/dashboard/publish/${id(0)}/edit`))
  await page.getByText('More options', { exact: true }).click()
  await page.getByLabel('Post title', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Post title', { exact: true }).inputValue(), posts[0].title)
  await assertShell()
  await page.getByRole('button', { name: 'Back to publishing', exact: true }).click()
  await workspace.waitFor()
  await assertRows([0, 1, 2, 3, 4])
  await page.waitForFunction(expected => Math.abs(window.scrollY - expected) < 2, rememberedScroll)
  await page.setViewportSize({ width: 1488, height: 1058 })
  assert.equal(await tab('Scheduled').getAttribute('aria-selected'), 'true', 'Editor return retains the queue filter')
  await assertPreview(0)
  await preview.getByRole('button', { name: 'Publish now', exact: true }).click()
  await page.waitForURL(url => url.searchParams.get('mode') === 'publish')
  await page.getByRole('tab', { name: 'Publish now', exact: true }).waitFor()
  assert.equal(await page.getByRole('tab', { name: 'Publish now', exact: true }).getAttribute('aria-selected'), 'true', 'Quick publish opens the validated editor in Publish now mode')
  assert.deepEqual(blockedMutations, [], 'Opening quick publish does not publish automatically')
  await page.getByRole('button', { name: 'Back to publishing', exact: true }).click()
  await workspace.waitFor()
  await page.getByRole('button', { name: 'New post', exact: true }).first().click()
  await page.waitForURL(url => url.pathname.endsWith('/dashboard/publish/new'))
  await page.getByText('More options', { exact: true }).click()
  await page.getByLabel('Post title', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Post title', { exact: true }).inputValue(), '')
  await assertShell()
  await page.getByRole('button', { name: 'Back to publishing', exact: true }).click()
  await workspace.waitFor()
  await assertShell()
  console.log('Manage dialog and existing New/Edit routes work without API mutations or dashboard remounts')

  await switchTheme('light')
  await row(0).click()
  await assertPreview(0)
  await assertReferenceStyles()
  await assertNoOverflow('Desktop light')
  await capture('desktop-light')
  await assertShell()
  await switchTheme('dark')
  await assertReferenceStyles()

  // Reset the detail choice before entering the mobile list, as a fresh visit
  // would. Resizing alone is allowed to retain a desktop selection.
  await selectTab('Drafts', [5])
  await selectTab('Scheduled', [0, 1, 2, 3, 4])
  await page.setViewportSize({ width: 390, height: 844 })
  await rememberShell()
  await row(0).waitFor({ state: 'visible' })
  await verifyMobileMenu()
  assert.equal(await preview.isVisible(), false, 'Mobile initially shows the post list')
  await page.getByRole('button', { name: 'Connected accounts', exact: true }).click()
  await connections.waitFor()
  const accountSheet = await connections.boundingBox()
  assert.equal(await connections.evaluate(element => getComputedStyle(element).borderTopLeftRadius), '28px', 'The account sheet retains the reference top corners')
  assert.equal(await connections.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(24, 31, 43)', 'The portaled account sheet inherits dark surfaces')
  assert.ok(accountSheet && Math.abs(accountSheet.x) <= 1 && accountSheet.width >= 388 && accountSheet.x + accountSheet.width <= 391, 'Mobile account management stays within the viewport and uses the full sheet width')
  assert.ok(Math.abs(accountSheet.y + accountSheet.height - 844) <= 1, 'Mobile account sheet is anchored to the viewport bottom')
  await page.screenshot({ path: fileURLToPath(new URL('mobile-accounts.png', output)), fullPage: false })
  await switchTheme('light')
  assert.equal(await connections.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(255, 255, 255)', 'The open account sheet switches to light without remounting')
  await switchTheme('dark')
  assert.equal(await connections.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(24, 31, 43)', 'The open account sheet switches back to dark without remounting')
  await connections.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await connections.waitFor({ state: 'hidden' })
  await assertReferenceStyles(true)
  await assertNoOverflow('Mobile dark list')
  await capture('mobile-dark-list')
  await row(0).click()
  await assertPreview(0)
  await verifyMobileMenu()
  assert.equal(await preview.isVisible(), true, 'Mobile opens the selected post detail')
  assert.equal(await row(0).isVisible(), false, 'Mobile detail hides the list')
  assert.equal(page.url().includes('/edit'), false, 'Mobile selection opens a detail view')
  await assertNoOverflow('Mobile dark detail')
  await capture('mobile-dark-detail')
  await page.getByRole('button', { name: 'Back to scheduled', exact: true }).click()
  await row(0).waitFor()
  assert.equal(await preview.isVisible(), false, 'Back restores the mobile list')
  await assertShell()
  for (const [name, index] of [['Drafts', 5], ['Published', 6]]) {
    await selectTab(name, [index])
    await row(index).click()
    await assertPreview(index)
    await page.getByRole('button', { name: `Back to ${name.toLowerCase()}`, exact: true }).click()
    await row(index).waitFor()
    assert.equal(await preview.isVisible(), false, `Back restores the mobile ${name.toLowerCase()} list`)
    await assertShell()
  }
  await selectTab('Scheduled', [0, 1, 2, 3, 4])
  await switchTheme('light')
  await assertReferenceStyles(true)
  await assertNoOverflow('Mobile light list')
  await capture('mobile-light-list')
  await row(2).click()
  await assertPreview(2)
  await assertNoOverflow('Mobile light detail')
  await capture('mobile-light-detail')
  await assertShell()
  console.log('Mobile list/detail/back and dark/light layouts pass without horizontal overflow')

  // Distinct empty, no-account, error and loading surfaces use isolated fixtures.
  await page.setViewportSize({ width: 1488, height: 1058 })
  calendarState = 'empty'
  accountState = 'empty'
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Connect an account', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Connect', exact: true }).first().waitFor()
  await capture('desktop-no-accounts')
  accountState = 'connected'
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'No scheduled posts this month', exact: true }).waitFor()
  await capture('desktop-empty')
  calendarState = 'error'
  await page.reload({ waitUntil: 'networkidle' })
  await workspace.getByRole('alert').waitFor()
  assert.equal(await workspace.locator('[data-publishing-post]').count(), 0)
  await capture('desktop-error')
  calendarState = 'ready'
  await workspace.getByRole('button', { name: 'Try again', exact: true }).click()
  await assertRows([0, 1, 2, 3, 4])
  calendarState = 'loading'
  await page.reload({ waitUntil: 'domcontentloaded' })
  await workspace.locator('[aria-busy="true"]').waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('desktop-loading.png', output)), fullPage: false })
  assert.ok(pendingCalendar, 'The loading screen is displayed while the request is pending')
  calendarState = 'ready'
  await pendingCalendar.fulfill({ json: { posts, clips: calendarClips } })
  pendingCalendar = null
  await assertRows([0, 1, 2, 3, 4])
  console.log('No-account, empty, load-error/retry and loading states pass')
  assert.deepEqual(blockedMutations, [], 'The layout harness makes no API mutations')
  assert.deepEqual(errors, [], 'No browser runtime or console errors')
  console.log('Publishing layout browser checks passed (mocked APIs only)')
} catch (error) {
  await capture('failure').catch(() => {})
  throw error
} finally {
  await browser.close()
}
