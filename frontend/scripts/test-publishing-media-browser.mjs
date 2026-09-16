import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// All API traffic is intercepted. This fixture never uses a real account/database.
const base = process.env.SNEEPCUT_BROWSER_URL ?? 'http://localhost:3105/ro'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
const playwrightModule = process.env.PLAYWRIGHT_MODULE
const { chromium } = await import(playwrightModule ? pathToFileURL(playwrightModule).href : 'playwright')
const locale = new URL(base).pathname.startsWith('/ro') ? 'ro' : 'en'
const messages = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8')).contentCalendar
const formText = (key, name) => messages.form[key].replace('{name}', name ?? '')
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const output = 'test-results/publishing-media'
await mkdir(output, { recursive: true })
const user = { id: '33333333-3333-4333-8333-333333333333', name: 'Carousel Fixture', email: 'carousel@example.invalid', credits: 100, plan: 'free', access_role: 'member' }
const account = { id: '11111111-1111-4111-8111-111111111111', provider: 'instagram', name: 'Carousel Fixture', status: 'connected' }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
const imageFile = (name) => ({ name, mimeType: 'image/png', buffer: png })
const videoFile = { name: 'phone.MOV', mimeType: '', buffer: Buffer.from('synthetic video bytes') }
let saved = null
let uploads = 0
let rejectNextStatus = 0
const uploadGates = []
const errors = []
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', hasTouch: true })
await context.route(/\/(?:api|v1)\//, async route => {
  const req = route.request()
  const path = new URL(req.url()).pathname
  const json = (body, status = 200) => route.fulfill({ status, json: body })
  if(path.startsWith('/v1/auth/')) return json({ access_token: 'synthetic-access', user })
  if(path === '/api/user/profile') return json({ profile: user })
  if(path === '/api/user/credits') return json({ credits: 100, plan: 'free' })
  if(path === '/api/publishing') return json({ providers: [{ id: 'instagram', name: 'Instagram', configured: true, supportsPublishing: true }, { id: 'facebook', name: 'Facebook', configured: true, supportsPublishing: true }], accounts: [account], clips: [], posts: [] })
  if(path === '/api/calendar' && req.method() === 'GET') return json({ posts: saved ? [saved] : [], clips: [], meta: { truncated: false } })
  if(path === '/api/calendar' && req.method() === 'POST') {
    saved = { ...req.postDataJSON(), id: '22222222-2222-4222-8222-222222222222', clip: null, publishingDestinations: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    return json({ post: saved }, 201)
  }
  if(path === '/api/publishing/media' && req.method() === 'POST') {
    uploads++
    if(rejectNextStatus) { const status = rejectNextStatus; rejectNextStatus = 0; return json({ error: 'Unavailable' }, status) }
    if(uploadGates.length) await uploadGates.shift()
    const body = req.postDataBuffer()
    const name = /filename="([^"]+)"/.exec(body.toString())?.[1]
    assert.ok(name)
    assert.ok(body.includes(name.endsWith('.MOV') ? videoFile.buffer : png), 'Uploaded bytes are unchanged')
    return json({ type: name.endsWith('.MOV') ? 'video' : 'image', name, reference: `publishing/${user.id}/${uploads}-${name}` }, 201)
  }
  if(path === '/api/publishing/media/preview') return json({ url: `data:image/png;base64,${png.toString('base64')}` })
  return json({ error: `Unexpected fixture route: ${path}` }, 404)
})
const page = await context.newPage()
page.setDefaultTimeout(60000)
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto(`${base}/dashboard/publish`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.getByRole('button', { name: messages.actions.newPost, exact: true }).first().waitFor()
  await page.screenshot({ path: `${output}/initial.png`, fullPage: true })
  if(process.env.CAROUSEL_INSPECT === '1') process.exitCode = 0
  else {
    await page.getByRole('button', { name: messages.actions.newPost, exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    const input = dialog.locator('input[type="file"]')
    rejectNextStatus = 404
    await input.setInputFiles(imageFile('unavailable.png'))
    await dialog.getByRole('alert').waitFor()
    assert.equal(await dialog.getByRole('alert').innerText(), `unavailable.png: ${messages.validation.mediaTemporarilyUnavailable}`)
    const firstUpload = Promise.withResolvers()
    const secondUpload = Promise.withResolvers()
    uploadGates.push(firstUpload.promise, secondUpload.promise)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await input.setInputFiles([imageFile('first.png'), videoFile])
    const progress = dialog.getByRole('status').filter({ hasText: 'first.png' })
    await progress.waitFor()
    assert.equal(await input.isDisabled(), true)
    assert.match(await progress.innerText(), /1.*2/)
    const indicator = await progress.locator('img').boundingBox()
    assert.ok(indicator.width >= 80 && indicator.height >= 80, 'Upload indicator is prominent')
    await progress.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/uploading-desktop.png`, fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await progress.scrollIntoViewIfNeeded()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
    await page.screenshot({ path: `${output}/uploading-mobile.png`, fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1000 })
    firstUpload.resolve()
    const secondProgress = dialog.getByRole('status').filter({ hasText: 'phone.MOV' })
    await secondProgress.waitFor()
    assert.match(await secondProgress.innerText(), /2.*2/)
    assert.equal(await input.isDisabled(), true)
    secondUpload.resolve()
    await secondProgress.waitFor({ state: 'hidden' })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const list = dialog.getByRole('list', { name: formText('mediaOrder') })
    await list.locator('li').nth(1).waitFor()
    await list.scrollIntoViewIfNeeded()
    const drag = await page.getByRole('button', { name: formText('dragMedia', 'phone.MOV') }).boundingBox()
    const firstHandle = await page.getByRole('button', { name: formText('dragMedia', 'first.png') }).boundingBox()
    await page.mouse.move(drag.x + drag.width / 2, drag.y + drag.height / 2)
    await page.mouse.down()
    await page.mouse.move(firstHandle.x + firstHandle.width / 2, firstHandle.y + firstHandle.height / 2, { steps: 12 })
    await page.mouse.up()
    await page.waitForFunction(label => document.querySelector(`[aria-label="${label}"] li`)?.textContent.includes('phone.MOV'), formText('mediaOrder'))
    assert.equal(await list.getByRole('button').count(), 4, 'Only drag and remove controls remain')
    await page.getByRole('button', { name: formText('dragMedia', 'first.png'), exact: true }).press('Home')
    await page.getByRole('button', { name: formText('dragMedia', 'phone.MOV'), exact: true }).press('Home')
    assert.match(await list.locator('li').first().innerText(), /phone.MOV/)
    await input.setInputFiles(imageFile('added.png'))
    await list.locator('li').nth(2).waitFor()
    rejectNextStatus = 503
    await input.setInputFiles([imageFile('retry.png'), imageFile('kept.png')])
    await dialog.getByRole('alert').waitFor()
    assert.equal(await list.locator('li').count(), 4)
    assert.match(await dialog.getByRole('alert').innerText(), /retry.png/)
    await input.setInputFiles(imageFile('retry.png'))
    await list.locator('li').nth(4).waitFor()
    assert.equal(await input.inputValue(), '')
    await page.getByRole('button', { name: formText('dragMedia', 'retry.png'), exact: true }).press('ArrowUp')
    assert.match(await list.locator('li').nth(3).innerText(), /retry.png/)
    await page.getByRole('button', { name: formText('removeMedia', 'kept.png'), exact: true }).click()
    assert.equal(await list.locator('li').count(), 4)
    await input.setInputFiles(Array.from({ length: 7 }, (_, i) => imageFile(`limit-${i}.png`)))
    assert.match(await dialog.getByRole('alert').innerText(), /10/)
    assert.equal(await list.locator('li').count(), 4)
    // The surrounding form remains editable and the title survives reordering.
    await dialog.getByLabel(formText('titleLabel'), { exact: true }).fill('Mixed carousel fixture')
    await page.screenshot({ path: `${output}/desktop.png`, fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await list.locator('li').first().scrollIntoViewIfNeeded()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
    const touchFrom = await page.getByRole('button', { name: formText('dragMedia', 'phone.MOV') }).boundingBox()
    const touchTo = await page.getByRole('button', { name: formText('dragMedia', 'first.png') }).boundingBox()
    const cdp = await context.newCDPSession(page)
    const x = touchFrom.x + touchFrom.width / 2
    const y = touchFrom.y + touchFrom.height / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for(let step = 1; step <= 12; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (touchTo.y + touchTo.height / 2 - y) * step / 12 }] })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForFunction(label => document.querySelector(`[aria-label="${label}"] li`)?.textContent.includes('first.png'), formText('mediaOrder'))
    await cdp.detach()
    await page.screenshot({ path: `${output}/mobile.png`, fullPage: true })
    await page.getByRole('button', { name: formText('dragMedia', 'added.png'), exact: true }).press('Home')
    assert.match(await list.locator('li').first().innerText(), /added.png/)
    // Clear the previous limit error through a valid order change, then save.
    await page.getByRole('button', { name: messages.actions.create, exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(saved.media.map(item => item.name), ['added.png', 'first.png', 'phone.MOV', 'retry.png'])
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('button', { name: messages.preview.openAria.replace('{title}', saved.title), exact: true }).click()
    await dialog.waitFor()
    await dialog.locator('img').first().waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] img')].length === 3 && [...document.querySelectorAll('[role="dialog"] img')].every(img => img.complete && img.naturalWidth > 0))
    assert.match(await dialog.getByRole('list', { name: formText('mediaOrder') }).locator('li').first().innerText(), /added.png/)
    assert.deepEqual(errors, [])
    console.log('PASS large upload loader and per-file progress, desktop/mobile selection, append, partial failure, retry, mouse/touch/keyboard reorder, simplified controls, removal, limit, unchanged bytes, saved order and reopened previews')
    await writeFile(`${output}/report.json`, JSON.stringify({ passed: true, savedOrder: saved.media.map(item => item.name), runtimeErrors: errors }, null, 2))
  }
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(-7000))
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {})
  throw error
} finally {
  await browser.close()
}
