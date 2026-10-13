import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE) throw Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5192'
const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, permissions: ['clipboard-read', 'clipboard-write'] })
const page = await context.newPage()
page.setDefaultTimeout(60000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const sourcePath = new URL('../src/components/story/story-music.tsx', import.meta.url)
const originalSource = readFileSync(sourcePath, 'utf8')
let hotEdited = false
let musicRequests = 0
let previewRequests = 0
let trackRequests = 0
let slowRequested = false
let releaseSlow
const slowGate = new Promise((resolve) => { releaseSlow = resolve })
const patches = []
const track = (id, title) => ({ id, title, artist: 'Kevin MacLeod', duration_seconds: 128, bpm: 120,
  genres: ['Acoustic'], moods: ['Bright'], preview_url: `${origin}/fixture-music.wav?id=${id}`,
  source_url: 'https://incompetech.com/music/royalty-free/', license: 'CC BY 4.0',
  license_url: 'https://creativecommons.org/licenses/by/4.0/', attribution: `${title} by Kevin MacLeod. CC BY 4.0.` })
const alpha = track('incompetech:alpha', 'Quiet Morning')
const beta = track('incompetech:beta', 'Bright Afternoon')
const gamma = track('incompetech:gamma', 'Long title for a cinematic evening with a very wide horizon')
const tracks = [alpha, beta, gamma]
const project = {
  id: '00000000-0000-4000-8000-000000000071', status: 'draft', current_version: 0,
  options: { brief: 'Keep my dialogue intact.', target_seconds: 45, aspect_ratio: '9:16', language: 'auto', mode: 'smart', preserve_order: true, captions: false, caption_mode: 'off' },
  assets: [{ id: 'clip-one', name: 'Synthetic clip.mp4', duration: 12, size: 12000, kind: 'video', role: 'auto', include: 'auto', order: 0 }],
  versions: [], limits: { max_files: 20, max_file_bytes: 2 * 1024 ** 3, max_total_bytes: 10 * 1024 ** 3, max_source_seconds: 900, max_total_seconds: 3600 }
}
const wave = Buffer.alloc(44 + 8000 * 2 * 12)
wave.write('RIFF', 0); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8)
wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22)
wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34)
wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40)
for (let i = 0; i < 8000 * 12; i++) wave.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / 8000) * 1000), 44 + i * 2)

await page.route('**/v1/**', (route) => route.fulfill({ json: { access_token: 'synthetic-token', user: { id: '00000000-0000-4000-8000-000000000071', email: 'music@example.invalid', name: 'Music fixture', credits: 100, plan: 'free', access_role: 'member' } } }))
await page.route('**/fixture-music.wav*', (route) => { previewRequests++; return route.fulfill({ contentType: 'audio/wav', body: wave }) })
await page.route('**/api/**', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  const path = url.pathname
  if (path === '/api/music') {
    musicRequests++
    const query = url.searchParams.get('query')
    const number = Number(url.searchParams.get('page'))
    if (query === 'error') return route.fulfill({ status: 503, json: { error: 'Synthetic provider unavailable' } })
    if (query === 'slow') { slowRequested = true; await slowGate }
    const found = query === 'empty' ? [] : query === 'bright' ? [beta] : number === 2 ? [gamma] : [alpha, beta]
    return route.fulfill({ json: { tracks: found, total: query ? found.length : 3, page: number, has_more: !query && number === 1 } }).catch(() => {})
  }
  if (path.startsWith('/api/music/')) {
    trackRequests++
    return route.fulfill({ json: tracks.find((item) => item.id === decodeURIComponent(path.split('/').pop())) })
  }
  if (path === '/api/stories') return route.fulfill({ json: { stories: [project], limits: project.limits } })
  if (path === `/api/stories/${project.id}/generate`) {
    project.status = 'ready'; project.current_version = 1
    project.versions = [{ number: 1, parent: 0, accepted: true,
      plan: { title: 'Music fixture', summary: '', blocks: [] }, timeline: [],
      output: { music: { track_id: beta.id, title: beta.title, artist: beta.artist, source_url: beta.source_url, license: beta.license, license_url: beta.license_url,
        attribution: `${beta.attribution}\nAdapted: trimmed, faded and mixed for this video.`, sync_status: 'partial', adjusted_cuts: 2, bpm: beta.bpm } },
      report: { status: 'ready', coverage: { plan: true, file: true, audio: true, visual: true, captions: true, semantics: true, boundaries: true } } }]
    return route.fulfill({ json: project })
  }
  if (path === `/api/stories/${project.id}`) {
    if (request.method() === 'PATCH') { project.options = request.postDataJSON().options; patches.push(structuredClone(project.options)) }
    return route.fulfill({ json: project })
  }
  if (path === '/api/workspace-agent/runs') return route.fulfill({ json: { runs: [], has_more: false } })
  if (path === '/api/workspace-agent/suggestions') return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  return route.fulfill({ json: {} })
})
const wizard = page.getByTestId('story-wizard')
const next = async (step) => {
  await wizard.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByTestId(`story-step-${step}`).waitFor({ state: 'visible' })
}
const go = async (step) => {
  await wizard.locator('nav button').nth(step).click()
  await page.getByTestId(`story-step-${step}`).waitFor({ state: 'visible' })
}
const search = async (value) => {
  await page.getByRole('searchbox', { name: 'Search music' }).or(page.getByRole('textbox', { name: 'Search music' })).fill(value)
  await page.getByRole('button', { name: 'Search tracks', exact: true }).click()
}

