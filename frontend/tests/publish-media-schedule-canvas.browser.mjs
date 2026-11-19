import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Canvas coverage for the Publish media chooser, composer schedule and footer actions.
// Every API response is synthetic: mutations are captured and answered by the mock, never sent to a backend.
if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
const output = new URL('../test-results/publish-media-schedule-canvas/', import.meta.url)
const timeZone = 'Europe/Bucharest'
const user = {
  id: '00000000-0000-4000-8000-000000000093',
  email: 'publish-media-schedule-canvas@example.invalid', name: 'Design Workspace',
  plan: 'pro', credits: 100, access_role: 'member'
}
const account = {
  id: '00000000-0000-4000-8000-000000000310', provider: 'instagram', name: 'Synthetic Instagram',
  username: 'sneepcutstudio', status: 'connected',
  scopes: ['video_publish', 'video.publish', 'instagram_business_content_publish']
}
const titles = ['A new perspective', 'Behind the scenes', 'Made for your next story', 'Street details', 'Morning routine', 'Small moments']
const clipId = index => `00000000-0000-4000-8000-0000000004${index}0`
const thumbnail = index => `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><rect width="360" height="640" fill="#282320"/><circle cx="${250 - index * 8}" cy="300" r="45" fill="#ffe1a1"/></svg>`
).toString('base64')}`
const clips = titles.map((title, index) => ({
  id: clipId(index), title, duration: [28, 35, 42, 21, 32, 18][index], viralScore: 8,
  tiktokEligible: true, thumbnailUrl: thumbnail(index),
  fileUrl: `${origin}/__publish-media-fixture__/original.mp4`,
  captionInstagram: 'A different perspective. Inside our creative studio.',
  captionTiktok: 'A different perspective. Inside our creative studio.', captionYoutube: null
}))
const videoUrl = `${origin}/__publish-media-fixture__/preview.mp4`
const video = Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANzbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAp50cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAFoAAACgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAIWbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAUABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABwW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAYFzdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAFoAoABIAAAASAAAAAAAAAABFExhdmM2My4xLjEwMiBsaWJ4MjY0AAAAAAAAAAAAAAAAGP//AAAAL2F2Y0MBQsAK/+EAGGdCwAraGFeTwEQAAAMABAAAAwBQPEiagAEABGjOD8gAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAD8AAAAAAAAAAYc3R0cwAAAAAAAAABAAAAFAAABAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAFAAAAAEAAABkc3RzegAAAAAAAAAAAAAAFAAAAD4AAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAAFHN0Y28AAAAAAAAAAQAAA6MAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYzLjEuMTAyAAAACGZyZWUAAAEEbWRhdAAAADpliIQ6EYoAAi7xwY+Tk5OTk6666666666666666666666666666666666666666666666666666668AAAABkGaID6B7AAAAAZBmkA+gewAAAAGQZpgPoHsAAAABkGagBCgewAAAAZBmqAQoHsAAAAGQZrAEKB7AAAABkGa4BCgewAAAAZBmwAQoHsAAAAGQZsgEKB7AAAABkGbQBCgewAAAAZBm2AQoHsAAAAGQZuAEKB7AAAABkGboBCgewAAAAZBm8AQoHsAAAAGQZvgEKB7AAAABkGaABCgewAAAAZBmiAQoHsAAAAGQZpAEKB7AAAABkGaYBCgew==', 'base64')
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDKsAAAAASUVORK5CYII=', 'base64')
const uploadReference = `publishing/${user.id}/synthetic-upload.png`
const planned = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()

const dimensions = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }
const schemes = ['light', 'dark']
const results = []

async function runScenario(browser, label, viewport, colorScheme) {
  const context = await browser.newContext({ viewport, timeZone, colorScheme, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(30000)
  const errors = []
  const mutations = []
  const uploads = []
  let nextIndex = 0
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  await context.route('**/v1/**', route => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
  await context.route('**/__publish-media-fixture__/preview.mp4', route => route.fulfill({ contentType: 'video/mp4', body: video }))
  await context.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    if (url.pathname === '/api/publishing' && method === 'GET') {
      return route.fulfill({ json: {
        providers: ['instagram'].map(id => ({ id, name: 'Instagram', configured: true, supportsPublishing: true })),
        accounts: [account], clips, posts: []
      } })
    }
    if (url.pathname === '/api/calendar' && method === 'GET') return route.fulfill({ json: { posts: [], clips } })
    if (url.pathname === '/api/calendar' && method === 'POST') {
      const body = request.postDataJSON()
      const id = `00000000-0000-4000-8000-0000000005${nextIndex++}0`
      mutations.push({ method, id, body })
      return route.fulfill({ json: { post: {
        ...body, id, clip: clips.find(item => item.id === body.clipId) ?? null,
        media: body.media ?? [], publishingDestinations: [], createdAt: planned, updatedAt: planned
      } } })
    }
    if (url.pathname === '/api/publishing/media' && method === 'POST') {
      uploads.push(url.pathname)
      return route.fulfill({ json: { type: 'image', reference: `${uploadReference}-${uploads.length}`, name: 'synthetic-upload.png' } })
    }
    if (method !== 'GET') return route.fulfill({ status: 405, json: { error: 'Unexpected synthetic write blocked' } })
    const clip = clips.find(item => url.pathname === `/api/clips/${item.id}`)
    if (clip) return route.fulfill({ json: { id: clip.id, preview_url: videoUrl, file_url: clip.fileUrl, thumbnail_url: clip.thumbnailUrl } })
    if (url.pathname === '/api/publishing/media/preview') return route.fulfill({ json: { url: thumbnail(0) } })
    if (url.pathname === '/api/user/profile') return route.fulfill({ json: { profile: { ...user, image: null, provider: 'password', canChangePassword: true, recentlyAuthenticated: true, emailVerified: planned, createdAt: planned } } })
    if (url.pathname.startsWith('/api/workspace-agent/')) return route.fulfill({ json: { runs: [], suggestions: [], capabilities: [], has_more: false } })
    return route.fulfill({ json: {} })
  })

  const root = page.locator('[data-post-composer]')
  const preview = page.locator('[data-composer-preview]')
  const caption = page.getByLabel('Post text', { exact: true })
  const mediaDialog = page.getByRole('dialog', { name: 'Media', exact: true })
  const modeTab = name => root.getByRole('tab', { name, exact: true })
  const clipButton = title => mediaDialog.getByRole('button').filter({ hasText: title })
  const back = root.getByRole('button', { name: 'Back to publishing', exact: true })
  // The media row carries the accessible name; the preview's own change button is a visual duplicate.
  const changeMedia = root.locator('button[aria-label="Change media"]')

  async function openComposer(path = '/dashboard/publish/new') {
    await page.goto(`${origin}${path}`, { waitUntil: 'load', timeout: 180000 })
    await root.waitFor()
  }
  async function openMedia() {
    await changeMedia.click()
    await mediaDialog.waitFor()
  }
  async function chooseClip(title) {
    await openMedia()
    await mediaDialog.getByRole("tab", { name: "My clips", exact: true }).click()
    await clipButton(title).click()
    await mediaDialog.getByRole('button', { name: 'Use clip', exact: true }).click()
    await mediaDialog.waitFor({ state: 'hidden' })
  }
  async function setTime(hour, minute) {
    await root.getByRole('button', { name: 'Time', exact: true }).click()
    if (viewport.width < 768) {
      const sheet = page.getByRole('dialog', { name: 'Date and time', exact: true })
      await sheet.waitFor()
      await sheet.getByLabel('Hour', { exact: true }).selectOption(hour)
      await sheet.getByLabel('Minute', { exact: true }).selectOption(minute)
      await sheet.getByRole('button', { name: 'Done', exact: true }).click()
    } else {
      const panel = page.locator('[data-schedule-picker-panel]')
      await panel.waitFor()
      await panel.getByRole('group', { name: 'Hour', exact: true }).getByRole('button', { name: hour, exact: true }).click()
      await panel.getByRole('group', { name: 'Minute', exact: true }).getByRole('button', { name: minute, exact: true }).click()
      await panel.getByRole('button', { name: 'Done', exact: true }).click()
    }
    await page.locator('[data-schedule-picker-panel]').waitFor({ state: 'hidden' })
    assert.equal(await root.getByRole('button', { name: 'Time', exact: true }).innerText(), `${hour}:${minute}`)
  }
  async function pickDay(dayOfMonth) {
    await root.getByRole('button', { name: 'Date', exact: true }).click()
    if (viewport.width < 768) {
      const sheet = page.getByRole('dialog', { name: 'Date and time', exact: true })
      await sheet.waitFor()
      await sheet.locator('button[aria-pressed][data-outside="false"]').filter({ hasText: new RegExp(`^${dayOfMonth}$`) }).first().click()
      await sheet.getByRole('button', { name: 'Done', exact: true }).click()
    } else {
      const panel = page.locator('[data-schedule-picker-panel]')
      await panel.waitFor()
      await panel.locator('button[data-outside="false"]').filter({ hasText: new RegExp(`^${dayOfMonth}$`) }).first().click()
    }
    await page.locator('[data-schedule-picker-panel]').waitFor({ state: 'hidden' })
  }
  async function assertFits(locator, label) {
    const box = await locator.boundingBox()
    assert.ok(box, `${label} is rendered`)
    assert.ok(box.x >= -1 && box.x + box.width <= viewport.width + 1, `${label} stays inside the viewport`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${label}: no horizontal overflow`)
  }
  async function screenshot(name) {
    await mkdir(output, { recursive: true })
    await page.waitForLoadState('load')
    await page.screenshot({ path: fileURLToPath(new URL(`${label}-${name}.png`, output)) })
  }

  try {
    // Entry: media section visible on desktop and phone; back control and account selection.
    await openComposer()
    const mediaSection = root.getByRole('region', { name: 'Media', exact: true })
    assert.equal(await mediaSection.isVisible(), true, 'Media section is visible on every viewport')
    assert.equal(await back.isVisible(), true, 'Back control is present')
    assert.equal(await back.locator('span').isVisible(), viewport.width < 768, 'Back control shows its text only on phones')
    await assertFits(root, 'Composer')
    await caption.fill('A reference caption for the canvas composer.')
    await screenshot('composer')

    // Media chooser: tabs, search, paging, clip choice, cancel and the device tab.
    await openMedia()
    if (viewport.width < 768) {
      const box = await mediaDialog.boundingBox()
      assert.ok(box.y > 0, 'Phone media chooser opens as a sheet')
    } else {
      const box = await mediaDialog.boundingBox()
      assert.ok(box.width <= 561, 'Desktop media chooser keeps the reference width')
    }
    await mediaDialog.getByRole('tab', { name: 'My clips', exact: true }).click()
    await mediaDialog.getByRole('searchbox', { name: 'Search clips', exact: true }).fill('Street details')
    await clipButton('Street details').waitFor()
    assert.equal(await clipButton('A new perspective').count(), 0, 'Clip search filters the grid')
    await mediaDialog.getByRole('searchbox', { name: 'Search clips', exact: true }).fill('')
    await mediaDialog.getByRole('button', { name: 'Next clips page', exact: true }).click()
    await clipButton('Small moments').waitFor()
    await mediaDialog.getByRole('button', { name: 'Previous clips page', exact: true }).click()
    await clipButton('Street details').click()
    await screenshot('media-clips')
    // Phones dismiss with the close control; the reference hides the footer Cancel there.
    await mediaDialog.getByRole('button', { name: viewport.width < 768 ? 'Close media picker' : 'Cancel', exact: true }).click()
    await mediaDialog.waitFor({ state: 'hidden' })
    assert.equal(await root.getByText('Street details', { exact: true }).count(), 0, 'Cancel discards the pending clip choice')

    // Chosen clip shows in the row with its duration chip.
    await chooseClip('Street details')
    assert.equal(await changeMedia.getByText('Street details', { exact: true }).count(), 1, 'Media row names the chosen clip')
    assert.equal(await preview.locator('[data-brand-social-overlay]').count() >= 0, true)

    // Device tab: file input upload and a synthetic drag-and-drop both post to the media API.
    await openMedia()
    await mediaDialog.getByRole('tab', { name: 'From device', exact: true }).click()
    await mediaDialog.locator('input[type="file"]').first().setInputFiles({ name: 'synthetic-upload.png', mimeType: 'image/png', buffer: image })
    await mediaDialog.getByRole('button', { name: 'Use media', exact: true }).click()
    await mediaDialog.waitFor({ state: 'hidden' })
    assert.equal(uploads.length, 1, 'File input upload posts to the media API')
    await preview.locator('img:not([data-platform-mark])').first().waitFor()

    await openMedia()
    await mediaDialog.getByRole('tab', { name: 'From device', exact: true }).click()
    const dropZone = mediaDialog.locator('[data-media-drop-zone]')
    await dropZone.evaluate(element => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'dropped.png', { type: 'image/png' }))
      element.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    })
    await mediaDialog.getByText('Drop files here', { exact: true }).waitFor()
    assert.equal(await dropZone.getAttribute('data-dragging'), 'true', 'Dragging files shows the drop overlay')
    await dropZone.evaluate(element => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'dropped.png', { type: 'image/png' }))
      element.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    })
    await page.waitForTimeout(300)
    assert.equal(uploads.length, 2, 'Dropped files post to the media API')
    await mediaDialog.getByRole('button', { name: 'Use media', exact: true }).click()
    await mediaDialog.waitFor({ state: 'hidden' })

    // Dismiss the chooser with its close control (the only close control on phones).
    await openMedia()
    await mediaDialog.getByRole('button', { name: 'Close media picker', exact: true }).click()
    await mediaDialog.waitFor({ state: 'hidden' })
    await chooseClip('Behind the scenes')
    await setAccountCheck()

    // Mode control: draft, schedule (date, time, zone), publish now.
    await modeTab('Schedule').click()
    await pickDay(10)
    const scheduleDay = Number(await root.getByRole('button', { name: 'Date', exact: true }).innerText().then(text => text.match(/\d+/)[0]))
    assert.equal(scheduleDay, 10, 'Date picker sets the chosen day')
    await setTime('18', '30')
    await screenshot('schedule')
    if (viewport.width >= 768) {
      await root.getByRole('combobox', { name: 'Time zone', exact: true }).click()
      await page.getByRole('option', { name: 'UTC', exact: true }).click()
    }
    await assertFits(root, 'Composer schedule')
    await root.getByRole('button', { name: 'Schedule post', exact: true }).click()
    await page.waitForURL(/\/dashboard\/publish(\?|$)/)
    const scheduled = mutations.at(-1)
    assert.equal(scheduled.body.status, 'scheduled')
    if (viewport.width >= 768) {
      assert.equal(new Date(scheduled.body.scheduledAt).toISOString().slice(11, 16), '18:30', 'Chosen UTC time reaches the payload')
    } else {
      const local = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(scheduled.body.scheduledAt))
      assert.equal(local, '18:30', 'Chosen time reaches the payload in the workspace time zone')
    }
    assert.equal(new Date(scheduled.body.scheduledAt).getUTCDate() > 0, true)

    // Draft: from the composer footer with a scheduled mode in place.
    await openComposer()
    await chooseClip('Street details')
    await caption.fill('Draft from the footer.')
    await root.getByRole('button', { name: 'Save draft', exact: true }).click()
    await page.waitForURL(/\/dashboard\/publish(\?|$)/)
    assert.equal(mutations.at(-1).body.status, 'draft', 'Save draft submits a draft')

    // Publish now is an explicit mode; the primary button submits it.
    await openComposer()
    await chooseClip('Made for your next story')
    await caption.fill('Publish synthetic post.')
    await modeTab('Publish now').click()
    assert.equal(mutations.filter(item => item.body?.status === 'publish').length, 0, 'Choosing Publish now does not send a request')
    await root.getByRole('button', { name: 'Publish now', exact: true }).click()
    await page.waitForURL(/\/dashboard\/publish(\?|$)/)
    assert.equal(mutations.at(-1).body.status, 'publish', 'Publish now sends the publish status')

    // Back and cancel return to the publishing page.
    await openComposer()
    await root.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.waitForURL(/\/dashboard\/publish(\?|$)/)
    await openComposer()
    await back.click()
    await page.waitForURL(/\/dashboard\/publish(\?|$)/)

    assert.deepEqual(errors, [], `${label}: no console or runtime errors`)
    results.push(`${label}: passed`)
  } catch (error) {
    await screenshot('failure').catch(() => {})
    console.error(`${label} errors:`, errors.slice(0, 6))
    throw error
  } finally {
    await context.close()
  }

  // Selects the single synthetic account when the composer starts without a selection.
  async function setAccountCheck() {
    const tile = root.locator(`[data-composer-account="${account.id}"]`)
    if (await tile.getAttribute('aria-pressed') !== 'true') await tile.click()
    assert.equal(await tile.getAttribute('aria-pressed'), 'true', 'Instagram account is selected')
  }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const only = process.env.CANVAS_SCENARIO
  for (const [name, viewport] of Object.entries(dimensions))
    for (const scheme of schemes) {
      if (only && only !== `${name}-${scheme}`) continue
      await runScenario(browser, `${name}-${scheme}`, viewport, scheme)
    }
  console.log(results.join('\n'))
  console.log('Publish media and schedule canvas browser checks passed (mocked APIs only)')
} finally {
  await browser.close()
}
