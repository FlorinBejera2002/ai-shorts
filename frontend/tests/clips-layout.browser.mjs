import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Start Vite separately. All identities, projects, clips, folders and downloads
// are synthetic. Only the explicit fixture move/delete/folder writes are accepted.
if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
const output = new URL('../test-results/clips-layout/', import.meta.url)
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome'
const browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true })
const context = await browser.newContext({
  viewport: { width: 1488, height: 1058 }, timezoneId: 'Europe/Bucharest',
  colorScheme: 'dark', reducedMotion: 'reduce'
})
const page = await context.newPage()
page.setDefaultTimeout(30000)
const errors = []
const blockedMutations = []
const moves = []
const failedMoves = []
const deletes = []
const folderChanges = []
const expectedHttpFailures = new Set()
let failNextMove = false
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => {
  if (message.type() !== 'error') return
  if (expectedHttpFailures.has(message.location().url) && /503/.test(message.text())) return
  errors.push(message.text())
})

const user = {
  id: '00000000-0000-4000-8000-000000000511', email: 'clips-layout@example.invalid',
  name: 'Design Workspace', plan: 'pro', credits: 100, access_role: 'member'
}
const ownerId = '00000000-0000-4000-8000-000000000512'
const folders = [
  { id: '00000000-0000-4000-8000-000000000513', parentId: null, name: 'Studio' },
  { id: '00000000-0000-4000-8000-000000000514', parentId: null, name: 'Launch campaign' }
]
const clipId = index => `00000000-0000-4000-8000-${String(600 + index).padStart(12, '0')}`
const titles = [
  'A new perspective', 'Behind the scenes', 'Made for your next story',
  'Street details', 'Morning routine', 'Small moments'
]

