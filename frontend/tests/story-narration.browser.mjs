import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
// Isolated browser profile and synthetic capture device: never use the user's microphone.
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-fake-device-for-media-stream']
})
const context = await browser.newContext({ permissions: ['microphone'] })
const page = await context.newPage()
page.setDefaultTimeout(60000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
let project
let uploadCount = 0
let registrationCount = 0
let rejectRegistration = false
let generations = []
const originals = []
const wav = Buffer.alloc(44 + 16000 * 2)
wav.write('RIFF', 0)
wav.writeUInt32LE(wav.length - 8, 4)
wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16)
wav.writeUInt16LE(1, 20)
wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(16000, 24)
wav.writeUInt32LE(32000, 28)
wav.writeUInt16LE(2, 32)
wav.writeUInt16LE(16, 34)
wav.write('data', 36)
wav.writeUInt32LE(wav.length - 44, 40)

await page.addInitScript(() => {
  const actualNow = performance.now.bind(performance)
  window.recordingClockOffset = 0
  performance.now = () => actualNow() + window.recordingClockOffset
  const startRecorder = MediaRecorder.prototype.start
  window.recordingByteCount = 0
  MediaRecorder.prototype.start = function (...args) {
    window.recordingByteCount = 0
    window.recordingStartedAt = performance.now()
    this.addEventListener('dataavailable', (event) => {
      window.recordingByteCount += event.data.size
    })
    return startRecorder.apply(this, args)
  }
  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  window.captureCalls = 0
  window.captureTracks = []
  window.denyNextCapture = false
  window.missingNextCapture = false
  window.delayNextCapture = false
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    window.captureCalls++
    if (window.denyNextCapture) {
      window.denyNextCapture = false
      throw new DOMException('Synthetic permission denial', 'NotAllowedError')
    }
    if (window.missingNextCapture) {
      window.missingNextCapture = false
      throw new DOMException('Synthetic missing microphone', 'NotFoundError')
    }
    const stream = await original(constraints)
    window.captureTracks.push(...stream.getTracks())
    if (window.delayNextCapture) {
      window.delayNextCapture = false
      await new Promise((resolve) => {
        window.releaseCapture = resolve
      })
    }
    return stream
  }
  const create = URL.createObjectURL.bind(URL)
  const revoke = URL.revokeObjectURL.bind(URL)
  window.audioObjectURLs = new Set()
  URL.createObjectURL = (blob) => {
    const url = create(blob)
    if (blob.type.startsWith('audio/')) window.audioObjectURLs.add(url)
    return url
  }
  URL.revokeObjectURL = (url) => {
    window.audioObjectURLs.delete(url)
    revoke(url)
  }
})
await page.route('**/v1/**', (route) =>
  route.fulfill({
    json: {
      access_token: 'synthetic-token',
      user: {
        id: '00000000-0000-4000-8000-000000000005',
        email: 'narration@example.invalid',
        name: 'Test',
        credits: 100,
        plan: 'free',
        access_role: 'member'
      }
    }
  })
)
await page.route('**/original/**', (route) =>
  route.fulfill({ contentType: 'audio/wav', body: wav })
)
await page.route('**/api/**', async (route) => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  const method = request.method()
  if (path === '/api/workspace-agent/runs')
    return route.fulfill({ json: { runs: [], has_more: false } })
  if (path === '/api/workspace-agent/suggestions')
    return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  if (path === '/api/upload/authorize')
    return route.fulfill({ json: { uploadUrl: '/api/upload', token: null } })
  if (path === '/api/upload')
    return route.fulfill({ json: { file_path: 'uploads/footage.mp4' } })
  if (path === '/api/upload/narration') {
    uploadCount++
    assert.match(request.headers()['content-type'], /multipart\/form-data; boundary=/)
    assert.match(
      request.postDataBuffer().toString(),
      /name="file"; filename="[^"]+\.(webm|m4a|wav)"/
    )
    if (uploadCount === 1)
      return route.fulfill({
        status: 503,
        json: { error: 'Synthetic upload failure. Try again.' }
      })
    return route.fulfill({ json: { file_path: `uploads/narration-${uploadCount}` } })
  }
  if (path === '/api/stories') {
    if (method === 'GET')
      return route.fulfill({ json: { stories: project ? [project] : [] } })
    const body = request.postDataJSON()
    project = {
      id: body.id,
      options: body.options,
      status: 'draft',
      assets: [],
      versions: [],
      current_version: 0,
      limits: {
        max_files: 20,
        max_file_bytes: 2 * 1024 ** 3,
        max_total_bytes: 10 * 1024 ** 3,
        max_source_seconds: 900,
        max_total_seconds: 3600
      }
    }
    return route.fulfill({ json: project })
  }
  if (path.endsWith('/assets') && method === 'POST') {
    const body = request.postDataJSON()
    if (body.kind === 'narration') {
      registrationCount++
      assert.equal(project.options.narration, true)
      const previous = project.assets.find((asset) => asset.kind === 'narration')
      if (previous) assert.equal(body.replace_asset_id, previous.id)
      if (rejectRegistration) {
        rejectRegistration = false
        return route.fulfill({
          status: 503,
          json: { error: 'Synthetic validation failure. The saved narration is safe.' }
        })
      }
      project.assets = project.assets.filter((asset) => asset.kind !== 'narration')
    }
    const asset = {
      id: body.id,
      name: body.name,
      size: wav.length,
      duration: 1,
      order: body.order ?? 0,
      kind: body.kind ?? 'video',
      role: 'auto',
      include: 'auto',
      source_url: `/original/${body.id}.wav`,
      candidates: []
    }
    project.assets.push(asset)
    originals.push(body)
    return route.fulfill({ json: project })
  }
  if (/\/assets\/[^/]+$/.test(path) && method === 'DELETE') {
    project.assets = project.assets.filter(
      (asset) => asset.id !== path.split('/').at(-1)
    )
    return route.fulfill({ json: project })
  }
  if (path.endsWith('/generate')) {
    const body = request.postDataJSON()
    assert.equal(project.options.narration, true)
    assert.deepEqual(
      [...body.asset_ids].sort(),
      project.assets.map((asset) => asset.id).sort()
    )
    generations.push(body)
    project.status = 'pending'
    project.message = 'Building the story around your full narration.'
    return route.fulfill({ status: 202, json: project })
  }
  if (project && path === `/api/stories/${project.id}`) {
    if (method === 'PATCH') Object.assign(project, request.postDataJSON())
    return route.fulfill({ json: project })
  }
  return route.fulfill({ json: {} })
})

