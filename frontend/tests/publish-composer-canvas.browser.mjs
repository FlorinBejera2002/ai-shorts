import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Canvas coverage for the Publish composer. Every API response is synthetic:
// mutations are captured and answered by the mock, never sent to a backend.
if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
const output = new URL('../test-results/publish-composer-canvas/', import.meta.url)
const timeZone = 'Europe/Bucharest'
const user = {
  id: '00000000-0000-4000-8000-000000000092',
  email: 'publish-composer-canvas@example.invalid', name: 'Design Workspace',
  plan: 'pro', credits: 100, access_role: 'member'
}
const providerNames = { instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', youtube: 'YouTube' }
const accounts = Object.entries(providerNames).filter(([provider]) => provider !== 'facebook').map(([provider, name], index) => ({
  id: `00000000-0000-4000-8000-0000000003${index}0`, provider, name: `Synthetic ${name}`,
  username: 'sneepcutstudio', status: 'connected',
  scopes: ['video_publish', 'video.publish', 'instagram_business_content_publish']
}))
const account = provider => accounts.find(item => item.provider === provider)
const titles = ['A new perspective', 'Behind the scenes', 'Made for your next story', 'Street details', 'Morning routine', 'Small moments']
const clipId = index => `00000000-0000-4000-8000-0000000004${index}0`
const thumbnail = index => `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><rect width="360" height="640" fill="#282320"/><circle cx="${250 - index * 8}" cy="300" r="45" fill="#ffe1a1"/></svg>`
).toString('base64')}`
const clips = titles.map((title, index) => ({
  id: clipId(index), title, duration: [28, 35, 42, 21, 32, 18][index], viralScore: 8,
  tiktokEligible: true, thumbnailUrl: thumbnail(index),
  fileUrl: `${origin}/__publish-composer-fixture__/original.mp4`,
  captionInstagram: 'A different perspective. Inside our creative studio.',
  captionTiktok: 'A different perspective. Inside our creative studio.', captionYoutube: null
}))
const videoUrl = `${origin}/__publish-composer-fixture__/preview.mp4`
// Two-second silent synthetic H.264 media, shared with post-composer-layout.browser.mjs.
const video = Buffer.from('AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANzbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAp50cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAFoAAACgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAIWbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAUABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABwW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAYFzdGJsAAAAuXN0c2QAAAAAAAAAAQAAAKlhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAFoAoABIAAAASAAAAAAAAAABFExhdmM2My4xLjEwMiBsaWJ4MjY0AAAAAAAAAAAAAAAAGP//AAAAL2F2Y0MBQsAK/+EAGGdCwAraGFeTwEQAAAMABAAAAwBQPEiagAEABGjOD8gAAAAQcGFzcAAAAAEAAAABAAAAFGJ0cnQAAAAAAAAD8AAAAAAAAAAYc3R0cwAAAAAAAAABAAAAFAAABAAAAAAUc3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAFAAAAAEAAABkc3RzegAAAAAAAAAAAAAAFAAAAD4AAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAACgAAAAoAAAAKAAAAFHN0Y28AAAAAAAAAAQAAA6MAAABhdWR0YQAAAFltZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAACxpbHN0AAAAJKl0b28AAAAcZGF0YQAAAAEAAAAATGF2ZjYzLjEuMTAyAAAACGZyZWUAAAEEbWRhdAAAADpliIQ6EYoAAi7xwY+Tk5OTk6666666666666666666666666666666666666666666666666666668AAAABkGaID6B7AAAAAZBmkA+gewAAAAGQZpgPoHsAAAABkGagBCgewAAAAZBmqAQoHsAAAAGQZrAEKB7AAAABkGa4BCgewAAAAZBmwAQoHsAAAAGQZsgEKB7AAAABkGbQBCgewAAAAZBm2AQoHsAAAAGQZuAEKB7AAAABkGboBCgewAAAAZBm8AQoHsAAAAGQZvgEKB7AAAABkGaABCgewAAAAZBmiAQoHsAAAAGQZpAEKB7AAAABkGaYBCgew==', 'base64')
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDKsAAAAASUVORK5CYII=', 'base64')
const uploadReference = `publishing/${user.id}/synthetic-upload.png`
const existingId = '00000000-0000-4000-8000-000000000401'
const planned = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
const existingPost = {
  id: existingId, title: titles[0], caption: 'A saved synthetic draft.', notes: null,
  platforms: ['instagram'], accountIds: [account('instagram').id], status: 'draft',
  scheduledAt: planned, createdAt: planned, updatedAt: planned, clip: clips[0], media: [],
  publishingDestinations: [], instagram: { commentEnabled: true, shareToFeed: true, locationId: '123456789' }
}

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
  const clipRequests = []
  const creatorRequests = []
  const posts = new Map([[existingId, existingPost]])
  let nextIndex = 0
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })

  await context.route('**/v1/**', route => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
  await context.route('**/__publish-composer-fixture__/preview.mp4', route => route.fulfill({ contentType: 'video/mp4', body: video }))
  await context.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    if (url.pathname === '/api/publishing' && method === 'GET') {
      return route.fulfill({ json: {
        providers: Object.entries(providerNames).map(([id, name]) => ({ id, name, configured: true, supportsPublishing: true })),
        accounts, clips, posts: []
      } })
    }
    if (url.pathname === '/api/calendar' && method === 'GET')
      return route.fulfill({ json: { posts: [...posts.values()], clips } })
    if ((url.pathname === '/api/calendar' && method === 'POST') || (url.pathname.startsWith('/api/calendar/') && method === 'PATCH')) {
      const body = request.postDataJSON()
      const id = method === 'POST' ? `00000000-0000-4000-8000-0000000005${nextIndex++}0` : url.pathname.split('/').at(-1)
      mutations.push({ method, id, body })
      const post = {
        ...(posts.get(id) ?? {}), ...body, id,
        clip: clips.find(item => item.id === body.clipId) ?? null,
        media: body.media ?? [], publishingDestinations: [], createdAt: planned, updatedAt: planned
      }
      posts.set(id, post)
      return route.fulfill({ json: { post } })
    }
    if (url.pathname === '/api/publishing/media' && method === 'POST') {
      uploads.push(request.postDataBuffer())
      return route.fulfill({ json: { type: 'image', reference: uploadReference, name: 'synthetic-upload.png' } })
    }
    if (method !== 'GET') return route.fulfill({ status: 405, json: { error: 'Unexpected synthetic write blocked' } })
    const clip = clips.find(item => url.pathname === `/api/clips/${item.id}`)
    if (clip) {
      clipRequests.push(clip.id)
      return route.fulfill({ json: { id: clip.id, preview_url: videoUrl, file_url: clip.fileUrl, thumbnail_url: clip.thumbnailUrl } })
    }
    if (url.pathname === `/api/publishing/accounts/${account('tiktok').id}/options`) {
      creatorRequests.push(account('tiktok').id)
      return route.fulfill({ json: {
        privacyLevels: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
        commentDisabled: false, duetDisabled: false, stitchDisabled: false, maxDuration: 600, nickname: 'Synthetic TikTok'
      } })
    }
    if (url.pathname === '/api/publishing/media/preview') return route.fulfill({ json: { url: thumbnail(0) } })
    if (url.pathname === '/api/user/profile') return route.fulfill({ json: { profile: { ...user, image: null, provider: 'password', canChangePassword: true, recentlyAuthenticated: true, emailVerified: planned, createdAt: planned } } })
    if (url.pathname.startsWith('/api/workspace-agent/')) return route.fulfill({ json: { runs: [], suggestions: [], capabilities: [], has_more: false } })
    return route.fulfill({ json: {} })
  })

  const root = page.locator('[data-post-composer]')
  const preview = page.locator('[data-composer-preview]')
  const caption = page.getByLabel('Post text', { exact: true })
  const mediaDialog = page.getByRole('dialog', { name: 'Media', exact: true })
  const optionsDialog = page.getByRole('dialog', { name: 'Platform options', exact: true })
  const accountTile = provider => root.locator(`[data-composer-account="${account(provider).id}"]`)
  const modeTab = name => root.getByRole('tab', { name, exact: true })
  const clipButton = title => mediaDialog.getByRole('button').filter({ hasText: title })
  const back = root.getByRole('button', { name: 'Back to publishing', exact: true })

  async function setAccount(provider, selected) {
    if (await accountTile(provider).getAttribute('aria-pressed') !== String(selected)) await accountTile(provider).click()
    assert.equal(await accountTile(provider).getAttribute('aria-pressed'), String(selected), `${provider} selection is ${selected}`)
  }
  async function openComposer(path = '/dashboard/publish/new') {
    await page.goto(`${origin}${path}`, { waitUntil: 'load', timeout: 180000 })
    await root.waitFor()
  }
  async function openMedia() {
    await root.getByRole('button', { name: 'Change media', exact: true }).click()
    await mediaDialog.waitFor()
  }
  async function openOptions() {
    await root.getByRole('button', { name: 'Platform options', exact: true }).click()
    await optionsDialog.waitFor()
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
    // Entry, back navigation text and account toggles.
    await openComposer()
    assert.equal(await page.getByLabel('Post title', { exact: true }).isVisible(), false, 'Composer opens with one public text field')
    assert.equal(await back.isVisible(), true, 'Back control is present')
    assert.equal(await back.locator('span').isVisible(), viewport.width < 768, 'Back control shows its text only on phones, as on the reference')
    await assertFits(root, 'Composer')
    await setAccount('tiktok', true)
    await setAccount('tiktok', false)
    await setAccount('tiktok', true)
    await setAccount('youtube', false)
    await setAccount('instagram', true)
    await caption.fill('A reference caption for the canvas composer.')
    await screenshot('composer')

    // Media chooser: search, paging, cancel, clip selection, device upload and removal.
    await openMedia()
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
    await mediaDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await mediaDialog.waitFor({ state: 'hidden' })
    assert.equal(await root.getByText('Street details', { exact: true }).count(), 0, 'Cancel discards the pending clip choice')
    await openMedia()
    await clipButton('Street details').click()
    await mediaDialog.getByRole('button', { name: 'Use clip', exact: true }).click()
    await mediaDialog.waitFor({ state: 'hidden' })
    await preview.locator('video').first().waitFor()
    assert.equal(await preview.locator('video').first().getAttribute('src'), videoUrl, 'Used clip reaches the preview')
    assert.ok(clipRequests.includes(clipId(3)), 'Selected clip resolves its preview URL')
    // Phones keep the chooser in the preview pane; the media summary row is desktop-only.
    if (viewport.width >= 768)
      assert.equal(await root.getByRole('button', { name: 'Change media', exact: true }).getByText('Street details', { exact: true }).isVisible(), true, 'Media chooser names the chosen clip')

    await openMedia()
    await mediaDialog.getByRole('tab', { name: 'From device', exact: true }).click()
    await mediaDialog.locator('input[type="file"]').first().setInputFiles({ name: 'synthetic-upload.png', mimeType: 'image/png', buffer: image })
    await mediaDialog.getByRole('button', { name: 'Use media', exact: true }).click()
    await mediaDialog.waitFor({ state: 'hidden' })
    assert.ok(uploads.length >= 1, 'Device upload uses the mocked media API')
    await preview.locator('img:not([data-platform-mark])').first().waitFor()
    assert.equal(await preview.locator('video').count(), 0, 'Uploaded photo replaces the clip in the preview')
    await openMedia()
    await mediaDialog.getByRole('tab', { name: 'My clips', exact: true }).click()
    await clipButton('A new perspective').click()
    await mediaDialog.getByRole('button', { name: 'Use clip', exact: true }).click()
    await mediaDialog.waitFor({ state: 'hidden' })

    // Preview platform tabs and the expanded preview.
    await preview.getByRole('tab', { name: 'TikTok', exact: true }).click()
    await preview.locator('[data-brand-social-overlay="tiktok"]').waitFor()
    await preview.getByRole('tab', { name: 'Instagram', exact: true }).click()
    await preview.locator('[data-brand-social-overlay="instagram"]').waitFor()
    await preview.getByRole('button', { name: 'Expand preview', exact: true }).click()
    const expanded = page.getByRole('dialog', { name: 'Post preview', exact: true })
    await expanded.waitFor()
    await expanded.getByRole('button', { name: 'Close dialog', exact: true }).click()
    await expanded.waitFor({ state: 'hidden' })

    // Platform options: each selected destination opens its own tab; Done keeps values.
    await openOptions()
    await optionsDialog.getByRole('tab', { name: 'Instagram', exact: true }).click()
    await optionsDialog.getByRole('tab', { name: 'TikTok', exact: true }).click()
    await optionsDialog.getByRole('button', { name: 'Done', exact: true }).click()
    await optionsDialog.waitFor({ state: 'hidden' })
    await assertFits(root, 'Composer after options')

    // Draft save: payload carries the caption, accounts, clip and mode.
    await modeTab('Draft').click()
    await root.getByRole('button', { name: 'Save draft', exact: true }).click()
    await page.waitForURL(/\/dashboard\/publish(\?|$)/)
    const draft = mutations.at(-1)
    assert.equal(draft.method, 'POST')
    assert.equal(draft.body.status, 'draft')
    assert.equal(draft.body.caption, 'A reference caption for the canvas composer.')
    assert.deepEqual([...draft.body.accountIds].sort(), [account('instagram').id, account('tiktok').id].sort())
    assert.equal(draft.body.clipId, clipId(0), 'Draft keeps the chosen clip')

    // Schedule an Instagram-only post, then assert the scheduled payload.
    await openComposer()
    await setAccount('tiktok', false)
    await setAccount('instagram', true)
    await caption.fill('Scheduled synthetic post.')
    await openMedia()
    await clipButton('Behind the scenes').click()
    await mediaDialog.getByRole('button', { name: 'Use clip', exact: true }).click()
    await mediaDialog.waitFor({ state: 'hidden' })
    await modeTab('Schedule').click()
    await setTime('18', '30')
    await screenshot('schedule')
    await root.getByRole('button', { name: 'Schedule post', exact: true }).click()
    await page.waitForURL(/\/dashboard\/publish(\?|$)/)
    const scheduled = mutations.at(-1)
    assert.equal(scheduled.body.status, 'scheduled')
    assert.deepEqual(scheduled.body.platforms, ['instagram'])
    const scheduledLocal = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(scheduled.body.scheduledAt))
    assert.equal(scheduledLocal, '18:30', 'Scheduled time reaches the payload in the workspace time zone')

    // Publish now is an explicit mode and sends status publish only after the button.
    await openComposer()
    await setAccount('tiktok', false)
    await setAccount('instagram', true)
    await caption.fill('Publish synthetic post.')
    await openMedia()
    await clipButton('Street details').click()
    await mediaDialog.getByRole('button', { name: 'Use clip', exact: true }).click()
    await mediaDialog.waitFor({ state: 'hidden' })
    await modeTab('Publish now').click()
    assert.equal(mutations.filter(item => item.body?.status === 'publish').length, 0, 'Choosing Publish now does not send a request')
    await root.getByRole('button', { name: 'Publish now', exact: true }).click()
    await page.waitForURL(/\/dashboard\/publish(\?|$)/)
    assert.equal(mutations.at(-1).body.status, 'publish', 'Publish now sends the publish status')

    // Edit route: saving an existing draft issues a PATCH to that record.
    await openComposer(`/dashboard/publish/${existingId}/edit`)
    assert.equal(await caption.inputValue(), 'A saved synthetic draft.')
    await modeTab('Draft').click()
    await root.getByRole('button', { name: 'Save draft', exact: true }).click()
    await page.waitForURL(/\/dashboard\/publish(\?|$)/)
    const patch = mutations.at(-1)
    assert.equal(patch.method, 'PATCH')
    assert.equal(patch.id, existingId)

    // Back control returns to the queue.
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
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const [name, viewport] of Object.entries(dimensions))
    for (const scheme of schemes)
      await runScenario(browser, `${name}-${scheme}`, viewport, scheme)
  console.log(results.join('\n'))
  console.log('Publish composer canvas browser checks passed (mocked APIs only)')
} finally {
  await browser.close()
}