function illustration(index) {
  const colors = ['#f2b86e', '#ddb482', '#d8e6e9', '#97b4c3', '#edca92', '#e4ac66']
  const scene = index % 6
  const detail = scene === 1
    ? '<rect x="220" y="135" width="194" height="115" rx="12" fill="#171b20"/><rect x="238" y="149" width="108" height="79" fill="#eab677"/><circle cx="384" cy="185" r="21" fill="#55595d"/><path d="M291 250 242 360M324 250 375 360M310 250v110" stroke="#171b20" stroke-width="13"/><rect x="255" y="112" width="101" height="31" rx="7" fill="#262b2e"/>'
    : scene === 4
      ? '<ellipse cx="335" cy="298" rx="102" ry="18" fill="#34281f"/><path d="M270 220h112v55q-55 55-112 0Z" fill="#292824"/><path d="M383 230q60-10 32 43h-32" fill="none" stroke="#342c25" stroke-width="14"/><path d="M305 211q-18-20 2-34M340 206q22-24 0-45" fill="none" stroke="#f9e0bb" stroke-width="5" opacity=".5"/>'
      : scene === 3
        ? '<path d="M45 0h198v360H45Z" fill="#a6a29a"/><path d="M45 40h198M45 95h198M45 150h198M45 205h198M45 260h198" stroke="#494c4d" stroke-width="12"/><path d="m395 20 180-20v360H395Z" fill="#627780"/><path d="M410 0v360M445 0v360M480 0v360M515 0v360M550 0v360M395 60h180M395 120h180M395 180h180M395 240h180M395 300h180" stroke="#344b57" stroke-width="4"/>'
        : '<path d="M105 260H550M150 260v100M510 260v100" stroke="#3b2b21" stroke-width="15"/><rect x="270" y="195" width="98" height="58" rx="4" fill="#89857d"/><path d="M432 263v55h40v-55M452 319v32M426 353h54" fill="#272b2e" stroke="#272b2e" stroke-width="7"/>'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${colors[scene]}"/><stop offset="1" stop-color="#9b796b"/></linearGradient><linearGradient id="floor" x2="0" y2="1"><stop stop-color="#a47b50"/><stop offset="1" stop-color="#3e3027"/></linearGradient></defs><rect width="640" height="360" fill="#28231e"/><path d="M20 25 615 70V290H20Z" fill="url(#sky)"/><circle cx="465" cy="174" r="50" fill="#ffe8a5" opacity=".9"/><path d="M20 225h50v-60h35v35h50v-85h38v85h36v-24h49v45h35v-78h37v65h40v-38h50v70h140v60H20Z" fill="#756a67" opacity=".6"/><path d="M20 25v265M205 38v252M412 55v235M615 70v220" stroke="#32322d" stroke-width="12"/><path d="M0 290h640v70H0Z" fill="url(#floor)"/>${detail}<path d="M64 302v-78q-45-66-58-40 5 33 56 66 44-90 65-59-5 35-63 71M577 280v-65q-42-65-57-37 10 34 56 63 34-82 54-59-5 28-53 66" fill="#394c2d" stroke="#283f2a" stroke-width="4"/><path d="m35 300 58-2-10 45H44Zm515-20h53l-8 34h-36Z" fill="#81755a"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

const downloadUrl = `${origin}/__clips-fixture__/synthetic.mp4`
const video = Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANzbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAp50cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAFoAAACgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAIWbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAUABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABwW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAYFzdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAFoAoABIAAAASAAAAAAAAAABFExhdmM2My4xLjEwMiBsaWJ4MjY0AAAAAAAAAAAAAAAAGP//AAAAL2F2Y0MBQsAK/+EAGGdCwAraGFeTwEQAAAMABAAAAwBQPEiagAEABGjOD8gAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAD8AAAAAAAAAAYc3R0cwAAAAAAAAABAAAAFAAABAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAFAAAAAEAAABkc3RzegAAAAAAAAAAAAAAFAAAAD4AAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAAFHN0Y28AAAAAAAAAAQAAA6MAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYzLjEuMTAyAAAACGZyZWUAAAEEbWRhdAAAADpliIQ6EYoAAi7xwY+Tk5OTk6666666666666666666666666666666666666666666666666666668AAAABkGaID6B7AAAAAZBmkA+gewAAAAGQZpgPoHsAAAABkGagBCgewAAAAZBmqAQoHsAAAAGQZrAEKB7AAAABkGa4BCgewAAAAZBmwAQoHsAAAAGQZsgEKB7AAAABkGbQBCgewAAAAZBm2AQoHsAAAAGQZuAEKB7AAAABkGboBCgewAAAAZBm8AQoHsAAAAGQZvgEKB7AAAABkGaABCgewAAAAZBmiAQoHsAAAAGQZpAEKB7AAAABkGaYBCgew==', 'base64')
const now = new Date()
const allClips = Array.from({ length: 28 }, (_, index) => ({
  id: clipId(index), folderId: index % 3 === 0 ? folders[0].id : index % 3 === 1 ? folders[1].id : null,
  title: titles[index] ?? `Studio story ${String(index + 1).padStart(2, '0')}`,
  duration: index < 6 ? [28, 35, 42, 21, 32, 18][index] : 20 + index * 2,
  viralScore: index < 6 ? [9.6, 8.8, 6.5, 4.1, 9.2, 8.1][index] : [9.1, 7.2, 3.4][index % 3],
  aspectRatio: index < 6 ? ['9:16', '9:16', '1:1', '16:9', '9:16', '1:1'][index] : ['9:16', '1:1', '16:9'][index % 3],
  hasSubtitles: index % 2 === 0, resolution: '1080 × 1920',
  thumbnailUrl: illustration(index), fileUrl: downloadUrl,
  hookText: index === 14 ? 'A rare behind-lighting-hook from our studio.' : `Find a different perspective in creative story ${index + 1}.`,
  createdAt: new Date(now.getTime() - index * 86400000).toISOString()
}))
const project = {
  id: ownerId, name: 'Creative workspace', status: 'completed', source: 'synthetic',
  brandKit: {}, folders: [...folders], clips: [...allClips], updatedAt: now.toISOString()
}
const publishingClips = allClips.map(clip => ({
  ...clip, tiktokEligible: true, captionInstagram: clip.hookText,
  captionTiktok: null, captionYoutube: null
}))

await context.route('**/v1/**', route => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
await context.route('**/__clips-fixture__/synthetic.mp4', route => route.fulfill({ contentType: 'video/mp4', body: video }))
await context.route('**/api/**', async route => {
  const request = route.request()
  const url = new URL(request.url())
  const move = url.pathname.match(/^\/api\/projects\/([^/]+)\/clips\/([^/]+)$/)
  if (move && request.method() === 'PATCH') {
    const clip = project.clips.find(clip => clip.id === move[2])
    const body = request.postDataJSON()
    assert.equal(move[1], ownerId)
    assert.ok(clip, 'Only a synthetic clip may move')
    assert.ok(body.folderId === null || project.folders.some(folder => folder.id === body.folderId), 'Move destination belongs to the synthetic project')
    if (failNextMove) {
      failNextMove = false
      failedMoves.push({ id: clip.id, ...body })
      expectedHttpFailures.add(url.href)
      return route.fulfill({ status: 503, json: { error: 'Synthetic temporary move failure' } })
    }
    clip.folderId = body.folderId
    moves.push({ id: clip.id, ...body })
    return route.fulfill({ json: { clip } })
  }
  const deletion = url.pathname.match(/^\/api\/clips\/([^/]+)$/)
  if (deletion && request.method() === 'DELETE') {
    const clip = project.clips.find(clip => clip.id === deletion[1])
    assert.ok(clip, 'Only a synthetic clip may be deleted')
    project.clips = project.clips.filter(item => item.id !== clip.id)
    deletes.push(clip.id)
    return route.fulfill({ json: { deleted: true } })
  }
  const folderMutation = url.pathname.match(/^\/api\/projects\/([^/]+)\/folders(?:\/([^/]+))?$/)
  if (folderMutation && ['POST', 'PATCH'].includes(request.method())) {
    assert.equal(folderMutation[1], ownerId)
    const body = request.postDataJSON()
    assert.ok(typeof body.name === 'string' && body.name.trim())
    const id = folderMutation[2] ?? `00000000-0000-4000-8000-0000000007${folderChanges.length}0`
    const existing = project.folders.find(item => item.id === id)
    if (request.method() === 'PATCH') assert.ok(existing)
    const folder = { id, parentId: null, name: body.name }
    if (existing) Object.assign(existing, folder)
    else project.folders.push(folder)
    folderChanges.push({ method: request.method(), folder })
    return route.fulfill({ json: { folder } })
  }
  if (request.method() !== 'GET') {
    blockedMutations.push(`${request.method()} ${url.pathname}`)
    return route.fulfill({ status: 405, json: { error: 'Unexpected API mutation blocked by browser fixture' } })
  }
  if (url.pathname === '/api/projects') return route.fulfill({ json: { projects: [project] } })
  if (url.pathname === '/api/publishing') return route.fulfill({ json: {
    providers: [{ id: 'instagram', name: 'Instagram', configured: true, supportsPublishing: true }],
    accounts: [{ id: '00000000-0000-4000-8000-000000000515', provider: 'instagram', name: 'Synthetic Instagram', username: 'sneepcutstudio', status: 'connected' }],
    clips: publishingClips, posts: []
  } })
  if (url.pathname === '/api/calendar') return route.fulfill({ json: { posts: [], clips: publishingClips } })
  const clip = publishingClips.find(item => url.pathname === `/api/clips/${item.id}`)
  if (clip) return route.fulfill({ json: { id: clip.id, preview_url: downloadUrl, file_url: downloadUrl, thumbnail_url: clip.thumbnailUrl } })
  if (url.pathname === '/api/user/profile') return route.fulfill({ json: { profile: {
    ...user, image: null, provider: 'password', canChangePassword: true,
    recentlyAuthenticated: true, emailVerified: now.toISOString(), createdAt: now.toISOString()
  } } })
  if (url.pathname === '/api/workspace-agent/runs') return route.fulfill({ json: { runs: [], has_more: false } })
  if (url.pathname === '/api/workspace-agent/suggestions') return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  return route.fulfill({ json: {} })
})

const workspace = page.locator('[data-clips-workspace]')
const cards = workspace.locator('[data-clip-card]')
const card = index => workspace.locator(`[data-clip-card="${clipId(index)}"]`)
const search = workspace.getByRole('searchbox', { name: 'Search clips', exact: true })
const filters = page.locator('[data-clips-filters]')
const mobileViewport = () => (page.viewportSize()?.width ?? 1488) < 1024
const menuTrigger = index => card(index).locator(`[data-clip-menu-trigger="${clipId(index)}"]`)
const desktopMenu = page.locator('[data-clip-actions="desktop"]')
const mobileMenu = page.locator('[data-clip-actions="mobile"]')

async function expectedCards(indices) {
  const ids = indices.map(clipId)
  await page.waitForFunction(expected => {
    const actual = [...document.querySelectorAll('[data-clips-workspace] [data-clip-card]')].map(element => element.getAttribute('data-clip-card'))
    return JSON.stringify(actual) === JSON.stringify(expected)
  }, ids)
}

async function assertQuery(expected) {
  await page.waitForURL(url => Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value))
  for (const [key, value] of Object.entries(expected)) {
    const actual = new URL(page.url()).searchParams.get(key)
    assert.equal(actual, value, `The ${key} query state is ${String(value)}`)
  }
}

async function rememberShell() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.evaluate(() => {
    window.clipsShellProbe = {
      main: document.querySelector('main'), sidebar: document.querySelector('[data-slot="sidebar"]'),
      header: document.querySelector('header.studio-topbar'),
      sidebarState: document.querySelector('[data-slot="sidebar"]')?.getAttribute('data-state')
    }
  })
}

