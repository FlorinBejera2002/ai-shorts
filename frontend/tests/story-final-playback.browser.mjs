import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

if (!process.env.PLAYWRIGHT_MODULE || !process.env.TEST_RENDER_DIR)
  throw Error('Set PLAYWRIGHT_MODULE and TEST_RENDER_DIR to the final isolated render fixtures')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const directory = resolve(process.env.TEST_RENDER_DIR)
const modes = ['all', 'off']
const fixtures = new Map()
const projects = modes.map((mode, index) => ({ id: `00000000-0000-4000-8000-00000000009${index}`, mode }))
const evidence = { inputs: {}, seek: {}, playback: {} }
for (const project of projects) {
  const mode = project.mode
  const bytes = await readFile(join(directory, `${mode}.mp4`))
  fixtures.set(`/fixture/${mode}.mp4`, bytes)
  evidence.inputs[mode] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }
  const version = JSON.parse(await readFile(join(directory, `${mode}-timeline-version.json`), 'utf8'))
  project.status = version.report.status
  project.options = version.render_options
  project.current_version = version.number
  project.versions = [{ ...version, preview_url: `/fixture/${mode}.mp4` }]
  project.assets = ['source-001', 'source-002'].map((id, index) => ({
    id, name: `${index + 1}-synthetic-source.mp4`, duration: 4, size: 20000, order: index,
    kind: 'video', role: 'auto', include: 'auto',
    candidates: version.timeline.filter((entry) => entry.video.source_id === id).map((entry) => ({
      id: entry.candidate_id, source_id: id, in: entry.video.in, out: entry.video.out,
      text: (entry.words ?? []).map((word) => word.text).join(' '), reason: '', confidence: 1
    }))
  }))
  project.limits = { max_files: 20, max_file_bytes: 2 * 1024 ** 3, max_total_bytes: 10 * 1024 ** 3, max_source_seconds: 900, max_total_seconds: 3600 }
}
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
page.setDefaultTimeout(60000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
await page.route('**/fixture/**', (route) => {
  const bytes = fixtures.get(new URL(route.request().url()).pathname)
  assert.ok(bytes, 'Only the authorized final fixture files are served')
  const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/)
  if (!range) return route.fulfill({ body: bytes, contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes' } })
  const start = Number(range[1])
  const end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1
  if (start >= bytes.length) return route.fulfill({ status: 416, headers: { 'Content-Range': `bytes */${bytes.length}` } })
  return route.fulfill({ status: 206, body: bytes.subarray(start, end + 1), contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } })
})
await page.route('**/v1/**', (route) => route.fulfill({ json: {
  access_token: 'synthetic-token', user: { id: '00000000-0000-4000-8000-000000000099', email: 'playback@example.invalid', name: 'Playback fixture', credits: 100, plan: 'free', access_role: 'member' }
} }))
await page.route('**/api/**', (route) => {
  assert.equal(route.request().method(), 'GET', 'Playback verification never mutates a database')
  const path = new URL(route.request().url()).pathname
  if (path === '/api/stories') return route.fulfill({ json: { stories: projects } })
  const project = projects.find((entry) => path === `/api/stories/${entry.id}`)
  if (project) return route.fulfill({ json: project })
  if (path === '/api/workspace-agent/runs') return route.fulfill({ json: { runs: [], has_more: false } })
  if (path === '/api/workspace-agent/suggestions') return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  return route.fulfill({ json: {} })
})
const player = page.getByLabel('Clip preview', { exact: true })
const inspect = async (seconds, capture = false) => {
  await player.evaluate((video, time) => { video.pause(); video.currentTime = time }, seconds)
  await page.waitForFunction((time) => {
    const video = document.querySelector('video[aria-label="Clip preview"]')
    return video && !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - time) < 0.03
  }, seconds)
  return player.evaluate(async (video, capture) => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const canvas = document.createElement('canvas')
    canvas.width = 360; canvas.height = 640
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(video, 0, 0, 360, 640)
    const pixels = context.getImageData(45, 285, 60, 70).data
    const mean = [0, 0, 0]
    for (let i = 0; i < pixels.length; i += 4)
      for (let channel = 0; channel < 3; channel++) mean[channel] += pixels[i + channel] / (pixels.length / 4)
    const captionPixels = context.getImageData(36, 440, 288, 185).data
    let whiteCaptionPixels = 0
    for (let i = 0; i < captionPixels.length; i += 4)
      if (captionPixels[i] > 180 && captionPixels[i + 1] > 180 && captionPixels[i + 2] > 180) whiteCaptionPixels++
    return { time: video.currentTime, rgb: mean.map((value) => Math.round(value * 10) / 10), whiteCaptionPixels,
      ...(capture ? { png: canvas.toDataURL('image/png').split(',')[1] } : {}) }
  }, capture)
}
try {
  const origin = process.env.TEST_ORIGIN || 'http://localhost:3000'
  await page.goto(`${origin}/dashboard/create?story=${projects[0].id}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  for (const project of projects) {
    const mode = project.mode
    if (mode !== modes[0]) await page.getByRole('combobox', { name: 'Open project', exact: true }).selectOption(project.id)
    await player.waitFor()
    await page.waitForFunction(() => document.querySelector('video[aria-label="Clip preview"]')?.readyState >= 2)
    const metadata = await player.evaluate((video) => ({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }))
    assert.ok(Math.abs(metadata.duration - 8) < 0.1, JSON.stringify(metadata))
    evidence.inputs[mode].metadata = metadata
    evidence.seek[mode] = []
    for (const time of [7.8, 2, 4, 1, 1.9, 2.1, 2.24, 3.9, 4.05, 5, 6.2, 7]) {
      const frame = await inspect(time, [1, 2, 4, 5].includes(time))
      const expected = time < 4 ? 'blue' : 'green'
      const [red, green, blue] = frame.rgb
      assert.ok(Math.max(red, green, blue) > 30, `${mode} direct seek ${time}s decoded black: ${frame.rgb}`)
      assert.ok(expected === 'blue' ? blue > green + 15 : green > blue + 10, `${mode} ${time}s expected ${expected}, got ${frame.rgb}`)
      if (frame.png) {
        await writeFile(join(directory, `browser-${mode}-at-${time}.png`), Buffer.from(frame.png, 'base64'))
        delete frame.png
      }
      evidence.seek[mode].push(frame)
    }
    for (const time of [1, 5]) {
      const frame = evidence.seek[mode].find((entry) => entry.time === time)
      assert.ok(mode === 'all' ? frame.whiteCaptionPixels > 30 : frame.whiteCaptionPixels < 10, `${mode} caption visibility at ${time}s: ${frame.whiteCaptionPixels}`)
    }
    for (const time of [2, 7])
      assert.ok(evidence.seek[mode].find((entry) => entry.time === time).whiteCaptionPixels < 10, `${mode}: pause at ${time}s has no subtitle text`)
    await inspect(1.7)
    evidence.playback[mode] = await player.evaluate(async (video) => {
      const canvas = document.createElement('canvas'); canvas.width = 90; canvas.height = 160
      const context = canvas.getContext('2d', { willReadFrequently: true })
      const frames = []
      video.muted = true
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { video.pause(); reject(Error('Sequential boundary playback timed out')) }, 15000)
        const tick = (_now, metadata) => {
          context.drawImage(video, 0, 0, 90, 160)
          const [r, g, b] = context.getImageData(20, 80, 1, 1).data
          frames.push({ time: metadata.mediaTime, rgb: [r, g, b] })
          if (metadata.mediaTime >= 4.2) { clearTimeout(timeout); video.pause(); resolve(frames) }
          else video.requestVideoFrameCallback(tick)
        }
        video.requestVideoFrameCallback(tick)
        video.play().catch((error) => { clearTimeout(timeout); reject(error) })
      })
    })
    assert.ok(evidence.playback[mode].length > 30, 'Observe actual decoded frames across both boundaries')
    for (const frame of evidence.playback[mode]) {
      assert.ok(Math.max(...frame.rgb) > 30, `${mode} sequential black frame at ${frame.time}s`)
      const expectedBlue = frame.time < 3.99
      assert.ok(expectedBlue ? frame.rgb[2] > frame.rgb[1] + 15 : frame.rgb[1] > frame.rgb[2] + 10,
        `${mode} wrong sequential source at ${frame.time}s: ${frame.rgb}`)
    }
    const firstGreen = evidence.playback[mode].find((frame) => frame.rgb[1] > frame.rgb[2] + 10)
    assert.ok(Math.abs(firstGreen.time - 4) < 0.05, `Source changes at 4s, got ${firstGreen.time}`)
  }
  assert.deepEqual(errors, [])
  await writeFile(join(directory, 'browser-playback-evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ status: 'PASS', inputs: evidence.inputs, directSeeksPerMode: 12,
    sequentialFrames: Object.fromEntries(modes.map((mode) => [mode, evidence.playback[mode].length])),
    checks: 'No black frames; blue source 0-4s then green source; exact 4s change; all captions at1s/5s and no captions during pauses; off captions absent; real preview and range requests; mocked read-only APIs' }))
} catch (error) {
  await writeFile(join(directory, 'browser-playback-evidence.json'), JSON.stringify({ ...evidence, error: error.message, pageErrors: errors }, null, 2))
  throw error
} finally {
  await browser.close()
}
