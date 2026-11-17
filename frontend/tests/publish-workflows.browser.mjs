import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { syntheticMp4Response, syntheticPng } from './fixtures/synthetic-media.mjs'

// Every request is synthetic. No authentication, upload, schedule, publish or
// deletion in this runner can reach the real API or a social provider.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
const theme = process.env.PUBLISH_THEME === 'dark' ? 'dark' : 'light'
const dark = theme === 'dark'
const output = new URL(`../test-results/publish-workflows${dark ? '-dark' : ''}/`, import.meta.url)
const messages = JSON.parse(await readFile(new URL('../messages/en.json', import.meta.url), 'utf8')).contentCalendar
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Europe/Bucharest', reducedMotion: 'reduce' })
const page = await context.newPage()
page.setDefaultTimeout(15000)
page.setDefaultNavigationTimeout(180000)
const errors = []
const writes = []
const blocked = []
const passed = []
const visualChecks = []
const contrastChecks = []

async function assertTextContrast(locator, label) {
  const ratio = await locator.evaluate(element => {
    const rgba = value => (value.match(/[\d.]+/g) || []).map(Number)
    const foreground = rgba(getComputedStyle(element).color)
    let ancestor = element
    let background
    while (ancestor) {
      const color = rgba(getComputedStyle(ancestor).backgroundColor)
      if (color.length >= 3 && (color[3] ?? 1) >= .99) { background = color; break }
      ancestor = ancestor.parentElement
    }
    if (!background) throw new Error('No opaque text background')
    const luminance = values => values.slice(0, 3).map(value => {
      const s = value / 255
      return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4
    }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
    const a = luminance(foreground), b = luminance(background)
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
  })
  assert.ok(ratio >= 4.5, `${label} contrast ${ratio.toFixed(2)} meets 4.5:1`)
  contrastChecks.push({ label, ratio: Number(ratio.toFixed(2)) })
}
page.on('pageerror', error => errors.push(error.message))
const uid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
const user = { id: uid(810), email: 'publish-workflows@example.invalid', name: 'Synthetic workspace', plan: 'pro', credits: 100, access_role: 'member' }
const providers = ['instagram', 'tiktok', 'youtube', 'facebook']
const accounts = providers.map((provider, index) => ({ id: uid(820 + index), provider, name: `Synthetic ${provider}`, username: 'synthetic', status: 'connected', scopes: ['video_publish', 'video.publish', 'instagram_business_content_publish'] }))
const future = new Date(Date.now() + 86400000 * 2)
const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(future)
const thumb = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600"><rect width="480" height="600" fill="#14544f"/><circle cx="250" cy="220" r="100" fill="#e5b77a"/><path d="M0 420L240 300 480 480V600H0Z" fill="#17322d"/></svg>').toString('base64')}`
const clip = { id: uid(830), title: 'Synthetic podcast', duration: 42, tiktokEligible: true, thumbnailUrl: thumb, fileUrl: `${origin}/__publish_test__/video.mp4`, captionInstagram: 'Synthetic caption', captionTiktok: 'Synthetic caption', captionYoutube: null }
const basePost = { title: 'Synthetic publishing story', caption: 'A carefully checked publishing flow.', notes: null, platforms: ['instagram'], accountIds: [accounts[0].id], scheduledAt: future.toISOString(), createdAt: future.toISOString(), updatedAt: future.toISOString(), clip, media: [], publishingDestinations: [], instagram: { commentEnabled: true, shareToFeed: true } }
const posts = new Map([[uid(840), { ...basePost, id: uid(840), status: 'draft' }]])
let uploadCount = 0
await context.route('**/v1/**', route => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
await context.route('**/__publish_test__/video.mp4', route => route.fulfill(syntheticMp4Response(route.request().headers().range)))
await context.route('**/api/**', async route => {
  const request = route.request()
  const url = new URL(request.url())
  const method = request.method()
  const json = (body, status = 200) => route.fulfill({ status, json: body })
  if (url.pathname === '/api/publishing') return json({ providers: providers.map(id => ({ id, name: id, configured: true, supportsPublishing: true, youtubeAuditApproved: true })), accounts, clips: [clip], posts: [] })
  if (url.pathname === '/api/calendar' && method === 'GET') {
    return json({ posts: [...posts.values()], clips: [clip] })
  }
  if ((url.pathname === '/api/calendar' && method === 'POST') || (url.pathname.startsWith('/api/calendar/') && method === 'PATCH')) {
    const body = request.postDataJSON()
    const id = method === 'POST' ? uid(850 + writes.length) : url.pathname.split('/').at(-1)
    assert.ok(method === 'POST' || posts.has(id), 'Only fixture posts can be changed')
    const status = body.status === 'publish' ? 'publishing' : body.status
    const post = { ...basePost, ...posts.get(id), ...body, id, status, clip: body.clipId ? clip : null, media: body.media || [], publishingDestinations: status === 'publishing' ? [{ provider: 'instagram', accountName: 'Synthetic Instagram', status: 'processing', createdAt: new Date().toISOString() }] : [] }
    posts.set(id, post)
    writes.push({ method, path: url.pathname, body, id })
    return json({ post })
  }
  if (url.pathname.startsWith('/api/calendar/') && method === 'DELETE') {
    const id = url.pathname.split('/').at(-1)
    assert.ok(posts.has(id), 'Only fixture posts can be deleted')
    writes.push({ method, path: url.pathname, body: request.postDataJSON(), id })
    posts.delete(id)
    return json({ deleted: true, deletedPlatforms: [] })
  }
  if (url.pathname === '/api/publishing/media' && method === 'POST') {
    uploadCount += 1
    return json({ type: 'image', reference: `publishing/${user.id}/image-${uploadCount}.png`, name: `image-${uploadCount}.png` })
  }
  if (method !== 'GET') {
    blocked.push(`${method} ${url.pathname}`)
    return json({ error: 'Blocked unexpected mutation' }, 405)
  }
  if (url.pathname === `/api/clips/${clip.id}`) return json({ id: clip.id, preview_url: clip.fileUrl, file_url: clip.fileUrl, thumbnail_url: thumb })
  if (url.pathname === '/api/publishing/media/preview') return json({ url: thumb })
  if (/\/accounts\/.*\/options$/.test(url.pathname)) return json({ privacyLevels: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], commentDisabled: false, duetDisabled: false, stitchDisabled: false, maxDuration: 600, nickname: 'Synthetic TikTok' })
  if (url.pathname === '/api/user/profile') return json({ profile: { ...user, image: null, provider: 'password', canChangePassword: true, recentlyAuthenticated: true, emailVerified: future.toISOString(), createdAt: future.toISOString() } })
  if (url.pathname === '/api/workspace-agent/runs') return json({ runs: [], has_more: false })
  if (url.pathname === '/api/workspace-agent/suggestions') return json({ suggestions: [], capabilities: [] })
  return json({})
})

const composer = page.locator('[data-post-composer]')
const caption = () => page.getByLabel(messages.composer.postText, { exact: true })
const media = () => page.getByRole('dialog', { name: messages.composer.mediaTitle, exact: true })
const photo = () => page.getByRole('dialog', { name: messages.imageEditor.title, exact: true })
async function capture(name) {
  await mkdir(output, { recursive: true })
  // Compare resting reference colors, not an incidental hover left by the
  // preceding click when a dialog or form action changes position.
  await page.mouse.move(0, 0)
  await page.waitForTimeout(200)
  const dialogOpen = await page.getByRole('dialog').count() > 0
  const mobile = page.viewportSize().width < 768
  const expectStyle = async (locator, expected, label) => {
    const actual = await locator.evaluate((element, properties) => {
      const style = getComputedStyle(element)
      return Object.fromEntries(properties.map(property => [property, style[property]]))
    }, Object.keys(expected))
    assert.deepEqual(actual, expected, `${name}: ${label}`)
    visualChecks.push(`${name}: ${label}`)
  }
  if (!dialogOpen && await composer.isVisible()) {
    await expectStyle(page.locator('#dashboard-main'), { backgroundColor: dark ? 'rgb(14, 19, 28)' : 'rgb(245, 247, 251)' }, 'themed canvas')
    await expectStyle(composer.locator('fieldset').first(), { backgroundColor: dark ? 'rgb(24, 31, 43)' : 'rgb(255, 255, 255)', borderRadius: mobile ? '20px' : '24px' }, 'themed account card')
    await expectStyle(composer.locator('textarea').first(), { backgroundColor: dark ? 'rgb(17, 24, 36)' : 'rgb(245, 247, 251)', borderRadius: mobile ? '14px' : '16px', borderTopWidth: '0px' }, 'themed inset text field')
    await expectStyle(composer.locator('button[type="submit"]'), { backgroundColor: dark ? 'rgb(122, 167, 255)' : 'rgb(37, 99, 235)', borderRadius: '999px' }, 'themed primary action')
    await expectStyle(composer.locator('footer'), { position: 'static', backgroundColor: dark ? 'rgb(24, 31, 43)' : 'rgb(255, 255, 255)', borderRadius: mobile ? '20px' : '24px', backdropFilter: 'none' }, 'actions follow the form in a themed card')
    if (dark) {
      await assertTextContrast(composer.locator('button[type="submit"]'), `${name}: primary action`)
      await assertTextContrast(composer.locator('textarea').first(), `${name}: caption`)
      await assertTextContrast(composer.locator('[class*="characterCount"]'), `${name}: character count`)
    }
    assert.ok(await composer.evaluate(element => getComputedStyle(element).fontFamily.includes('Inter Variable')), 'Reference Inter font is applied')
    if (mobile) assert.equal(await page.locator('[data-workspace-mobile-header] img:visible').getAttribute('src'), dark ? '/sneepcut-logo-white-text.svg' : '/sneepcut-logo.svg', 'Publish wordmark follows the active theme')
  }
  if (dialogOpen) {
    const dialog = page.getByRole('dialog').last()
    const fullscreen = mobile && (await dialog.getAttribute('data-post-media-dialog') !== null || await dialog.getAttribute('data-publishing-image-editor') !== null)
    if (fullscreen) await assertFullscreenDialog(dialog)
    if (mobile) {
      const bounds = await dialog.boundingBox()
      const viewport = page.viewportSize()
      assert.ok(bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, `${name}: dialog stays inside the phone viewport`)
    }
    await expectStyle(dialog, { backgroundColor: dark ? 'rgb(24, 31, 43)' : 'rgb(255, 255, 255)', borderTopLeftRadius: fullscreen ? '0px' : '28px', borderTopWidth: '0px' }, 'themed dialog surface')
    const backdrop = await dialog.evaluate(element => {
      const overlay = element.previousElementSibling
      return overlay ? { background: getComputedStyle(overlay).backgroundColor, blur: getComputedStyle(overlay).backdropFilter } : null
    })
    assert.deepEqual(backdrop, { background: dark ? 'rgba(0, 0, 0, 0.68)' : 'rgba(21, 32, 53, 0.45)', blur: 'none' }, 'Themed backdrop is tinted without blur')
    if (name.startsWith('options-youtube')) {
      const choice = dialog.getByRole('radio', { name: 'Unlisted', exact: true })
      const choiceStyle = await choice.evaluate(input => {
        const style = getComputedStyle(input.nextElementSibling)
        return { radius: style.borderRadius, background: style.backgroundColor, border: style.borderTopWidth, height: input.nextElementSibling.getBoundingClientRect().height }
      })
      assert.deepEqual(choiceStyle, { radius: '12px', background: dark ? 'rgb(17, 24, 36)' : 'rgb(245, 247, 251)', border: '0px', height: 44 }, 'Platform choices have themed inset surfaces')
      await expectStyle(dialog.getByRole('textbox').first(), { backgroundColor: dark ? 'rgb(17, 24, 36)' : 'rgb(245, 247, 251)', borderRadius: '14px', borderTopWidth: '0px' }, 'themed platform input')
      if (dark) await assertTextContrast(dialog.getByRole('textbox').first(), `${name}: provider input`)
    }
    if (name.startsWith('photo-')) {
      await expectStyle(dialog.locator('[data-publishing-image-preview]'), { borderRadius: '0px', outlineWidth: '2px', outlineColor: 'rgb(255, 255, 255)' }, 'square photo crop with white outline')
    }
  }
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: false })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name} has no horizontal overflow`)
}
async function openEditor(id = uid(840), query = '') {
  await page.goto(`${origin}/dashboard/publish/${id}/edit?date=${dateKey}${query}`, { waitUntil: 'networkidle' })
  await composer.waitFor()
}
async function openMedia() {
  await composer.getByRole('button', { name: messages.composer.changeMedia, exact: true }).click()
  await media().waitFor()
  if (page.viewportSize().width < 768) await assertFullscreenDialog(media())
}
async function assertFullscreenDialog(dialog) {
  const bounds = await dialog.boundingBox()
  const viewport = page.viewportSize()
  assert.ok(Math.abs(bounds.x) <= 1 && Math.abs(bounds.y) <= 1, 'Mobile dialog begins at the viewport origin, including in minified production CSS')
  assert.ok(Math.abs(bounds.width - viewport.width) <= 1 && Math.abs(bounds.height - viewport.height) <= 1, 'Mobile dialog fills the viewport')
}
async function assertFormActions(label) {
  const footer = composer.locator('footer')
  assert.equal(await footer.evaluate(element => element === element.parentElement.lastElementChild), true, `${label}: actions end the form`)
  const details = composer.locator('details')
  const wasOpen = await details.evaluate(element => element.open)
  await details.evaluate(element => { element.open = true })
  const preceding = await details.boundingBox()
  const actions = await footer.boundingBox()
  assert.ok(actions.y >= preceding.y + preceding.height, `${label}: actions follow all form fields`)
  await footer.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const assistant = page.locator('[data-agent-trigger]:visible')
  const assistantBounds = await assistant.count() ? await assistant.boundingBox() : null
  for (const button of await footer.getByRole('button').all()) {
    if (!await button.isVisible()) continue
    const bounds = await button.boundingBox()
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= page.viewportSize().height, `${label}: action is reachable`)
    assert.ok((await button.innerText()).trim(), `${label}: action retains a visible text label`)
    if (assistantBounds) {
      const overlaps = bounds.x < assistantBounds.x + assistantBounds.width && bounds.x + bounds.width > assistantBounds.x && bounds.y < assistantBounds.y + assistantBounds.height && bounds.y + bounds.height > assistantBounds.y
      assert.equal(overlaps, false, `${label}: assistant does not cover a form action`)
    }
  }
  await capture(`${label}-actions`)
  if (page.viewportSize().width < 768) {
    const bottomPosition = await footer.boundingBox()
    await page.evaluate(() => window.scrollTo(0, 0))
    const topPosition = await footer.boundingBox()
    assert.ok(topPosition.y > bottomPosition.y + 100, `${label}: actions scroll with the form`)
    assert.ok(topPosition.y > page.viewportSize().height, `${label}: actions do not overlay fields at the top`)
  }
  await details.evaluate((element, value) => { element.open = value }, wasOpen)
  await page.evaluate(() => window.scrollTo(0, 0))
}
async function openPhoto() {
  await media().getByRole('button', { name: /^Edit /i }).first().click()
  await photo().waitFor()
}
async function finishDialog(dialog) {
  await dialog.getByRole('button', { name: /^(Done|Gata)$/ }).last().click()
  await dialog.waitFor({ state: 'hidden' })
}
async function selectQueuePost(id) {
  const row = page.locator(`[data-publishing-post="${id}"]`)
  await row.waitFor({ state: 'attached' })
  if (!await row.isVisible()) await page.locator('[data-publishing-preview]').getByRole('button', { name: /^Back to / }).click()
  await row.click()
}

try {
  await page.addInitScript(value => localStorage.setItem('theme', value), theme)
  await openEditor()
  await caption().fill('Text retained through all focused views')
  const mediaRow = composer.getByRole('button', { name: messages.composer.changeMedia, exact: true })
  assert.equal(await mediaRow.locator('img, video').count(), 0, 'The Media card has no duplicate thumbnail')
  assert.equal(await mediaRow.locator('button').count(), 0, 'The Media row is one accessible control')
  await mediaRow.locator('strong').click()
  await media().waitFor()
  await media().getByRole('button', { name: 'Cancel', exact: true }).last().click()
  for (const key of ['Enter', 'Space']) {
    await mediaRow.focus()
    await mediaRow.press(key)
    await media().waitFor()
    await media().getByRole('button', { name: 'Cancel', exact: true }).last().click()
  }
  assert.equal(await caption().inputValue(), 'Text retained through all focused views')
  passed.push('The full Media row opens by text click, Enter and Space without a duplicate thumbnail')
  await assertFormActions('composer-desktop')
  await openMedia()
  await media().getByRole('tab', { name: 'From device', exact: true }).click()
  await media().locator('input[type="file"]').setInputFiles([
    { name: 'first.png', mimeType: 'image/png', buffer: syntheticPng },
    { name: 'second.png', mimeType: 'image/png', buffer: syntheticPng }
  ])
  await media().getByRole('button', { name: /^Edit /i }).first().waitFor()
  await openPhoto()
  await photo().getByRole('radio', { name: '4:5', exact: true }).click()
  const alt = photo().getByLabel(messages.imageEditor.altText, { exact: true })
  await alt.fill('Cancelled alternative text')
  await photo().getByRole('button', { name: 'Cancel', exact: true }).first().click()
  await openPhoto()
  assert.equal(await alt.inputValue(), '', 'Cancel restores photo metadata')
  await photo().getByRole('radio', { name: '4:5', exact: true }).click()
  await alt.fill('Accessible synthetic artwork')
  await photo().getByRole('slider', { name: messages.imageEditor.zoom, exact: true }).press('ArrowRight')
  await capture('photo-desktop')
  await finishDialog(photo())
  const handles = media().getByRole('button', { name: /reorder/i })
  await handles.first().press('End')
  await capture('media-device-desktop')
  await media().getByRole('button', { name: 'Use media', exact: true }).click()
  assert.equal(await caption().inputValue(), 'Text retained through all focused views')
  await composer.getByRole('button', { name: 'Save draft', exact: true }).click()
  await page.waitForURL(/\/dashboard\/publish(?:\?.*)?$/)
  assert.equal(writes.at(-1).body.media.length, 2)
  assert.equal(writes.at(-1).body.media[1].altText, 'Accessible synthetic artwork')
  assert.equal(writes.at(-1).body.media[1].crop.aspectRatio, '4:5')
  passed.push('Desktop photo edits: cancel, crop, zoom, alt text, keyboard reorder and persisted save')

  await openEditor()
  await composer.getByRole('tab', { name: 'Schedule', exact: true }).click()
  await composer.getByRole('button', { name: 'Schedule post', exact: true }).click()
  await page.waitForURL(/\/dashboard\/publish(?:\?.*)?$/)
  assert.equal(writes.at(-1).body.status, 'scheduled')
  passed.push('Synthetic scheduling saves selected date, media and account')

  await openEditor(uid(840), '&mode=publish')
  assert.equal(await composer.getByRole('tab', { name: 'Publish now', exact: true }).getAttribute('aria-selected'), 'true')
  const beforePublish = writes.length
  await composer.getByRole('button', { name: 'Publish now', exact: true }).click()
  await page.waitForURL(/\/dashboard\/publish(?:\?.*)?$/)
  assert.equal(writes.length, beforePublish + 1)
  assert.equal(writes.at(-1).body.status, 'publish')
  passed.push('Publish mode preserves validation and sends a single synthetic publish request')

  const published = posts.get(uid(840))
  posts.set(uid(840), { ...published, status: 'failed', publishingError: 'Synthetic account disconnected', publishingDestinations: [{ provider: 'instagram', accountName: 'Synthetic Instagram', status: 'failed', error: 'Synthetic account disconnected', createdAt: future.toISOString() }] })
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Resolve', exact: true }).click()
  await page.locator('[data-publishing-preview]').getByRole('button', { name: messages.preview.viewStatus, exact: true }).click()
  await capture('failed-post-desktop')
  await page.getByRole('dialog').getByRole('button', { name: messages.progress.close, exact: true }).last().click()
  passed.push('Failed-post resolution is reachable')

  await page.setViewportSize({ width: 390, height: 844 })
  posts.set(uid(840), { ...basePost, id: uid(840), scheduledAt: new Date().toISOString(), status: 'draft', media: [{ type: 'image', reference: `publishing/${user.id}/mobile.png`, name: 'mobile.png' }], clip: null })
  await openEditor()
  await openMedia()
  await openPhoto()
  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(viewport)
    for (const [format, expected] of [['1:1', 1], ['4:5', 0.8], ['1.91:1', 1.91]]) {
      await photo().getByRole('radio', { name: format, exact: true }).click()
      const bounds = await photo().locator('[data-publishing-image-preview]').boundingBox()
      assert.ok(Math.abs(bounds.width / bounds.height - expected) < 0.01, `Mobile crop preview preserves ${format}`)
      assert.ok(bounds.height <= Math.min(370, viewport.height * 0.5 - 50) + 1, 'Reference crop preview fits the phone height')
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await capture('photo-mobile')
  await finishDialog(photo())
  await media().getByRole('button', { name: 'Use media', exact: true }).click()
  await capture('composer-mobile')
  assert.equal(await page.locator('[data-mobile-dashboard-dock]').isVisible(), false, 'Workspace mobile header replaces the global dock')
  await assertFormActions('composer-mobile-draft')
  await composer.getByRole('tab', { name: messages.composer.modes.scheduled, exact: true }).click()
  await assertFormActions('composer-mobile-scheduled')
  for (const [field, name] of [[caption(), 'composer-caption-mobile'], [composer.getByRole('combobox', { name: messages.composer.timeZone, exact: true }), 'composer-scheduling-mobile']]) {
    await field.evaluate(element => element.scrollIntoView({ block: 'center' }))
    const bounds = await field.boundingBox()
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= page.viewportSize().height, `${name}: field is reachable without an action overlay`)
    await capture(name)
  }
  passed.push('Mobile focused photo and media editors return to the same draft')

  await page.goto(`${origin}/dashboard/publish`, { waitUntil: 'networkidle' })
  const mobileQueueRow = page.locator(`[data-publishing-post="${uid(840)}"]`)
  await mobileQueueRow.waitFor({ state: 'attached' })
  if (!await mobileQueueRow.isVisible()) await page.locator('[data-publishing-preview]').getByRole('button', { name: /^Back to / }).click()
  const queueHeading = await page.getByRole('heading', { name: messages.title, exact: true }).boundingBox()
  assert.equal(queueHeading.x, 16, 'Publish list uses a single 16px mobile gutter')
  await capture('queue-mobile')
  await selectQueuePost(uid(840))
  await capture('detail-mobile')
  await page.locator('[data-publishing-preview]').getByRole('button', { name: messages.actions.delete, exact: true }).first().click()
  const deletion = page.getByRole('dialog', { name: messages.dialog.deleteTitle, exact: true })
  await deletion.waitFor()
  await capture('delete-mobile')
  await deletion.getByRole('button', { name: messages.actions.confirmDelete, exact: true }).last().click()
  await deletion.waitFor({ state: 'hidden' })
  assert.equal(posts.has(uid(840)), false)
  passed.push('Mobile detail and confirmed synthetic deletion')

  // Provider status screens are driven by actual destination stages, without
  // inventing completion percentages or contacting an external platform.
  for (const status of ['publishing', 'published']) {
    posts.set(uid(860), { ...basePost, id: uid(860), scheduledAt: new Date().toISOString(), status, publishingDestinations: [{
      provider: 'instagram', accountName: 'Synthetic Instagram', status: status === 'publishing' ? 'processing' : 'published',
      createdAt: new Date().toISOString(), ...(status === 'published' ? { url: 'https://example.invalid/synthetic-post' } : {})
    }] })
    await page.reload({ waitUntil: 'networkidle' })
    await selectQueuePost(uid(860))
    await page.locator('[data-publishing-preview]').getByRole('button', { name: messages.preview.viewStatus, exact: true }).click()
    const statusDialog = page.getByRole('dialog')
    if (status === 'publishing') assert.equal(await statusDialog.getByRole('progressbar').getAttribute('aria-valuenow'), null)
    else assert.equal(await statusDialog.getByRole('link', { name: 'Open on Instagram', exact: true }).getAttribute('href'), 'https://example.invalid/synthetic-post')
    await capture(`${status}-mobile`)
    await statusDialog.getByRole('button', { name: messages.progress.close, exact: true }).last().click()
  }
  passed.push('Mobile processing and success dialogs expose real stage and provider link')

  posts.set(uid(840), { ...basePost, id: uid(840), status: 'draft' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openEditor()
  for (const account of accounts.slice(1)) await composer.locator(`[data-composer-account="${account.id}"]`).click()
  await composer.getByRole('button', { name: 'Platform options', exact: true }).click()
  const options = page.getByRole('dialog', { name: 'Platform options', exact: true })
  for (const name of ['TikTok', 'YouTube', 'Instagram', 'Facebook']) {
    await options.getByRole('tab', { name, exact: true }).click()
    await capture(`options-${name.toLowerCase()}-desktop`)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await options.getByRole('tab', { name: 'YouTube', exact: true }).click()
  await capture('options-youtube-mobile')
  await options.getByRole('button', { name: 'Cancel', exact: true }).last().click()
  assert.equal(await caption().inputValue(), basePost.caption)
  passed.push('All four provider option screens are reachable on desktop and mobile without losing draft text')

  const romanian = JSON.parse(await readFile(new URL('../messages/ro.json', import.meta.url), 'utf8')).contentCalendar
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${origin}/ro/dashboard/publish/${uid(840)}/edit?date=${dateKey}`, { waitUntil: 'networkidle' })
  await page.getByLabel(romanian.composer.postText, { exact: true }).fill('3 greșeli pe care le-am făcut la primul podcast 🎙️ #podcast')
  await capture('composer-ro-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await capture('composer-ro-mobile')
  passed.push('Romanian desktop/mobile labels and text editing render correctly')

  assert.deepEqual(blocked, [], 'No unexpected or real mutations')
  assert.deepEqual(errors, [], 'No uncaught browser errors')
  await writeFile(new URL('report.json', output), JSON.stringify({ origin, theme, passed, visualChecks, contrastChecks, writes: writes.map(({ method, path, body }) => ({ method, path, status: body.status })), errors }, null, 2))
  console.log(passed.join('\n'))
} catch (error) {
  console.error(JSON.stringify({ url: page.url(), errors, body: (await page.locator('body').innerText().catch(() => '')).slice(0, 500) }))
  console.error(JSON.stringify(await page.getByRole('dialog').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element)
    return { className: element.className, rect: element.getBoundingClientRect().toJSON(), position: style.position, top: style.top, left: style.left, transform: style.transform, translate: style.translate }
  }))))
  await capture('failure').catch(() => {})
  throw error
} finally {
  await context.close()
  await browser.close()
}