async function assertShell() {
  assert.equal(await page.evaluate(() => {
    const probe = window.clipsShellProbe
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    return !!probe?.main && !!probe.header && probe.main === document.querySelector('main') &&
      probe.header === document.querySelector('header.studio-topbar') && probe.sidebar === sidebar &&
      probe.sidebarState === sidebar?.getAttribute('data-state')
  }), true, 'Clips filters, actions and routes preserve dashboard DOM and sidebar state')
}

async function noOverflow(label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${label}: no horizontal page overflow`)
}

async function capture(name) {
  await mkdir(output, { recursive: true })
  await page.mouse.move(0, 0)
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    window.scrollTo(0, 0)
  })
  await page.locator('img').evaluateAll(images => Promise.all(images
    .filter(image => {
      const rect = image.getBoundingClientRect()
      return rect.width > 0 && rect.bottom > 0 && rect.top < innerHeight
    })
    .map(image => image.decode().catch(() => {}))))
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: false })
}

async function dismissToasts() {
  const close = page.locator('div.animate-toast-in').getByRole('button', { name: 'Close', exact: true })
  while (await close.count()) await close.last().click()
}

async function choose(label, option, scope = page) {
  const control = scope.getByRole('combobox', { name: label, exact: true })
  await control.click()
  await page.getByRole('option', { name: option, exact: true }).click()
  await control.filter({ hasText: option }).waitFor()
}

const filterKeys = { 'Viral score': 'score', 'Aspect ratio': 'aspect', Subtitles: 'subtitles' }
const filterValues = {
  'All scores': null, 'High · 8–10': 'high', 'Promising · 5–7': 'promising', 'Developing · 0–4': 'low',
  'All formats': null, '9:16': '9:16', '1:1': '1:1', '16:9': '16:9',
  Any: null, 'With subtitles': 'yes', 'Without subtitles': 'no'
}
const filterChips = {
  'All scores': 'All', 'High · 8–10': 'High 8–10', 'Promising · 5–7': 'Promising 5–7', 'Developing · 0–4': 'Low 0–4',
  'All formats': 'All', 'With subtitles': 'With', 'Without subtitles': 'Without', Any: 'Any'
}

async function openFilterSheet() {
  if (!await filters.isVisible()) await workspace.getByRole('button', { name: /^Filters/ }).click()
  await filters.waitFor()
}

async function filterBy(label, option) {
  const key = filterKeys[label]
  if (mobileViewport()) {
    await openFilterSheet()
    const group = label === 'Aspect ratio' ? 'Format' : label
    await filters.getByRole('radiogroup', { name: group, exact: true })
      .getByRole('radio', { name: filterChips[option] ?? option, exact: true }).click()
    await filters.getByRole('button', { name: 'Apply', exact: true }).click()
    await filters.waitFor({ state: 'hidden' })
  } else {
    await workspace.getByRole('combobox', { name: label, exact: true }).click()
    await page.getByRole('option', { name: option, exact: true }).click()
  }
  await page.waitForURL(url => url.searchParams.get(key) === filterValues[option])
}

async function closeFilters() {
  if (await filters.isVisible()) {
    await page.keyboard.press('Escape')
    await filters.waitFor({ state: 'hidden' })
  }
}

async function submitSearch(value) {
  await page.waitForFunction(() => {
    const input = document.querySelector('[data-clips-workspace] input[type="search"]')
    return input?.defaultValue === (new URL(location.href).searchParams.get('search') ?? '')
  })
  await search.fill(value)
  await search.press('Enter')
  await page.waitForURL(url => url.searchParams.get('search') === (value || null))
  await page.waitForFunction(expected => document.querySelector('[data-clips-workspace] input[type="search"]')?.defaultValue === expected, value)
}

async function clearFilters() {
  if (mobileViewport()) {
    await openFilterSheet()
    await filters.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await filters.getByRole('button', { name: 'Apply', exact: true }).click()
    await filters.waitFor({ state: 'hidden' })
    await page.waitForURL(url => !['score', 'aspect', 'subtitles', 'sort'].some(key => url.searchParams.has(key)))
    return
  }
  await workspace.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await page.waitForURL(url => !url.search)
  await workspace.getByRole('combobox', { name: 'Sort by', exact: true }).filter({ hasText: 'Newest first' }).waitFor()
}

async function pickProject(name) {
  await workspace.locator('[data-clips-project-picker]').click()
  await page.getByRole('dialog').locator('[data-clips-project]').filter({ hasText: name }).first().click()
  await workspace.locator('[data-clips-project-picker]').filter({ hasText: name }).waitFor()
}

async function openActions(index, mobile = false) {
  await menuTrigger(index).click()
  const menu = mobile ? mobileMenu : desktopMenu
  await menu.waitFor()
  return menu
}

async function assertActionLinks(menu, index) {
  const edit = menu.locator('a').filter({ hasText: /^Open$/ })
  const publish = menu.locator('a').filter({ hasText: 'Publish' })
  assert.equal(await edit.getAttribute('href'), `/dashboard/clips/${clipId(index)}`)
  assert.equal(await publish.getAttribute('href'), `/dashboard/publish/new?clip=${clipId(index)}`)
}

async function downloadChoice(menu) {
  await menu.getByText('Download', { exact: true }).click()
  const link = page.locator('[data-clip-download]').first()
  await link.waitFor()
  assert.equal(await link.getAttribute('href'), downloadUrl)
  return link
}

try {
  await page.goto(`${origin}/dashboard/clips`, { waitUntil: 'networkidle', timeout: 180000 })
  await workspace.waitFor()
  await expectedCards(Array.from({ length: 24 }, (_, index) => index))
  await search.waitFor({ state: 'visible' })
  await rememberShell()
  await noOverflow('Desktop clips grid')
  const desktopColumns = await workspace.locator('[data-clips-grid]').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)
  assert.ok(desktopColumns >= 3, 'Desktop renders a multi-column clip grid')
  await capture('desktop-clips')
  await page.setViewportSize({ width: 390, height: 844 })
  await workspace.locator('[data-workspace-mobile-header]').waitFor({ state: 'visible' })
  await noOverflow('Initial mobile clips grid')
  assert.equal(await workspace.locator('[data-clips-grid]').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length), 2, 'Mobile uses a two-column clip grid')
  await capture('mobile-clips')
  await page.setViewportSize({ width: 1488, height: 1058 })
  await rememberShell()

  await page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click()
  await rememberShell()
  await page.getByRole('link', { name: 'Next', exact: true }).click()
  await expectedCards([24, 25, 26, 27])
  await assertQuery({ page: '2' })
  await assertShell()
  await submitSearch('Street details')
  await expectedCards([3])
  await assertQuery({ page: null })
  await submitSearch('behind-lighting-hook')
  await expectedCards([14])
  await submitSearch('')
  await expectedCards(Array.from({ length: 24 }, (_, index) => index))

  await workspace.locator(`[data-clips-project="${folders[0].id}"]`).click()
  await expectedCards(allClips.map((_, index) => index).filter(index => index % 3 === 0))
  await search.waitFor({ state: 'visible' })
  await submitSearch('perspective')
  await expectedCards(allClips.map((_, index) => index).filter(index => index % 3 === 0))
  await submitSearch('A new perspective')
  await expectedCards([0])
  await submitSearch('')
  await workspace.locator('[data-clips-project="all"]').click()
  await expectedCards(Array.from({ length: 24 }, (_, index) => index))
  await workspace.locator('[data-clips-project="unassigned"]').click()
  await expectedCards(allClips.map((_, index) => index).filter(index => index % 3 === 2))
  await workspace.locator('[data-clips-project="all"]').click()
  await expectedCards(Array.from({ length: 24 }, (_, index) => index))
  await search.fill('Street')
  await filterBy('Viral score', 'Developing · 0–4')
  await assertQuery({ search: 'Street', score: 'low', page: null })
  await expectedCards([3])
  await clearFilters()
  await filterBy('Viral score', 'High · 8–10')
  await filterBy('Aspect ratio', '9:16')
  await filterBy('Subtitles', 'With subtitles')
  await assertQuery({ score: 'high', aspect: '9:16', subtitles: 'yes', page: null })
  const combined = allClips.map((_, index) => index).filter(index => allClips[index].viralScore >= 8 && allClips[index].aspectRatio === '9:16' && allClips[index].hasSubtitles)
  await expectedCards(combined)
  await capture('desktop-filters')
  await closeFilters()
  await assertShell()
  await clearFilters()
  await expectedCards(Array.from({ length: 24 }, (_, index) => index))
  await choose('Sort by', 'Longest first', workspace)
  const durationOrder = allClips.map((_, index) => index).sort((left, right) => allClips[right].duration - allClips[left].duration)
  await expectedCards(durationOrder.slice(0, 24))
  await page.getByRole('link', { name: 'Next', exact: true }).click()
  await expectedCards(durationOrder.slice(24))
  await choose('Sort by', 'Oldest first', workspace)
  await assertQuery({ sort: 'oldest', page: null })
  await expectedCards(Array.from({ length: 24 }, (_, index) => 27 - index))
  await clearFilters()
  await expectedCards(Array.from({ length: 24 }, (_, index) => index))
  await assertShell()
  console.log('Desktop grid, always-visible title/hook search, folder filtering, combined filters, sort and page reset pass')

  const menu = await openActions(0)
  await assertActionLinks(menu, 0)
  await capture('desktop-actions')
  const downloadLink = await downloadChoice(menu)
  const downloaded = page.waitForEvent('download')
  await downloadLink.click()
  const download = await downloaded
  assert.ok(download.suggestedFilename().endsWith('.mp4'), 'Download uses the real mocked video URL')
  await download.cancel()
  await openActions(0)
  await desktopMenu.getByText(/^Move to/).first().click()
  failNextMove = true
  const failedMove = page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname === `/api/projects/${ownerId}/clips/${clipId(0)}`)
  await page.locator(`[data-clip-move-target="${folders[1].id}"]`).click()
  assert.equal((await failedMove).status(), 503)
  await page.getByRole('alert').filter({ hasText: 'The change could not be saved.' }).waitFor()
  assert.equal(await desktopMenu.isVisible(), true, 'A failed move keeps the actions menu open')
  assert.equal(await page.locator(`[data-clip-move-target="${folders[1].id}"]`).isVisible(), true, 'A failed move keeps its target submenu available for retry')
  assert.equal(moves.length, 0, 'A failed move leaves the clip in its original folder')
  const moved = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/projects')
  await page.locator(`[data-clip-move-target="${folders[1].id}"]`).click()
  await page.waitForFunction(() => !document.querySelector('[data-clip-actions="desktop"]'))
  await moved
  assert.deepEqual(moves.at(-1), { id: clipId(0), folderId: folders[1].id })
  await dismissToasts()
  await openActions(1)
  const deleted = page.waitForResponse(response => response.request().method() === 'DELETE' && new URL(response.url()).pathname === `/api/clips/${clipId(1)}`)
  await desktopMenu.getByText('Delete', { exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click()
  assert.equal((await deleted).status(), 200)
  await card(1).waitFor({ state: 'detached' })
  assert.deepEqual(deletes, [clipId(1)])
  await dismissToasts()
  await assertShell()

  await openActions(0)
  await desktopMenu.locator('a').filter({ hasText: 'Publish' }).click()
  await page.locator('[data-post-composer]').waitFor()
  await page.waitForURL(url => url.pathname.endsWith('/dashboard/publish/new') && url.searchParams.get('clip') === clipId(0))
  await assertShell()
  await page.goBack()
  await workspace.waitFor()
  await card(0).waitFor()
  await assertShell()
  console.log('Desktop actions expose Studio/publish/download links; synthetic download, move failure/retry, delete and Publish route preserve the shell')

  await page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click()
  await rememberShell()
  await page.setViewportSize({ width: 900, height: 1000 })
  await rememberShell()
  await workspace.locator('[data-workspace-mobile-header]').waitFor({ state: 'visible' })
  assert.equal(await workspace.locator('[data-clips-projects]').isVisible(), false, 'Tablet replaces the project rail with its selector')
  await page.getByRole('link', { name: 'Next', exact: true }).click()
  await assertQuery({ page: '2' })
  await submitSearch('perspective')
  await pickProject(folders[0].name)
  await assertQuery({ search: 'perspective', page: null })
  await expectedCards(allClips.map((_, index) => index).filter(index => project.clips.some(clip => clip.id === clipId(index) && clip.folderId === folders[0].id)))
  await submitSearch('')
  await search.waitFor({ state: 'visible' })
  await noOverflow('Tablet project selector')
  await assertShell()
  await capture('tablet-clips')
  await pickProject('All clips')
  await page.setViewportSize({ width: 390, height: 844 })
  await rememberShell()
  await search.waitFor({ state: 'visible' })
  await noOverflow('Mobile clips grid')
  await capture('mobile-clips-after-actions')
  await pickProject(folders[0].name)
  const mobileFolderIds = allClips.map((_, index) => index).filter(index => project.clips.some(clip => clip.id === clipId(index) && clip.folderId === folders[0].id))
  await expectedCards(mobileFolderIds)
  await search.waitFor({ state: 'visible' })
  await filterBy('Subtitles', 'With subtitles')
  await expectedCards(mobileFolderIds.filter(index => allClips[index].hasSubtitles))
  await noOverflow('Mobile combined controls')
  await capture('mobile-filters')
  await clearFilters()
  await pickProject('All clips')
  await card(0).waitFor()
  const sheet = await openActions(0, true)
  await assertActionLinks(sheet, 0)
  await downloadChoice(sheet)
  await sheet.getByRole('button', { name: 'Download', exact: true }).click()
  await noOverflow('Mobile clip actions')
  const bounds = await sheet.boundingBox()
  assert.ok(bounds && bounds.width >= 388 && bounds.y > 0, 'Mobile clip actions open as a bottom sheet')
  await capture('mobile-actions')
  await sheet.getByText(/^Move to/).first().click()
  const mobileMoved = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/projects')
  await page.locator('[data-clip-move-target="root"]').click()
  await mobileMenu.waitFor({ state: 'hidden' })
  await mobileMoved
  assert.deepEqual(moves.at(-1), { id: clipId(0), folderId: null })
  await dismissToasts()
  await assertShell()
  await page.setViewportSize({ width: 320, height: 780 })
  await rememberShell()
  await search.waitFor({ state: 'visible' })
  await noOverflow('320px clips layout')
  await openActions(0, true)
  await noOverflow('320px clip actions')
  await page.keyboard.press('Escape')
  await mobileMenu.waitFor({ state: 'hidden' })
  await assertShell()
  assert.deepEqual(blockedMutations, [], 'No API mutations escaped the explicit synthetic fixture handlers')
  assert.equal(moves.length, 2)
  assert.deepEqual(failedMoves, [{ id: clipId(0), folderId: folders[1].id }], 'One explicit synthetic move failure is retried successfully')
  assert.equal(deletes.length, 1)
  assert.deepEqual(folderChanges, [], 'Clip interactions do not unexpectedly change project folders')
  assert.deepEqual(errors, [], 'No browser runtime or console errors')
  console.log('Mobile grid, folder selector, filters and action sheet pass without horizontal overflow')
  console.log('Clips layout browser checks passed (mocked APIs only)')
} catch (error) {
  await capture('failure').catch(() => {})
  throw error
} finally {
  await browser.close()
}
