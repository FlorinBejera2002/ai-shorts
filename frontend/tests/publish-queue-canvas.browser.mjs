import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Canvas coverage for the Publish queue (Romanian route /ro/dashboard/publish). Every API
// response is synthetic; writes other than the asserted DELETEs are blocked, never forwarded.
if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
const output = new URL('../test-results/publish-queue-canvas/', import.meta.url)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'ro-RO', timezoneId: 'Europe/Bucharest', colorScheme: 'light', reducedMotion: 'reduce'
})
const page = await context.newPage()
page.setDefaultTimeout(30000)

const errors = []
const blocked = []
const deletes = []
const ranges = []
const expectedFailures = new Set()
const state = { calendar: 'ready', youtubeConnected: true, pendingCalendar: null }

page.on('pageerror', (error) => { errors.push(error.message); console.error('Browser runtime error:', error.message) })
page.on('console', (message) => {
  if (message.type() !== 'error') return
  if (expectedFailures.has(message.location().url) && /503|404|Failed to load resource/.test(message.text())) return
  errors.push(message.text())
  console.error('Browser console error:', message.text())
})

const user = {
  id: '00000000-0000-4000-8000-000000000061',
  email: 'publish-queue@example.invalid', name: 'Design Workspace',
  plan: 'pro', credits: 100, access_role: 'member'
}
const providerNames = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' }
const accounts = Object.entries(providerNames).map(([provider, name], index) => ({
  id: `00000000-0000-4000-8000-00000000006${index}`,
  provider, name: `Ana ${name}`, username: 'ana.creator',
  status: 'connected', scopes: ['video_publish', 'video.publish']
}))
const currentMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit' })
  .format(new Date()).split('-')
const year = Number(currentMonth[0])
const month = Number(currentMonth[1]) - 1
const date = (day, hour = 15) => new Date(Date.UTC(year, month, day, hour)).toISOString()
const id = (index) => `00000000-0000-4000-8000-00000000007${index}`
const clipId = (index) => `00000000-0000-4000-8000-00000000008${index}`

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
const calendarClips = publishingClips.map((clip) => ({ ...clip, viralScore: 8, captionTiktok: null, captionInstagram: null, captionYoutube: null }))
const posts = [
  ...titles.map((title, index) => ({
    id: id(index), title, status: 'scheduled', scheduledAt: date(23 + index, index === 1 ? 13 : 15),
    platforms: index === 0 ? ['instagram', 'tiktok'] : ['tiktok'], clip: calendarClips[index], media: []
  })),
  { id: id(3), title: 'Publishing in progress', status: 'publishing', scheduledAt: date(22), platforms: ['tiktok'], clip: calendarClips[1], media: [] },
  { id: id(4), title: 'A post that needs attention', status: 'failed', scheduledAt: date(21), platforms: ['instagram'], clip: null, media: [], publishingError: 'Synthetic provider failure. Review the connected account.' },
  { id: id(5), title: 'An unfinished story', status: 'draft', scheduledAt: date(24), platforms: ['instagram'], clip: null, media: [] },
  { id: id(6), title: 'A story already shared', status: 'published', scheduledAt: date(20), platforms: ['youtube'], clip: calendarClips[2], media: [] }
].map((post) => ({
  caption: 'Every great story starts with a different perspective.', notes: null, publishingDestinations: [],
  createdAt: date(19), updatedAt: date(22), ...post,
  accountIds: accounts.filter((account) => post.platforms.includes(account.provider)).map((account) => account.id)
}))

const visibleAccounts = () => accounts.filter((account) => state.youtubeConnected || account.provider !== 'youtube')