try {
  await page.goto(`${origin}/dashboard/create?story=${project.id}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.getByTestId('story-step-0').waitFor({ state: 'visible' })
  console.log('Music browser: fixture loaded')
  assert.equal(musicRequests, 0, 'The catalog is not fetched before being opened')
  await next(1)
  await page.getByRole('button', { name: 'Browse free music', exact: true }).click()
  await page.getByRole('button', { name: `Select ${alpha.title}`, exact: true }).waitFor()
  assert.equal(previewRequests, 0, 'Browsing fetches metadata only')
  await page.getByRole('button', { name: `Preview ${alpha.title}`, exact: true }).click()
  await page.waitForFunction(() => { const audio = document.querySelector('[data-testid="music-preview"] audio'); return audio && !audio.paused && audio.currentTime > 0 })
  await page.evaluate(() => { window.previousMusicPlayer = document.querySelector('[data-testid="music-preview"] audio') })
  await page.getByRole('button', { name: `Select ${alpha.title}`, exact: true }).click()
  assert.equal(await page.evaluate(() => window.previousMusicPlayer.paused), true, 'Selecting a track stops the previous stream')
  assert.equal(await page.getByRole('checkbox', { name: 'Match the edit to the music', exact: true }).isChecked(), true)
  assert.equal(await page.getByRole('slider', { name: 'Music volume', exact: false }).inputValue(), '0.18')
  await page.getByRole('button', { name: 'Next tracks', exact: true }).click()
  await page.getByRole('button', { name: `Select ${gamma.title}`, exact: true }).waitFor()
  assert.ok(await page.getByTestId('selected-music').innerText().then((value) => value.includes(alpha.title)), 'Pagination keeps the chosen track visible')
  await search('empty')
  await page.getByText('No tracks found. Try a different title, mood or genre.', { exact: true }).waitFor()
  await search('slow')
  const slowDeadline = Date.now() + 10000
  while (!slowRequested && Date.now() < slowDeadline) await new Promise((resolve) => setTimeout(resolve, 20))
  assert.ok(slowRequested, 'The pending request was sent before searching again')
  await search('bright')
  await page.getByRole('button', { name: `Select ${beta.title}`, exact: true }).waitFor()
  releaseSlow()
  await page.waitForTimeout(200)
  assert.equal(await page.getByTestId('music-catalog').getByRole('button', { name: `Select ${alpha.title}`, exact: true }).count(), 0, 'An outdated response never replaces the latest search')
  await search('error')
  await page.getByRole('button', { name: 'Retry music search', exact: true }).waitFor()
  assert.ok((await page.getByTestId('selected-music').innerText()).includes(alpha.title), 'A catalog outage preserves the selected track')
  await search('bright')
  await page.getByRole('button', { name: `Select ${beta.title}`, exact: true }).click()
  const volume = page.getByRole('slider', { name: 'Music volume', exact: false })
  await volume.fill('0.27')
  await page.getByRole('checkbox', { name: 'Match the edit to the music', exact: true }).uncheck()
  await page.getByRole('button', { name: 'Preview selected music', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[data-testid="music-preview"] audio').paused)
  await next(2)
  assert.equal(await page.locator('[data-testid="music-preview"] audio').evaluate((audio) => audio.paused), true, 'Moving to another step pauses the mounted audio player')
  await next(3)
  console.log('Music browser: search, audio and saved choices verified')
  assert.deepEqual(project.options.music, { track_id: beta.id, volume: 0.27, sync: false })
  assert.ok((await page.getByTestId('music-summary').innerText()).includes(beta.title))
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.getByTestId('story-step-3').waitFor({ state: 'visible' })
  console.log('Music browser: saved draft reloaded')
  await go(1)
  await page.getByTestId('selected-music').getByText(beta.title, { exact: true }).waitFor()
  assert.ok(trackRequests > 0, 'Reload hydrates the saved track identifier from the catalog endpoint')
  assert.equal(await volume.inputValue(), '0.27')
  assert.equal(await page.getByRole('checkbox', { name: 'Match the edit to the music', exact: true }).isChecked(), false)
  await page.getByRole('button', { name: 'Change music', exact: true }).click()
  await page.getByRole('button', { name: 'Next tracks', exact: true }).click()
  await page.getByRole('button', { name: `Select ${gamma.title}`, exact: true }).waitFor()
  const screenshotDirectory = new URL('../test-results/story-music/', import.meta.url)
  mkdirSync(screenshotDirectory, { recursive: true })
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 960 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `Music UI fits ${width}px`)
    await page.screenshot({ path: new URL(`catalog-${width}.png`, screenshotDirectory).pathname.replace(/^\/(.:)/, '$1'), fullPage: true, animations: 'disabled' })
  }
  await page.setViewportSize({ width: 1280, height: 960 })
  await page.evaluate(() => { window.musicPageMarker = 'keep'; window.musicPanel = document.querySelector('[data-testid="story-music"]') })
  hotEdited = true
  writeFileSync(sourcePath, originalSource.replace("'Background music', 'Muzică de fundal'", "'Background music test', 'Muzică de fundal'"))
  await page.getByRole('group', { name: 'Background music test', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.musicPageMarker), 'keep', 'Fast Refresh does not reload the page')
  assert.equal(await page.evaluate(() => window.musicPanel === document.querySelector('[data-testid="story-music"]')), true, 'Fast Refresh preserves the component DOM boundary')
  assert.equal(await volume.inputValue(), '0.27')
  await page.getByRole('button', { name: `Select ${gamma.title}`, exact: true }).waitFor()
  writeFileSync(sourcePath, originalSource); hotEdited = false
  console.log('Music browser: responsive layout and Fast Refresh verified')
  await page.getByRole('group', { name: 'Background music', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Remove music', exact: true }).click()
  assert.equal(await page.getByTestId('selected-music').count(), 0)
  await go(3)
  assert.equal(project.options.music, null, 'Removing music is persisted explicitly')
  await go(1)
  await search('bright')
  await page.getByRole('button', { name: `Select ${beta.title}`, exact: true }).click()
  await go(3)
  await page.getByRole('checkbox', { name: 'All my clips are uploaded. Use this complete set.', exact: true }).check()
  await page.getByRole('button', { name: 'Build my story', exact: true }).click()
  const credits = page.getByRole('region', { name: 'Music credits', exact: true })
  await credits.waitFor()
  assert.ok((await credits.innerText()).includes('Some cuts follow the beat.'))
  assert.ok((await page.getByTestId('music-attribution').innerText()).includes('Adapted: trimmed, faded and mixed'))
  await page.getByRole('button', { name: 'Copy music credits', exact: true }).click()
  await page.getByRole('button', { name: 'Credits copied', exact: true }).waitFor()
  const copiedCredits = await page.evaluate(() => navigator.clipboard.readText())
  assert.equal(copiedCredits.replaceAll('\r\n', '\n'), project.versions[0].output.music.attribution)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, musicRequests, previewRequests, trackRequests, savedChanges: patches.length, checks: ['lazy catalog', 'real audio playback', 'pagination', 'empty and error states', 'stale response cancellation', 'selection cleanup', 'step pause', 'draft persistence and hydration', 'volume and sync persistence', 'mobile 320/390px', 'Fast Refresh preserves DOM and state', 'remove persists', 'adaptation credits and clipboard'] }, null, 2))
} catch (error) {
  console.error(error)
  const screenshotDirectory = new URL('../test-results/story-music/', import.meta.url)
  mkdirSync(screenshotDirectory, { recursive: true })
  await page.screenshot({ path: new URL('failure.png', screenshotDirectory).pathname.replace(/^\/(.:)/, '$1'), fullPage: true }).catch(() => {})
  console.error(await page.locator('body').innerText().catch(() => 'Page unavailable'))
  throw error
} finally {
  releaseSlow()
  if (hotEdited) writeFileSync(sourcePath, originalSource)
  await browser.close()
}