const tracksStopped = () =>
  page.waitForFunction(() =>
    window.captureTracks.every((track) => track.readyState === 'ended')
  )
const startRecord = async (name = 'Record narration') => {
  await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('button', { name: 'Stop recording', exact: true }).waitFor()
  await page.waitForFunction(() => {
    const value = document
      .querySelector('[aria-label="Recording time"]')
      ?.textContent.match(/^(\d+):(\d+)/)
    return (
      value &&
      Number(value[1]) * 60 + Number(value[2]) >= 1 &&
      window.recordingByteCount > 0
    )
  })
}
const stopRecord = async () => {
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click()
  await page.getByLabel('Narration preview', { exact: true }).waitFor()
  await tracksStopped()
}
try {
  const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5191'
  await page.goto(`${origin}/dashboard/create`, {
    waitUntil: 'domcontentloaded',
    timeout: 180000
  })
  await page.getByRole('button', { name: 'Narrate your footage', exact: true }).click()
  await page.getByRole('button', { name: 'Record narration', exact: true }).waitFor()
  assert.equal(
    project.options.narration,
    true,
    'Recording-first creates a narration draft'
  )
  assert.equal(
    await page.evaluate(() => window.captureCalls),
    0,
    'Mode selection never opens the microphone'
  )
  assert.equal(
    await page.getByLabel('Target duration', { exact: true }).isDisabled(),
    true
  )
  assert.equal(await page.getByLabel('Preserve my source order').isDisabled(), true)
  await page.getByLabel('Upload story clips').setInputFiles({
    name: 'footage.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('synthetic source')
  })
  await page.locator('[data-testid="validated-source"]').waitFor()
  const videoID = project.assets[0].id
  const build = page.getByRole('button', { name: 'Build my story', exact: true })
  assert.equal(await build.isDisabled(), true, 'Missing narration gates generation')
  await page.evaluate(() => {
    window.denyNextCapture = true
  })
  await page.getByRole('button', { name: 'Record narration', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'permission was denied' }).waitFor()
  await startRecord()
  assert.equal(await build.isDisabled(), true)
  assert.equal(uploadCount, 0)
  await page.getByRole('button', { name: 'Pause recording', exact: true }).click()
  const paused = await page.getByLabel('Recording time', { exact: true }).textContent()
  await page.waitForTimeout(300)
  assert.equal(
    await page.getByLabel('Recording time', { exact: true }).textContent(),
    paused
  )
  await page.getByRole('button', { name: 'Resume recording', exact: true }).click()
  await stopRecord()
  assert.equal(uploadCount, 0, 'Stopping only creates a local preview')
  await page
    .getByLabel('Narration preview', { exact: true })
    .evaluate((audio) => audio.play())
  assert.equal(
    await page
      .getByLabel('Narration preview', { exact: true })
      .evaluate((audio) => !audio.paused),
    true
  )
  const discardedURL = await page
    .getByLabel('Narration preview', { exact: true })
    .getAttribute('src')
  await startRecord('Record again')
  assert.equal(
    await page.evaluate((url) => window.audioObjectURLs.has(url), discardedURL),
    false
  )
  await stopRecord()
  await page.getByRole('button', { name: 'Save narration', exact: true }).click()
  await page
    .getByRole('alert')
    .filter({ hasText: 'Synthetic upload failure' })
    .waitFor()
  assert.equal(
    await page.getByLabel('Narration preview', { exact: true }).count(),
    1,
    'Failed upload retains local recording'
  )
  await page
    .getByRole('button', { name: 'Retry saving narration', exact: true })
    .click()
  await page.getByTestId('saved-narration').waitFor()
  assert.equal(uploadCount, 2)
  assert.equal(
    await page.getByRole('button', { name: 'Build from recorded clips' }).isDisabled(),
    true
  )
  assert.equal(
    project.assets.some((asset) => asset.id === videoID),
    true
  )
  assert.equal(
    await page.locator('[data-testid="validated-source"]').count(),
    1,
    'Audio stays outside the video gallery'
  )
  const savedID = project.assets.find((asset) => asset.kind === 'narration').id
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByTestId('saved-narration').waitFor()
  assert.equal(await page.getByLabel('Saved narration playback').count(), 1)
  assert.equal(
    await page.evaluate(() => window.captureCalls),
    0,
    'Reload never opens the microphone'
  )
  rejectRegistration = true
  await page
    .getByLabel('Upload narration audio')
    .setInputFiles({ name: 'replacement.wav', mimeType: 'audio/wav', buffer: wav })
  await page.getByRole('button', { name: 'Save narration', exact: true }).click()
  await page
    .getByRole('alert')
    .filter({ hasText: 'Synthetic validation failure' })
    .waitFor()
  assert.equal(project.assets.find((asset) => asset.kind === 'narration').id, savedID)
  assert.equal(await build.isDisabled(), true)
  await page
    .getByRole('button', { name: 'Retry saving narration', exact: true })
    .click()
  await page
    .getByTestId('saved-narration')
    .getByText('replacement.wav', { exact: true })
    .waitFor()
  assert.equal(uploadCount, 3, 'Validation retry reuses uploaded bytes')
  assert.equal(registrationCount, 3)
  assert.notEqual(
    project.assets.find((asset) => asset.kind === 'narration').id,
    savedID
  )
  assert.equal(project.assets.filter((asset) => asset.kind === 'narration').length, 1)
  await page.evaluate(() => {
    window.delayNextCapture = true
  })
  await page.getByRole('button', { name: 'Record a replacement', exact: true }).click()
  await page.waitForFunction(() => typeof window.releaseCapture === 'function')
  await page.getByRole('button', { name: 'Cancel recording', exact: true }).click()
  await page.evaluate(() => window.releaseCapture())
  await tracksStopped()
  assert.equal(
    await page.getByTestId('narration-draft').count(),
    0,
    'Late permission grant cannot restart a cancelled recording'
  )
  await page
    .getByRole('checkbox', {
      name: 'My narration and all my clips are saved. Use this complete set.'
    })
    .check()
  await build.click()
  await page
    .getByRole('status')
    .filter({ hasText: 'Building the story around your full narration.' })
    .waitFor()
  assert.equal(generations.length, 1)
  // A separate draft starts from video uploads, then changes to narration mode.
  project.status = 'draft'
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'New story', exact: true }).click()
  await page.getByLabel('Upload story clips').setInputFiles({
    name: 'second-footage.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('another synthetic source')
  })
  await page.locator('[data-testid="validated-source"]').waitFor()
  assert.equal(
    Boolean(project.options.narration),
    false,
    'Existing source mode remains the default'
  )
  const retainedVideo = project.assets[0].id
  await page.getByRole('button', { name: 'Narrate your footage', exact: true }).click()
  await page.getByRole('button', { name: 'Record narration', exact: true }).waitFor()
  assert.equal(project.options.narration, true)
  assert.equal(
    project.assets[0].id,
    retainedVideo,
    'Switching modes preserves uploaded footage'
  )
  await page.evaluate(() => {
    window.missingNextCapture = true
  })
  await page.getByRole('button', { name: 'Record narration', exact: true }).click()
  await page
    .getByRole('alert')
    .filter({ hasText: 'microphone is unavailable' })
    .waitFor()
  await page.evaluate(() => {
    window.realMediaRecorder = window.MediaRecorder
    window.MediaRecorder = undefined
  })
  await page.getByRole('button', { name: 'Record narration', exact: true }).click()
  await page
    .getByRole('alert')
    .filter({ hasText: 'Recording is unavailable' })
    .waitFor()
  await page.evaluate(() => {
    window.MediaRecorder = window.realMediaRecorder
  })
  await page.getByLabel('Upload narration audio').setInputFiles({
    name: 'wrong.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('not audio')
  })
  await page.getByRole('alert').filter({ hasText: 'Choose an M4A' }).waitFor()
  await page.getByLabel('Upload narration audio').setInputFiles({
    name: 'large.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.alloc(32 * 1024 ** 2 + 1)
  })
  await page.getByRole('alert').filter({ hasText: 'no larger than 32 MB' }).waitFor()
  const longWav = Buffer.alloc(44 + 181 * 16000 * 2)
  wav.copy(longWav)
  longWav.writeUInt32LE(longWav.length - 8, 4)
  longWav.writeUInt32LE(longWav.length - 44, 40)
  await page
    .getByLabel('Upload narration audio')
    .setInputFiles({ name: 'long.wav', mimeType: 'audio/wav', buffer: longWav })
  await page.getByRole('alert').filter({ hasText: 'up to 3 minutes' }).waitFor()
  assert.equal(uploadCount, 3, 'Invalid files never upload')
  await startRecord()
  await page.evaluate(() => {
    window.recordingClockOffset =
      179550 - (performance.now() - window.recordingStartedAt)
  })
  await page.getByLabel('Narration preview', { exact: true }).waitFor()
  await tracksStopped()
  assert.equal(
    uploadCount,
    3,
    'The duration limit stops capture but never uploads automatically'
  )
  await page.evaluate(() => {
    window.recordingClockOffset = 0
  })
  await startRecord('Record again')
  await page.evaluate(() => {
    window.recordingClockOffset = 181000
  })
  await page.getByRole('alert').filter({ hasText: 'up to 3 minutes' }).waitFor()
  await tracksStopped()
  assert.equal(
    await page.getByTestId('narration-draft').count(),
    0,
    'A throttled timer overrun is rejected rather than clipped or labelled as 180 seconds'
  )
  await page.evaluate(() => {
    window.recordingClockOffset = 0
  })
  await startRecord()
  await page.getByRole('button', { name: 'Pause recording', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    ),
    true
  )
  if (process.env.TEST_SCREENSHOT)
    await page.screenshot({ path: process.env.TEST_SCREENSHOT, fullPage: true })
  await page.setViewportSize({ width: 1280, height: 960 })
  if (process.env.TEST_SCREENSHOT)
    await page.screenshot({
      path: process.env.TEST_SCREENSHOT.replace(/\.png$/, '-desktop.png'),
      fullPage: true
    })
  const narrationPanel = await page.getByTestId('story-narration').elementHandle()
  await page
    .getByRole('button', { name: 'Import a video or link', exact: true })
    .click()
  await tracksStopped()
  assert.equal(
    await narrationPanel.evaluate((node) => node.isConnected),
    true,
    'Mode switches preserve the panel while stopping its microphone'
  )
  await page.getByRole('button', { name: 'Multi-clip story', exact: true }).click()
  await page.getByLabel('Narration preview', { exact: true }).waitFor()
  assert.equal(project.assets[0].id, retainedVideo)
  await startRecord('Record again')
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await tracksStopped()
  assert.equal(
    await page.getByTestId('story-narration').count(),
    0,
    'Navigation unmounts the recorder and releases the active microphone'
  )
  assert.deepEqual(errors, [])
  console.log(
    'PASS: explicit synthetic microphone, denied permission and missing/unsupported devices, pause/resume, preview and re-record cleanup, upload retry, atomic replacement and validation retry, saved restoration, late permission cancellation, audio/video separation, exact generation manifest, both starting modes, file limits, mobile layout and microphone cleanup on navigation'
  )
} catch (error) {
  console.error(error)
  console.error({
    errors,
    uploads: uploadCount,
    registrations: registrationCount,
    body: (await page.locator('body').innerText()).slice(0, 9000)
  })
  throw error
} finally {
  await browser.close()
}
