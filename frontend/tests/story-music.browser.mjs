import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE)
  throw Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5192'
const context = await browser.newContext({
  viewport: { width: 1280, height: 960 },
  permissions: ['clipboard-read', 'clipboard-write']
})
const page = await context.newPage()
await page.addInitScript(() => {
  window.musicAudioEvents = []
  for (const type of [
    'play',
    'pause',
    'seeking',
    'seeked',
    'loadedmetadata',
    'emptied',
    'ended'
  ]) {
    document.addEventListener(
      type,
      (event) => {
        if (event.target instanceof HTMLAudioElement) {
          window.musicAudioEvents.push({
            type,
            time: event.target.currentTime,
            source: event.target.currentSrc,
            paused: event.target.paused
          })
          window.musicAudioEvents = window.musicAudioEvents.slice(-30)
        }
      },
      true
    )
  }
})
page.setDefaultTimeout(60000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const sourcePath = new URL(
  '../src/components/story/story-music.tsx',
  import.meta.url
)
const originalSource = readFileSync(sourcePath, 'utf8')
let hotEdited = false
let musicRequests = 0
let previewRequests = 0
let trackRequests = 0
let slowRequested = false
let releaseSlow
let releaseUpload
let uploadFailure = false
let uploadedCount = 0
let generationAttempts = 0
let uploadGate = Promise.resolve()
const uploadedReference =
  'uploads/00000000-0000-4000-8000-000000000071/song.wav'
const slowGate = new Promise((resolve) => {
  releaseSlow = resolve
})
const patches = []
const track = (id, title) => ({
  id,
  title,
  artist: 'Kevin MacLeod',
  duration_seconds: 128,
  bpm: 120,
  genres: ['Acoustic'],
  moods: ['Bright'],
  preview_url: `${origin}/fixture-music.wav?id=${id}`,
  source_url: 'https://incompetech.com/music/royalty-free/',
  license: 'CC BY 4.0',
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: `${title} by Kevin MacLeod. CC BY 4.0.`
})
const alpha = track('incompetech:alpha', 'Quiet Morning')
const beta = track('incompetech:beta', 'Bright Afternoon')
const gamma = track(
  'incompetech:gamma',
  'Long title for a cinematic evening with a very wide horizon'
)
const tracks = [alpha, beta, gamma]
const project = {
  id: '00000000-0000-4000-8000-000000000071',
  status: 'draft',
  current_version: 0,
  options: {
    brief: 'Keep my dialogue intact.',
    target_seconds: 45,
    aspect_ratio: '9:16',
    language: 'auto',
    mode: 'smart',
    preserve_order: true,
    captions: false,
    caption_mode: 'off'
  },
  assets: [
    {
      id: 'clip-one',
      name: 'Synthetic clip.mp4',
      duration: 12,
      size: 12000,
      kind: 'video',
      role: 'auto',
      include: 'auto',
      order: 0
    }
  ],
  versions: [],
  limits: {
    max_files: 20,
    max_file_bytes: 2 * 1024 ** 3,
    max_total_bytes: 10 * 1024 ** 3,
    max_source_seconds: 900,
    max_total_seconds: 3600
  }
}
const wave = Buffer.alloc(44 + 8000 * 2 * 12)
wave.write('RIFF', 0)
wave.writeUInt32LE(wave.length - 8, 4)
wave.write('WAVEfmt ', 8)
wave.writeUInt32LE(16, 16)
wave.writeUInt16LE(1, 20)
wave.writeUInt16LE(1, 22)
wave.writeUInt32LE(8000, 24)
wave.writeUInt32LE(16000, 28)
wave.writeUInt16LE(2, 32)
wave.writeUInt16LE(16, 34)
wave.write('data', 36)
wave.writeUInt32LE(wave.length - 44, 40)
for (let i = 0; i < 8000 * 12; i++)
  wave.writeInt16LE(
    Math.round(Math.sin((i * 2 * Math.PI * 220) / 8000) * 1000),
    44 + i * 2
  )

await page.route('**/v1/**', (route) =>
  route.fulfill({
    json: {
      access_token: 'synthetic-token',
      user: {
        id: '00000000-0000-4000-8000-000000000071',
        email: 'music@example.invalid',
        name: 'Music fixture',
        credits: 100,
        plan: 'free',
        access_role: 'member'
      }
    }
  })
)
await page.route('**/fixture-music.wav*', (route) => {
  previewRequests++
  const range = route
    .request()
    .headers()
    .range?.match(/^bytes=(\d+)-(\d*)$/)
  const start = range ? Number(range[1]) : 0
  const end = range?.[2]
    ? Math.min(Number(range[2]), wave.length - 1)
    : wave.length - 1
  return route.fulfill({
    status: range ? 206 : 200,
    contentType: 'audio/wav',
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      ...(range
        ? { 'Content-Range': `bytes ${start}-${end}/${wave.length}` }
        : {})
    },
    body: wave.subarray(start, end + 1)
  })
})
await page.route('**/api/**', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  const path = url.pathname
  if (path === '/api/upload/music' && request.method() === 'POST') {
    uploadedCount++
    await uploadGate
    if (uploadFailure)
      return route
        .fulfill({ status: 422, json: { detail: 'Synthetic invalid audio' } })
        .catch(() => {})
    return route
      .fulfill({
        json: {
          file_path: uploadedReference,
          file_name: 'my-song.wav',
          file_size: wave.length,
          url: `${origin}/fixture-music.wav?upload`
        }
      })
      .catch(() => {})
  }
  if (path === '/api/upload/music/preview')
    return route.fulfill({
      json: { url: `${origin}/fixture-music.wav?upload` }
    })
  if (path === '/api/music') {
    musicRequests++
    const query = url.searchParams.get('query')
    const number = Number(url.searchParams.get('page'))
    if (query === 'error')
      return route.fulfill({
        status: 503,
        json: { error: 'Synthetic provider unavailable' }
      })
    if (query === 'slow') {
      slowRequested = true
      await slowGate
    }
    const found =
      query === 'empty'
        ? []
        : query === 'bright'
          ? [beta]
          : number === 2
            ? [gamma]
            : [alpha, beta]
    return route
      .fulfill({
        json: {
          tracks: found,
          total: query ? found.length : 3,
          page: number,
          has_more: !query && number === 1
        }
      })
      .catch(() => {})
  }
  if (path.startsWith('/api/music/')) {
    trackRequests++
    return route.fulfill({
      json: tracks.find(
        (item) => item.id === decodeURIComponent(path.split('/').pop())
      )
    })
  }
  if (path === '/api/stories')
    return route.fulfill({
      json: { stories: [project], limits: project.limits }
    })
  if (path === `/api/stories/${project.id}/generate` || path === `/api/stories/${project.id}/retry`) {
    generationAttempts++
    if (generationAttempts < 3) {
      project.status = 'processing'
      project.stage = 'music_analysis'
      project.error = ''
      return route.fulfill({ json: project })
    }
    project.status = 'ready'
    project.current_version = 1
    project.versions = [
      {
        number: 1,
        parent: 0,
        accepted: true,
        preview_url: `${origin}/fixture-music.wav?result`,
        plan: { title: 'Music fixture', summary: '', blocks: [] },
        timeline: [],
        output: {
          music: {
            track_id: beta.id,
            title: beta.title,
            artist: beta.artist,
            source_url: beta.source_url,
            license: beta.license,
            license_url: beta.license_url,
            attribution: `${beta.attribution}\nAdapted: trimmed, faded and mixed for this video.`,
            sync_status: 'partial',
            adjusted_cuts: 2,
            bpm: beta.bpm
          }
        },
        report: {
          status: 'ready',
          coverage: {
            plan: true,
            file: true,
            audio: true,
            visual: true,
            captions: true,
            semantics: true,
            boundaries: true
          }
        }
      }
    ]
    return route.fulfill({ json: project })
  }
  if (path === `/api/stories/${project.id}`) {
    if (request.method() === 'PATCH') {
      project.options = request.postDataJSON().options
      patches.push(structuredClone(project.options))
    }
    return route.fulfill({ json: project })
  }
  if (path === '/api/workspace-agent/runs')
    return route.fulfill({ json: { runs: [], has_more: false } })
  if (path === '/api/workspace-agent/suggestions')
    return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  return route.fulfill({ json: {} })
})
const wizard = page.getByTestId('story-wizard')
const next = async (step) => {
  await wizard.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByTestId(`story-step-${step}`).waitFor({ state: 'visible' })
}
const go = async (step) => {
  await page.getByRole('button', { name: ['Add footage', 'Choose result', 'Generate'][step], exact: true }).click()
  await page.getByTestId(`story-step-${step}`).waitFor({ state: 'visible' })
}
const search = async (value) => {
  await page
    .getByRole('searchbox', { name: 'Search music' })
    .or(page.getByRole('textbox', { name: 'Search music' }))
    .fill(value)
  await page.getByRole('button', { name: 'Search tracks', exact: true }).click()
}