await context.route('**/v1/**', (route) => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
await context.route('**/__publishing-fixture__/preview.mp4', (route) => route.fulfill({ contentType: 'video/mp4', body: video }))
await context.route('**/api/**', (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (request.method() === 'DELETE' && url.pathname.startsWith('/api/calendar/')) {
    deletes.push(url.pathname)
    return route.fulfill({ json: { deleted: true, deletedPlatforms: [] } })
  }
  if (request.method() === 'DELETE' && url.pathname.startsWith('/api/publishing/accounts/')) {
    deletes.push(url.pathname)
    return route.fulfill({ json: { deleted: true } })
  }
  if (request.method() !== 'GET') {
    blocked.push(`${request.method()} ${url.pathname}`)
    return route.fulfill({ status: 405, json: { error: 'Browser fixture forbids this write' } })
  }
  if (url.pathname === '/api/publishing') return route.fulfill({ json: {
    providers: Object.entries(providerNames).map(([provider, name]) => ({
      id: provider, name, configured: true, supportsPublishing: true
    })),
    accounts: visibleAccounts(), clips: publishingClips, posts: []
  } })
  const clip = publishingClips.find((item) => url.pathname === `/api/clips/${item.id}`)
  if (clip) return route.fulfill({ json: { id: clip.id, preview_url: videoUrl, file_url: originalVideoUrl, thumbnail_url: clip.thumbnailUrl } })
  if (url.pathname === '/api/calendar') {
    if (state.calendar === 'loading') { state.pendingCalendar = route; return }
    if (state.calendar === 'error') {
      expectedFailures.add(url.href)
      return route.fulfill({ status: 503, json: { error: 'Synthetic calendar failure' } })
    }
    const start = new Date(url.searchParams.get('start'))
    const end = new Date(url.searchParams.get('end'))
    ranges.push({ start: start.toISOString(), end: end.toISOString() })
    return route.fulfill({ json: {
      posts: state.calendar === 'empty' ? [] : posts.filter((post) => new Date(post.scheduledAt) >= start && new Date(post.scheduledAt) < end),
      clips: calendarClips
    } })
  }
  if (url.pathname === '/api/user/profile') return route.fulfill({ json: { profile: {
    ...user, image: null, provider: 'password', canChangePassword: true,
    recentlyAuthenticated: true, emailVerified: date(1), createdAt: date(1)
  } } })
  if (url.pathname === '/api/workspace-agent/runs') return route.fulfill({ json: { runs: [], has_more: false } })
  if (url.pathname === '/api/workspace-agent/suggestions') return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  return route.fulfill({ json: {} })
})

const workspace = page.locator('[data-publishing-workspace]')
const preview = page.locator('[data-publishing-preview]')
const row = (index) => page.locator(`[data-publishing-post="${id(index)}"]`)
// Tab names include the failed count, so match the label as a prefix.
const tab = (name) => workspace.getByRole('tab', { name: new RegExp(`^${name}`) })
const periodTrigger = () => page.locator('[data-period-trigger]')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function openQueue(path = '/ro/dashboard/publish') {
  await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await workspace.waitFor()
}

async function reloadQueue() {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await workspace.waitFor()
}

async function rowIds() {
  return page.evaluate(() => [...document.querySelectorAll('[data-publishing-post]')].map((element) => element.getAttribute('data-publishing-post')).sort())
}

async function assertRows(indices, label) {
  await page.waitForFunction((expected) => JSON.stringify([...document.querySelectorAll('[data-publishing-post]')]
    .map((element) => element.getAttribute('data-publishing-post')).sort()) === JSON.stringify(expected), indices.map(id).sort())
  assert.deepEqual(await rowIds(), indices.map(id).sort(), label)
}

async function capture(name, mobile = false) {
  await mkdir(output, { recursive: true })
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  await page.screenshot({ path: fileURLToPath(new URL(`${name}${mobile ? '' : ''}.png`, output)) })
}

async function assertNoOverflow(label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${label}: no horizontal overflow`)
}

async function colorOf(locator, property) {
  return locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property)
}

async function assertPalette(dark) {
  const canvas = workspace
  assert.equal(await colorOf(canvas, 'background-color'), dark ? 'rgb(14, 19, 28)' : 'rgb(245, 247, 251)', 'Canvas follows the theme')
  const create = workspace.getByRole('button', { name: 'Postare nouă', exact: true })
  assert.equal(await colorOf(create, 'background-color'), dark ? 'rgb(142, 155, 176)' : 'rgb(11, 11, 12)', 'Primary action is black in light and steel in dark')
  const selected = workspace.locator('[data-publishing-post][aria-pressed="true"]')
  if (await selected.count()) {
    assert.equal(await colorOf(selected, 'background-color'), dark ? 'rgb(32, 43, 60)' : 'rgb(241, 245, 249)', 'Selected row uses the neutral selection surface')
  }
}

async function switchTheme(theme) {
  await page.emulateMedia({ colorScheme: theme })
  await page.waitForFunction((expected) => document.documentElement.classList.contains(expected), theme)
  await delay(150)
}

try {
  // Desktop, light: default filter, failed badge, tab filters.
  await openQueue()
  assert.equal(await tab('Programate').getAttribute('aria-selected'), 'true', 'Scheduled is the default tab, as in the canvas')
  await assertRows([0, 1, 2, 3, 4], 'Scheduled lists scheduled, publishing and failed posts')
  assert.equal(await tab('Eșuate').locator('span[aria-label]').textContent(), '1', 'The failed tab shows its count')
  await assertPalette(false)
  await assertNoOverflow('Desktop list')
  await capture('desktop-light')

  for (const [name, indices] of [['Toate', [0, 1, 2, 3, 4, 5, 6]], ['Ciorne', [5]], ['Publicate', [6]], ['Eșuate', [4]], ['Programate', [0, 1, 2, 3, 4]]]) {
    await tab(name).click()
    assert.equal(await tab(name).getAttribute('aria-selected'), 'true', `${name} becomes selected`)
    await assertRows(indices, `${name} filters the list`)
  }

  // Period menu: presets change the requested range; custom picks two days.
  await periodTrigger().click()
  const menu = page.getByRole('menuitemradio', { name: 'Luna aceasta', exact: true })
  await menu.waitFor()
  assert.equal(await menu.getAttribute('aria-checked'), 'true', 'The current preset is checked')
  await page.getByRole('menuitemradio', { name: 'Luna trecută', exact: true }).click()
  await menu.waitFor({ state: 'detached' }).catch(() => {})
  await page.waitForFunction(() => {
    const previous = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
    const name = new Intl.DateTimeFormat('ro-RO', { month: 'long' }).format(previous)
    return document.querySelector('[data-period-trigger]')?.textContent?.toLowerCase().includes(name)
  })
  const lastMonthRange = ranges.at(-1)
  assert.equal(await page.evaluate((start) => new Date(start).getMonth() === (new Date().getMonth() + 11) % 12, lastMonthRange.start), true, 'Last month requests the previous calendar month')
  await workspace.getByRole('heading', { name: /Nicio postare programată în/ }).waitFor()
  await capture('desktop-period-empty')

  await periodTrigger().click()
  await page.getByRole('menuitemradio', { name: 'Ultimele 30 de zile', exact: true }).click()
  await delay(200)
  const last30 = ranges.at(-1)
  assert.ok(new Date(last30.end) - new Date(last30.start) >= 29 * 86400000, 'Last 30 days covers 30 days')

  await periodTrigger().click()
  await page.getByRole('menuitem', { name: 'Interval personalizat', exact: true }).click()
  const picker = page.locator('[data-range-picker]')
  await picker.waitFor()
  await picker.getByRole('gridcell', { name: /^1 /, exact: false }).first().click()
  await picker.getByRole('gridcell', { name: /^10 /, exact: false }).first().click()
  await picker.getByRole('button', { name: 'Aplică', exact: true }).click()
  await picker.waitFor({ state: 'detached' }).catch(() => {})
  const customRange = ranges.at(-1)
  const days = await page.evaluate(([start, end]) => Math.round((new Date(end) - new Date(start)) / 86400000), [customRange.start, customRange.end])
  assert.equal(days, 10, 'A custom range from the 1st to the 10th is requested as ten days')
  assert.equal(await page.evaluate((start) => new Date(start).getDate(), customRange.start), 1, 'Custom range starts on the picked day')

  await periodTrigger().click()
  await page.getByRole('menuitemradio', { name: 'Luna aceasta', exact: true }).click()
  await assertRows([0, 1, 2, 3, 4], 'Returning to this month restores the scheduled list')

  // Account avatars open their provider panel; disconnect is confirmed before the request.
  await page.getByRole('button', { name: 'Instagram – Conectat', exact: true }).click()
  const instagram = page.locator('[data-account-panel="instagram"]')
  await instagram.waitFor()
  assert.equal(await instagram.getByText('Conectat', { exact: true }).count(), 1, 'Connected account shows its status')
  await instagram.getByRole('button', { name: /Deconectează contul/ }).click()
  const confirm = page.getByRole('alertdialog')
  await confirm.waitFor()
  const disconnectRequest = page.waitForRequest((request) => request.method() === 'DELETE' && request.url().includes('/api/publishing/accounts/'))
  await confirm.getByRole('button', { name: 'Deconectează', exact: true }).click()
  await disconnectRequest
  assert.ok(deletes.includes(`/api/publishing/accounts/${accounts[0].id}`), 'Confirmed disconnect sends DELETE for that account')
  await reloadQueue()

  // YouTube without a connection: consent gates the connect button.
  state.youtubeConnected = false
  await reloadQueue()
  await page.getByRole('button', { name: 'YouTube – Conectează', exact: true }).click()
  const youtube = page.locator('[data-account-panel="youtube"]')
  await youtube.waitFor()
  const connect = youtube.getByRole('button', { name: 'Continuă la YouTube', exact: true })
  assert.equal(await connect.isDisabled(), true, 'YouTube connect waits for consent')
  await youtube.getByRole('checkbox').check()
  assert.equal(await connect.isDisabled(), false, 'Consent enables YouTube connect')
  await page.keyboard.press('Escape')
  await youtube.waitFor({ state: 'detached' }).catch(() => {})
  state.youtubeConnected = true
  await reloadQueue()

  // Rows open the detail; Edit, Publish now and Delete go to their routes and dialogs.
  await row(0).click()
  await preview.getByRole('heading', { name: titles[0], exact: true }).waitFor()
  await preview.getByRole('button', { name: 'Editează postarea', exact: true }).click()
  await page.waitForURL((url) => url.pathname.endsWith(`/dashboard/publish/${id(0)}/edit`))
  await page.goBack()
  await workspace.waitFor()
  await row(0).click()
  await preview.getByRole('button', { name: 'Publică acum', exact: true }).click()
  await page.waitForURL((url) => url.searchParams.get('mode') === 'publish')
  await page.goBack()
  await workspace.waitFor()
  await row(0).click()
  await preview.getByRole('button', { name: 'Șterge postarea', exact: true }).click()
  const deleteDialog = page.getByRole('alertdialog')
  await deleteDialog.waitFor()
  assert.equal(await deleteDialog.locator('img').getAttribute('src'), '/illustrations/delete.webp', 'Delete confirmation uses the delete illustration')
  await deleteDialog.getByRole('button', { name: 'Păstrează postarea', exact: true }).click()
  await deleteDialog.waitFor({ state: 'detached' }).catch(() => {})
  assert.equal(deletes.some((path) => path === `/api/calendar/${id(0)}`), false, 'Keep leaves the post untouched')
  await row(0).click()
  await preview.getByRole('button', { name: 'Șterge postarea', exact: true }).click()
  const deletePost = page.waitForRequest((request) => request.method() === 'DELETE' && request.url().endsWith(`/api/calendar/${id(0)}`))
  await page.getByRole('alertdialog').getByRole('button', { name: 'Șterge definitiv', exact: true }).click()
  await deletePost
  assert.ok(deletes.includes(`/api/calendar/${id(0)}`), 'Confirmed delete sends DELETE for the post')

  // Failed post: status dialog with delete and edit.
  await row(4).click()
  await preview.getByRole('button', { name: 'Vezi statusul', exact: true }).click()
  const status = page.getByRole('dialog')
  await status.waitFor()
  await status.getByRole('button', { name: 'Șterge postarea', exact: true }).waitFor()
  await status.getByRole('button', { name: 'Editează', exact: true }).click()
  await page.waitForURL((url) => url.pathname.endsWith(`/dashboard/publish/${id(4)}/edit`))
  await page.goBack()
  await workspace.waitFor()

  // New post and the empty state.
  await page.getByRole('button', { name: 'Postare nouă', exact: true }).first().click()
  await page.waitForURL((url) => url.pathname.endsWith('/dashboard/publish/new'))
  await page.goBack()
  await workspace.waitFor()

  state.calendar = 'empty'
  await reloadQueue()
  await workspace.getByRole('heading', { name: /Nicio postare programată în/ }).waitFor()
  await workspace.getByRole('button', { name: 'Alege alt interval', exact: true }).click()
  await page.getByRole('menuitemradio', { name: 'Luna trecută', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  state.calendar = 'loading'
  await reloadQueue()
  await workspace.locator('[aria-busy="true"]').first().waitFor()
  await capture('desktop-loading')
  state.pendingCalendar.fulfill({ json: { posts, clips: calendarClips } })
  state.pendingCalendar = null
  state.calendar = 'error'
  await reloadQueue()
  await page.getByRole('alert').getByRole('button', { name: 'Încearcă din nou', exact: true }).waitFor()
  state.calendar = 'ready'
  await page.getByRole('alert').getByRole('button', { name: 'Încearcă din nou', exact: true }).click()
  await assertRows([0, 1, 2, 3, 4], 'Retry reloads the queue after a load error')

  // Dark theme keeps the same surfaces and states.
  await switchTheme('dark')
  await assertPalette(true)
  await capture('desktop-dark')
  await switchTheme('light')
  await assertPalette(false)

  // Phone: list, sheets, detail with reachable actions above the dock, back.
  // A fresh phone visit starts on the list, not on a detail left open on desktop.
  await page.evaluate(() => sessionStorage.removeItem('sneepcut:publishing-view:v1'))
  await page.setViewportSize({ width: 390, height: 844 })
  await reloadQueue()
  await assertNoOverflow('Phone list')
  await page.getByRole('button', { name: 'Instagram – Conectat', exact: true }).click()
  await page.locator('[data-account-panel="instagram"]').waitFor()
  await page.keyboard.press('Escape')
  await page.locator('[data-account-panel="instagram"]').waitFor({ state: 'detached' }).catch(() => {})
  await periodTrigger().click()
  await page.getByRole('menuitemradio', { name: 'Luna aceasta', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await tab('Ciorne').click()
  await assertRows([5], 'Phone tabs filter the list')
  await tab('Programate').click()
  await row(0).click()
  await preview.waitFor()
  const back = preview.getByRole('button', { name: 'Înapoi la programate', exact: true })
  await back.waitFor()
  assert.equal(await back.textContent(), 'Înapoi', 'Phone back button has visible text')
  for (const name of ['Editează postarea', 'Publică acum', 'Șterge postarea']) {
    const action = preview.getByRole('button', { name, exact: true })
    await action.scrollIntoViewIfNeeded()
    const reachable = await action.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      return element.contains(hit)
    })
    assert.equal(reachable, true, `${name} is not covered by the bottom dock`)
  }
  await switchTheme('dark')
  await assertNoOverflow('Phone detail')
  await capture('mobile-dark-detail', true)
  await switchTheme('light')
  await back.click()
  await row(0).waitFor()
  assert.equal(await preview.isVisible(), false, 'Back returns to the phone list')
  await assertPalette(false)
  await capture('mobile-light-list', true)

  assert.deepEqual(blocked, [], 'No unexpected writes were sent')
  assert.deepEqual(errors, [], 'No browser runtime or console errors')
  console.log('Publish queue canvas browser checks passed (mocked APIs only)')
} catch (error) {
  await capture('failure').catch(() => {})
  throw error
} finally {
  await browser.close()
}
