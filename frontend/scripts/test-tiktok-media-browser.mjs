import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Every API request is intercepted; no real account or social post is used.
const base = process.env.SNEEPCUT_BROWSER_URL ?? 'http://localhost:3000'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const locale = new URL(base).pathname.startsWith('/ro') ? 'ro' : 'en'
const messages = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'))
const calendar = messages.contentCalendar
const publishing = messages.publishing
const output = 'test-results/tiktok-media'
await mkdir(output, { recursive: true })
const user = { id: '33333333-3333-4333-8333-333333333333', name: 'TikTok Fixture', email: 'tiktok@example.invalid', credits: 100, plan: 'free', access_role: 'member' }
const account = { id: '11111111-1111-4111-8111-111111111111', provider: 'tiktok', name: 'TikTok Fixture', status: 'connected' }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const image = name => ({ name, mimeType: 'image/png', buffer: png })
const errors = []
const saves = []
let uploadCount = 0
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
await context.route(/\/(?:api|v1)\//, async route => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  const json = (body, status = 200) => route.fulfill({ json: body, status })
  if (path.startsWith('/v1/auth/')) return json({ access_token: 'synthetic-token', user })
  if (path === '/api/user/profile') return json({ profile: user })
  if (path === '/api/user/credits') return json({ credits: 100, plan: 'free' })
  if (path === '/api/publishing') return json({ providers: [{ id: 'tiktok', name: 'TikTok', configured: true, supportsPublishing: true }], accounts: [account], clips: [], posts: [] })
  if (path.includes('/options')) return json({ privacyLevels: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'], commentDisabled: false, duetDisabled: false, stitchDisabled: false, maxDuration: 600, nickname: 'TikTok Fixture' })
  if (path === '/api/calendar' && request.method() === 'GET') return json({ posts: [], clips: [], meta: { truncated: false } })
  if (path === '/api/calendar' && request.method() === 'POST') {
    const payload = request.postDataJSON()
    saves.push(payload)
    return json({ post: { ...payload, status: payload.status === 'publish' ? 'scheduled' : payload.status, id: '22222222-2222-4222-8222-222222222222', clip: null, publishingDestinations: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }, 201)
  }
  if (path === '/api/publishing/media' && request.method() === 'POST') {
    const name = /filename="([^"]+)"/.exec(request.postDataBuffer().toString())?.[1]
    assert.ok(name)
    return json({ type: name.endsWith('.webm') ? 'video' : 'image', name, reference: `publishing/${user.id}/${++uploadCount}-${name}`, size: png.length }, 201)
  }
  if (path === '/api/publishing/media/preview') return json({ url: `data:image/png;base64,${png.toString('base64')}` })
  return json({ error: `Unexpected fixture route ${path}` }, 404)
})
const page = await context.newPage()
page.setDefaultTimeout(30000)
page.on('pageerror', error => errors.push(error.message))
async function openForm(title) {
  await page.evaluate(() => {
    window.fixtureShell = document.getElementById('dashboard-shell')
    window.fixtureSidebar = document.querySelector('[data-sidebar="sidebar"]')
    window.fixtureHeader = document.querySelector('.studio-topbar')
    window.fixtureSidebarState = document.querySelector('[data-sidebar="trigger"]')?.getAttribute('aria-expanded')
  })
  await page.getByRole('button', { name: calendar.actions.newPost, exact: true }).first().click()
  const dialog = page.getByRole('region', { name: new RegExp(`${messages.contentCalendar?.dialog.createTitle ?? messages.dialog?.createTitle}|${messages.contentCalendar?.dialog.editTitle ?? messages.dialog?.editTitle}`) })
  await dialog.getByLabel(calendar.form.titleLabel, { exact: true }).fill(title)
  assert.match(new URL(page.url()).pathname, /\/dashboard\/publish\/new$/)
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(await page.evaluate(() =>
    window.fixtureShell === document.getElementById('dashboard-shell') &&
    window.fixtureSidebar === document.querySelector('[data-sidebar="sidebar"]') &&
    window.fixtureHeader === document.querySelector('.studio-topbar') &&
    window.fixtureSidebarState === document.querySelector('[data-sidebar="trigger"]')?.getAttribute('aria-expanded') &&
    !document.getElementById('dashboard-shell').hasAttribute('inert')
  ), true, 'Navigation preserves the mounted dashboard shell and sidebar state')
  const accountButton = dialog.getByRole('button', { name: /TikTok Fixture/ })
  if (await accountButton.getAttribute('aria-pressed') !== 'true') await accountButton.click()
  await dialog.getByLabel(publishing.privacy, { exact: true }).selectOption('SELF_ONLY')
  await dialog.getByRole('checkbox').check()
  await dialog.getByLabel(calendar.form.statusLabel, { exact: true }).click()
  await page.getByRole('option', { name: calendar.statuses.publish, exact: true }).click()
  return dialog
}
try {
  await page.goto(`${base}/dashboard/publish`, { waitUntil: 'networkidle', timeout: 120000 })
  let dialog = await openForm('One TikTok image')
  await dialog.locator('input[type="file"]').setInputFiles(image('logo.png'))
  await dialog.getByRole('list').locator('li').waitFor()
  assert.equal(await dialog.getByRole('switch', { name: publishing.duet, exact: true }).count(), 0)
  await dialog.getByRole('switch', { name: `${publishing.autoAddMusic} ${publishing.autoAddMusicHint}`, exact: true }).click()
  await page.evaluate(() => window.scrollTo(0, 0))
  const platformsCard = await dialog.locator('aside').boundingBox()
  const titleInput = await dialog.getByLabel(calendar.form.titleLabel, { exact: true }).boundingBox()
  assert.ok(platformsCard.x + platformsCard.width < titleInput.x, 'Platforms have a separate left card')
  await page.screenshot({ path: `${output}/photo-desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
  await page.screenshot({ path: `${output}/photo-mobile.png`, fullPage: true })
  await dialog.getByRole('button', { name: calendar.actions.create, exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(saves[0].media.length, 1)
  assert.ok(!saves[0].clipId)
  assert.ok(!saves[0].caption)
  assert.equal(saves[0].tiktok.privacyLevel, 'SELF_ONLY')
  assert.equal(saves[0].tiktok.photoTitle, 'One TikTok image')
  assert.equal(saves[0].tiktok.autoAddMusic, true)
  await page.setViewportSize({ width: 1440, height: 1000 })
  dialog = await openForm('35 TikTok images')
  await dialog.locator('input[type="file"]').setInputFiles(Array.from({ length: 35 }, (_, i) => image(`photo-${i}.png`)))
  await dialog.getByRole('list').locator('li').nth(34).waitFor()
  await dialog.getByRole('button', { name: calendar.actions.create, exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(saves[1].media.length, 35)
  assert.equal(saves[1].media[34].name, 'photo-34.png')
  dialog = await openForm('Uploaded TikTok video')
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'upload.webm', mimeType: 'video/webm', buffer: Buffer.from('synthetic webm') })
  await dialog.getByRole('list').locator('li').waitFor()
  assert.equal(await dialog.getByRole('switch', { name: publishing.duet, exact: true }).count(), 1)
  await dialog.getByRole('button', { name: calendar.actions.create, exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(saves[2].media[0].type, 'video')
  assert.ok(!saves[2].clipId)
  assert.ok(!saves[2].caption)
  dialog = await openForm('Mixed TikTok media')
  await dialog.locator('input[type="file"]').setInputFiles([image('photo.png'), { name: 'video.webm', mimeType: 'video/webm', buffer: Buffer.from('synthetic webm') }])
  await dialog.getByRole('list').locator('li').nth(1).waitFor()
  await dialog.getByRole('button', { name: calendar.actions.create, exact: true }).click()
  await dialog.getByText(calendar.validation.mediaTikTokUnsupported, { exact: true }).waitFor()
  assert.equal(saves.length, 3)
  assert.deepEqual(errors, [])
  await writeFile(`${output}/report.json`, JSON.stringify({ passed: true, saves, runtimeErrors: errors }, null, 2))
  console.log('PASS TikTok PNG and 35 photos, title/music options, uploaded WebM, empty caption, no library clip, privacy consent, mobile layout, mixed-media rejection')
} catch (error) {
  console.error('Browser errors:', errors)
  console.error((await page.locator('body').innerText()).slice(-8000))
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {})
  throw error
} finally {
  await browser.close()
}