try {
  await page.goto(`${origin}/dashboard/create?story=${project.id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 180000
  })
  await page.getByTestId('story-step-0').waitFor({ state: 'visible' })
  console.log('Music browser: fixture loaded')
  assert.equal(
    musicRequests,
    0,
    'The catalog is not fetched before being opened'
  )
  await next(1)
  await page
    .getByRole('button', { name: 'Choose music', exact: true })
    .click()
  await page
    .getByRole('button', { name: `Select ${alpha.title}`, exact: true })
    .waitFor()
  assert.equal(previewRequests, 0, 'Browsing fetches metadata only')
  await page
    .getByRole('button', { name: `Preview ${alpha.title}`, exact: true })
    .click()
  await page.waitForFunction(() => {
    const audio = document.querySelector('[data-testid="music-preview"] audio')
    return audio && !audio.paused && audio.currentTime > 0
  })
  await page.evaluate(() => {
    window.previousMusicPlayer = document.querySelector(
      '[data-testid="music-preview"] audio'
    )
  })
  await page
    .getByRole('button', { name: `Select ${alpha.title}`, exact: true })
    .click()
  assert.equal(
    await page.evaluate(() => window.previousMusicPlayer.paused),
    true,
    'Selecting a track stops the previous stream'
  )
  assert.equal(
    await page
      .getByRole('checkbox', {
        name: 'Follow the music',
        exact: true
      })
      .isChecked(),
    true
  )
  assert.equal(await page.getByRole('radio', { name: 'Keep original sound', exact: true }).isChecked(), true)
  await page.getByRole('radio', { name: 'Music only', exact: true }).check()
  assert.equal(
    await page
      .getByRole('slider', { name: 'Music volume', exact: false })
      .inputValue(),
    '0.18'
  )
  // Selecting a track closes the chooser; reopening it shows the catalog again.
  await page.getByRole('button', { name: 'Choose music', exact: true }).click()
  await page.getByRole('button', { name: 'Next tracks', exact: true }).click()
  await page
    .getByRole('button', { name: `Select ${gamma.title}`, exact: true })
    .waitFor()
  assert.ok(
    await page
      .getByTestId('selected-music')
      .innerText()
      .then((value) => value.includes(alpha.title)),
    'Pagination keeps the chosen track visible'
  )
  await search('empty')
  await page
    .getByText('No tracks found. Try a different title, mood or genre.', {
      exact: true
    })
    .waitFor()
  await search('slow')
  const slowDeadline = Date.now() + 10000
  while (!slowRequested && Date.now() < slowDeadline)
    await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(
    slowRequested,
    'The pending request was sent before searching again'
  )
  await search('bright')
  await page
    .getByRole('button', { name: `Select ${beta.title}`, exact: true })
    .waitFor()
  releaseSlow()
  await page.waitForTimeout(200)
  assert.equal(
    await page
      .getByTestId('music-catalog')
      .getByRole('button', { name: `Select ${alpha.title}`, exact: true })
      .count(),
    0,
    'An outdated response never replaces the latest search'
  )
  await search('error')
  await page
    .getByRole('button', { name: 'Retry music search', exact: true })
    .waitFor()
  assert.ok(
    (await page.getByTestId('selected-music').innerText()).includes(
      alpha.title
    ),
    'A catalog outage preserves the selected track'
  )
  await search('bright')
  await page
    .getByRole('button', { name: `Select ${beta.title}`, exact: true })
    .click()
  const volume = page.getByRole('slider', {
    name: 'Music volume',
    exact: false
  })
  await volume.fill('0')
  await page.getByText('Music is muted. With Music only, the video will have no sound.', { exact: true }).waitFor()
  assert.equal(await page.getByRole('radio', { name: 'Music only', exact: true }).isChecked(), true)
  await volume.fill('0.27')
  await page
    .getByRole('checkbox', { name: 'Follow the music', exact: true })
    .uncheck()
  await page
    .getByRole('button', { name: 'Preview selected music', exact: true })
    .click()
  await page.waitForFunction(
    () => !document.querySelector('[data-testid="music-preview"] audio').paused
  )
  await next(2)
  assert.equal(
    await page
      .locator('[data-testid="music-preview"] audio')
      .evaluate((audio) => audio.paused),
    true,
    'Moving to another step pauses the mounted audio player'
  )
  console.log('Music browser: search, audio and saved choices verified')
  assert.deepEqual(project.options.music, {
    track_id: beta.id,
    volume: 0.27,
    sync: false,
    source_audio: 'mute',
    loop: true
  })
  assert.ok(
    (await page.getByTestId('music-summary').innerText()).includes(beta.title)
  )
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.getByTestId('story-step-2').waitFor({ state: 'visible' })
  console.log('Music browser: saved draft reloaded')
  await go(1)
  await page
    .getByTestId('selected-music')
    .getByText(beta.title, { exact: true })
    .waitFor()
  assert.ok(
    trackRequests > 0,
    'Reload hydrates the saved track identifier from the catalog endpoint'
  )
  assert.equal(await volume.inputValue(), '0.27')
  assert.equal(await page.getByRole('radio', { name: 'Music only', exact: true }).isChecked(), true)
  assert.equal(
    await page
      .getByRole('checkbox', {
        name: 'Follow the music',
        exact: true
      })
      .isChecked(),
    false
  )
  await page.getByRole('button', { name: 'Choose music', exact: true }).click()
  await page.getByRole('button', { name: 'Next tracks', exact: true }).click()
  await page
    .getByRole('button', { name: `Select ${gamma.title}`, exact: true })
    .waitFor()
  const screenshotDirectory = new URL(
    '../test-results/story-music/',
    import.meta.url
  )
  mkdirSync(screenshotDirectory, { recursive: true })
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 960 })
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      ),
      true,
      `Music UI fits ${width}px`
    )
    await page.screenshot({
      path: new URL(
        `catalog-${width}.png`,
        screenshotDirectory
      ).pathname.replace(/^\/(.:)/, '$1'),
      fullPage: true,
      animations: 'disabled'
    })
  }
  // The chooser is modal; close it so the music card is reachable for the Fast Refresh check.
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.setViewportSize({ width: 1280, height: 960 })
  await page.evaluate(() => {
    window.musicPageMarker = 'keep'
    window.musicPanel = document.querySelector('[data-testid="story-music"]')
  })
  hotEdited = true
  writeFileSync(
    sourcePath,
    originalSource.replace(
      "'Background music', 'Muzică de fundal'",
      "'Background music test', 'Muzică de fundal'"
    )
  )
  await page
    .getByRole('group', { name: 'Background music test', exact: true })
    .waitFor()
  assert.equal(
    await page.evaluate(() => window.musicPageMarker),
    'keep',
    'Fast Refresh does not reload the page'
  )
  assert.equal(
    await page.evaluate(
      () =>
        window.musicPanel ===
        document.querySelector('[data-testid="story-music"]')
    ),
    true,
    'Fast Refresh preserves the component DOM boundary'
  )
  assert.equal(await volume.inputValue(), '0.27')
  await page.getByRole('button', { name: 'Choose music', exact: true }).click()
  await page.getByRole('button', { name: 'Next tracks', exact: true }).click()
  await page
    .getByRole('button', { name: `Select ${gamma.title}`, exact: true })
    .waitFor()
  writeFileSync(sourcePath, originalSource)
  hotEdited = false
  console.log('Music browser: responsive layout and Fast Refresh verified')
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page
    .getByRole('group', { name: 'Background music', exact: true })
    .waitFor()
  await page.getByRole('button', { name: 'Choose music', exact: true }).click()
  await page.getByRole('button', { name: 'From device', exact: true }).waitFor()
  const uploadFile = {
    name: 'my-song.wav',
    mimeType: 'audio/wav',
    buffer: wave
  }
  const fileInput = page.getByLabel('Choose music file', { exact: true })
  uploadFailure = true
  await fileInput.setInputFiles(uploadFile)
  await page.getByText('Synthetic invalid audio', { exact: true }).waitFor()
  assert.ok(
    (await page.getByTestId('selected-music').innerText()).includes(beta.title),
    'A failed upload preserves previous music'
  )
  uploadFailure = false
  uploadGate = new Promise((resolve) => {
    releaseUpload = resolve
  })
  await fileInput.setInputFiles(uploadFile)
  await page
    .getByText('Keep this page open while your music uploads.', { exact: true })
    .waitFor()
  assert.equal(
    await wizard
      .getByRole('button', { name: 'Continue', exact: true, includeHidden: true })
      .isDisabled(),
    true,
    'Pending upload blocks generation navigation'
  )
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  releaseUpload()
  await page.getByRole('button', { name: 'From device', exact: true }).waitFor()
  assert.ok(
    (await page.getByTestId('selected-music').innerText()).includes(beta.title),
    'Cancel keeps previous music'
  )
  uploadGate = Promise.resolve()
  await fileInput.setInputFiles(uploadFile)
  await page
    .getByTestId('selected-music')
    .getByText('my-song.wav', { exact: true })
    .waitFor()
  await page.getByText('Choose an excerpt', { exact: true }).click()
  await page.getByLabel('Start (seconds)', { exact: true }).fill('2')
  await page.getByLabel('End (seconds)', { exact: true }).fill('1')
  assert.equal(
    await wizard
      .getByRole('button', { name: 'Continue', exact: true })
      .isDisabled(),
    true,
    'Invalid excerpt cannot advance'
  )
  await page.getByLabel('End (seconds)', { exact: true }).fill('4')
  await page
    .getByRole('checkbox', {
      name: 'Repeat the excerpt if the video is longer',
      exact: true
    })
    .uncheck()
  await page
    .getByRole('button', { name: 'Preview selected music', exact: true })
    .click()
  await page.waitForFunction(() => {
    const audio = document.querySelector('[data-testid="music-preview"] audio')
    return (
      audio && audio.currentTime >= 2 && audio.currentTime < 4 && !audio.paused
    )
  })
  await page.waitForFunction(() => {
    const audio = document.querySelector('[data-testid="music-preview"] audio')
    return audio && audio.currentTime >= 4 && audio.paused
  })
  await page.getByLabel('End (seconds)', { exact: true }).fill('1')
  await page
    .locator('[data-testid="music-preview"] audio')
    .evaluate((audio) => audio.play().catch(() => {}))
  assert.equal(
    await page
      .locator('[data-testid="music-preview"] audio')
      .evaluate((audio) => audio.paused),
    true,
    'Invalid excerpt cannot play'
  )
  await page.getByLabel('End (seconds)', { exact: true }).fill('4')
  await go(2)
  assert.equal(project.options.music.upload_reference, uploadedReference)
  assert.equal(project.options.music.start_seconds, 2)
  assert.equal(project.options.music.end_seconds, 4)
  assert.equal(project.options.music.loop, false)
  assert.equal(project.options.music.source_audio, 'mute')
  assert.ok(
    (await page.getByTestId('music-summary').innerText()).includes(
      'my-song.wav'
    )
  )
  assert.equal(
    (await page.getByTestId('music-summary').innerText()).includes(
      'music credit is included'
    ),
    false
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await go(1)
  await page
    .getByTestId('selected-music')
    .getByText('my-song.wav', { exact: true })
    .waitFor()
  console.log(
    'Music browser: upload error/cancel/success, excerpt playback, range validation and persistence verified'
  )
  await page.getByRole('button', { name: 'Remove music', exact: true }).click()
  assert.equal(await page.getByTestId('selected-music').count(), 0)
  await go(2)
  assert.equal(
    project.options.music,
    null,
    'Removing music is persisted explicitly'
  )
  await go(1)
  await page
    .getByRole('button', { name: 'Choose music', exact: true })
    .click()
  await search('bright')
  await page
    .getByRole('button', { name: `Select ${beta.title}`, exact: true })
    .click()
  await go(2)
  await page
    .getByRole('button', { name: 'Create clips', exact: true })
    .click()
  await page
    .getByTestId('story-processing')
    .getByRole('heading', { name: 'Analyzing your footage', exact: true })
    .waitFor()
  project.status = 'failed'
  project.error = 'music analysis is unavailable; retry or disable synchronization'
  await page.getByTestId('music-recovery').waitFor()
  await page.getByRole('button', { name: 'Retry music analysis', exact: true }).click()
  await page
    .getByTestId('story-processing')
    .getByRole('heading', { name: 'Analyzing your footage', exact: true })
    .waitFor()
  assert.equal(generationAttempts, 2)
  project.status = 'failed'
  project.error = 'music analysis is unavailable; retry or disable synchronization'
  await page.getByRole('button', { name: 'Review music settings', exact: true }).click()
  await page.getByTestId('story-step-1').waitFor({ state: 'visible' })
  assert.ok((await page.getByTestId('selected-music').innerText()).includes(beta.title))
  await page.getByRole('checkbox', { name: 'Follow the music', exact: true }).uncheck()
  await go(2)
  assert.equal(project.options.music.sync, false)
  assert.equal(project.options.music.track_id, beta.id)
  await page.getByRole('button', { name: 'Create clips', exact: true }).click()
  await page.locator('.story-result-credits > summary').click()
  const credits = page.getByRole('region', {
    name: 'Music credits',
    exact: true
  })
  await credits.waitFor()
  assert.equal(generationAttempts, 3)
  assert.ok((await credits.innerText()).includes('The music guided parts of the edit.'))
  assert.ok(
    (await page.getByTestId('music-attribution').innerText()).includes(
      'Adapted: trimmed, faded and mixed'
    )
  )
  await page
    .getByRole('button', { name: 'Copy music credits', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Credits copied', exact: true })
    .waitFor()
  const copiedCredits = await page.evaluate(() =>
    navigator.clipboard.readText()
  )
  assert.equal(
    copiedCredits.replaceAll('\r\n', '\n'),
    project.versions[0].output.music.attribution
  )
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify(
      {
        passed: true,
        musicRequests,
        previewRequests,
        trackRequests,
        savedChanges: patches.length,
        uploadedCount,
        checks: [
          'lazy catalog',
          'real audio playback',
          'pagination',
          'empty and error states',
          'stale response cancellation',
          'selection cleanup',
          'step pause',
          'draft persistence and hydration',
          'volume and sync persistence',
          'source sound default and explicit mute persist across selection, uploads and reload',
          'zero-volume music-only warning preserves selection',
          'hosted analysis progress, retry and deliberate continuation without sync',
          'mobile 320/390px',
          'Fast Refresh preserves DOM and state',
          'remove persists',
          'upload error, cancellation and success',
          'upload blocks generation until complete',
          'excerpt validation and preview timing',
          'uploaded choice and range survive reload',
          'adaptation credits and clipboard'
        ]
      },
      null,
      2
    )
  )
} catch (error) {
  console.error(error)
  console.log(
    await page.evaluate(() => window.musicAudioEvents).catch(() => [])
  )
  const screenshotDirectory = new URL(
    '../test-results/story-music/',
    import.meta.url
  )
  mkdirSync(screenshotDirectory, { recursive: true })
  await page
    .screenshot({
      path: new URL('failure.png', screenshotDirectory).pathname.replace(
        /^\/(.:)/,
        '$1'
      ),
      fullPage: true
    })
    .catch(() => {})
  console.error(
    await page
      .locator('body')
      .innerText()
      .catch(() => 'Page unavailable')
  )
  throw error
} finally {
  releaseSlow()
  releaseUpload?.()
  if (hotEdited) writeFileSync(sourcePath, originalSource)
  await browser.close()
}
