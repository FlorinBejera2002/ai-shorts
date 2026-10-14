import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE || !process.env.FFMPEG_BINARY) throw new Error('Set PLAYWRIGHT_MODULE and FFMPEG_BINARY')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const scratchRoot = resolve('../.cache/tmp')
await mkdir(scratchRoot, { recursive: true })
const scratch = await mkdtemp(join(scratchRoot, 'audio-browser-'))
const output = resolve('test-results/audio-cleanup')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } })
page.setDefaultTimeout(45000)
async function removeScratch(directory) {
  if (!directory.startsWith(scratchRoot + '/') && !directory.startsWith(scratchRoot + '\\')) throw new Error('Unsafe scratch cleanup target')
  await rm(directory, { recursive: true, force: true })
}
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5196'
const id = '00000000-0000-4000-8000-000000000088'
const creates = []
const retries = []
let cancels = 0
let cleanupAvailable = false
let failNextRetry = true
let job = { id, status: 'failed', progress: 56, processing_active: false, error_message: 'Noise reduction failed', audio_cleanup: { status: 'failed', message: 'Background noise reduction is not configured.' }, original_audio_url: '/fixture/original.mp4' }
try {
  const fixture = join(scratch, 'source.mp4')
  execFileSync(process.env.FFMPEG_BINARY, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=gray:s=160x90:r=10', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', fixture])
  const media = await readFile(fixture)
  await page.route('**/fixture/**', (route) => {
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/)
    if (!range) return route.fulfill({ contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes', 'Content-Length': String(media.length) }, body: media })
    const start = Number(range[1])
    const end = range[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1
    return route.fulfill({ status: 206, contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${media.length}`, 'Content-Length': String(end - start + 1) }, body: media.subarray(start, end + 1) })
  })
  await page.route('**/v1/**', (route) => route.fulfill({ json: { access_token: 'synthetic-token', user: { id: '00000000-0000-4000-8000-000000000089', email: 'audio-fixture@example.invalid', name: 'Audio fixture', credits: 1000, plan: 'free', access_role: 'member' } } }))
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/media-capabilities') return route.fulfill({ json: { audio_cleanup: { available: cleanupAvailable } } })
    if (path === '/api/user/credits') return route.fulfill({ json: { credits: 1000 } })
    if (path === '/api/stories') return route.fulfill({ json: { stories: [] } })
    if (path === '/api/user/brand') return route.fulfill({ json: { brandKit: null } })
    if (path === '/api/workspace-agent/runs') return route.fulfill({ json: { runs: [], has_more: false } })
    if (path === '/api/workspace-agent/suggestions') return route.fulfill({ json: { suggestions: [], capabilities: [] } })
    if (path === '/api/upload/authorize') return route.fulfill({ json: { uploadUrl: '/api/upload', token: null } })
    if (path === '/api/upload') return route.fulfill({ json: { file_path: 'uploads/synthetic/source.mp4' } })
    if (path === '/api/jobs' && request.method() === 'POST') {
      creates.push(request.postDataJSON())
      return route.fulfill({ json: { id } })
    }
    if (path === `/api/jobs/${id}/retry`) {
      retries.push(request.postDataJSON())
      if (failNextRetry) {
        failNextRetry = false
        return route.fulfill({ status: 503, json: { detail: 'Synthetic retry failed' } })
      }
      await new Promise((resolve) => setTimeout(resolve, 300))
      job = { ...job, status: 'pending', processing_active: false, audio_cleanup: undefined }
      return route.fulfill({ json: { job } })
    }
    if (path === `/api/jobs/${id}/cancel`) {
      cancels++
      job = { ...job, status: 'cancelled', processing_active: false }
      return route.fulfill({ json: { job } })
    }
    if (path === `/api/jobs/${id}`) return route.fulfill({ json: { job } })
    return route.fulfill({ json: {} })
  })
  await page.goto(origin + '/dashboard/create?mode=upload', { waitUntil: 'domcontentloaded', timeout: 180000 })
  const toggle = page.locator('#create-noise-reduction')
  await toggle.waitFor({ state: 'visible' })
  assert.equal(await toggle.getAttribute('aria-checked'), 'false')
  await page.getByText('Noise reduction is not available yet. You can generate with original audio.').waitFor()
  assert.equal(await toggle.isDisabled(), true, 'Unavailable production capability cannot be selected')
  assert.equal(creates.length, 0)
  cleanupAvailable = true
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.querySelector('#create-noise-reduction')?.disabled === false)
  await toggle.click()
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  await page.locator('input[type=file][accept*="video/mp4"]').last().setInputFiles(fixture)
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await page.getByRole('button', { name: 'Continue with original audio', exact: true }).waitFor()
  assert.equal(creates.length, 1)
  assert.deepEqual(creates[0].audio_cleanup, { enabled: true })
  await page.screenshot({ path: join(output, 'desktop-failure.png'), fullPage: true })

  await page.getByRole('button', { name: 'Retry processing', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Synthetic retry failed' }).waitFor()
  await page.getByRole('button', { name: 'Retry processing', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel processing', exact: true }).waitFor()
  assert.equal(retries.length, 2)
  assert.equal(retries[0].request_id, retries[1].request_id, 'A network/server retry replays its idempotency key')
  assert.equal(retries[1].audio_cleanup, undefined)
  await page.getByRole('button', { name: 'Cancel processing', exact: true }).click()
  await page.getByRole('button', { name: 'Retry processing', exact: true }).waitFor()
  assert.equal(cancels, 1)

  job = { ...job, status: 'failed', audio_cleanup: { status: 'failed', message: 'failure' } }
  await page.reload({ waitUntil: 'domcontentloaded' })
  const original = page.getByRole('button', { name: 'Continue with original audio', exact: true })
  await original.waitFor()
  // Dispatch same-tick clicks: the ref guard, not just disabled styling, deduplicates.
  await original.evaluate((element) => { element.click(); element.click() })
  await page.getByRole('button', { name: 'Cancel processing', exact: true }).waitFor()
  assert.equal(retries.length, 3)
  assert.deepEqual(retries[2].audio_cleanup, { enabled: false })

  job = { ...job, status: 'completed', audio_cleanup: { status: 'ready' }, processed_audio_url: '/fixture/processed.mp4' }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('Compare audio', { exact: true }).click()
  const audio = page.locator('audio')
  await page.waitForFunction(() => document.querySelector('audio')?.readyState >= 1)
  await audio.evaluate((element) => { element.currentTime = 1 })
  await page.waitForFunction(() => Math.abs(document.querySelector('audio').currentTime - 1) < 0.1)
  await page.getByRole('button', { name: 'Processed', exact: true }).click()
  await page.waitForFunction(() => { const a = document.querySelector('audio'); return a?.currentSrc.endsWith('/fixture/processed.mp4') && Math.abs(a.currentTime - 1) < 0.1 }).catch(async (error) => { throw new Error(JSON.stringify(await audio.evaluate((element) => ({ source: element.currentSrc, time: element.currentTime, duration: element.duration, ready: element.readyState, error: element.error?.message }))) + ': ' + error.message) })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: join(output, 'mobile-comparison.png'), fullPage: true })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, creates: creates.length, retryRequests: retries.length, cancellation: cancels, desktop: '1280x960', mobile: '390x844', mediaComparisonRetainsTime: true }))
} finally {
  await browser.close()
  await removeScratch(scratch)
}
