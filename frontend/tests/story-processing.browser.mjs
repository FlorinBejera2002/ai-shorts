import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(30000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5191'
const output = process.env.TEST_SCREENSHOT_DIR || 'test-results/story-processing'
await mkdir(output, { recursive: true })
const projectID = '00000000-0000-4000-8000-000000000061'
const jobID = '00000000-0000-4000-8000-000000000062'
const options = { brief: 'Synthetic processing fixture', target_seconds: 45, aspect_ratio: '9:16', language: 'auto', mode: 'smart', preserve_order: false, captions: true }
const asset = { id: 'source-1', name: 'recording.mp4', kind: 'video', size: 12000, duration: 12, order: 0,
  role: 'auto', include: 'auto', candidates: [{ id: 'candidate-1', source_id: 'source-1', in: 0, out: 4,
    text: 'A complete source sentence.', confidence: 0.95, role: 'a_roll', reason: 'Source fixture' }] }
const limits = { max_files: 200, max_file_bytes: 2 * 1024 ** 3, max_total_bytes: 10 * 1024 ** 3, max_source_seconds: 900, max_total_seconds: 3600 }
let project = { id: projectID, status: 'pending', message: 'Fixture pending', options, assets: [asset], versions: [], current_version: 0, limits }
let job = { id: jobID, status: 'downloading', progress: 18, progress_message: 'Fixture download message' }
let cancelCount = 0
let releaseCancel
const cancelGate = new Promise((resolve) => { releaseCancel = resolve })
const mutations = []

function version(status) {
  const ready = status === 'ready'
  return { number: 1, parent: 0, accepted: true,
    plan: { title: 'Synthetic story', summary: 'A source-backed fixture.', blocks: [
      { id: 'block-1', candidate_id: 'candidate-1', role: 'hook', reason: 'Complete source phrase', locked: false, lock_text: false, lock_order: false, lock_crop: false }
    ], gaps: [] },
    timeline: [{ block_id: 'block-1', candidate_id: 'candidate-1', output_in: 0, output_out: 4,
      video: { source_id: 'source-1', in: 0, out: 4 }, audio: { source_id: 'source-1', in: 0, out: 4 } }],
    report: { status, coverage: { plan: true, file: true, audio: true, visual: ready, captions: true, semantics: true, boundaries: true,
      incomplete: ready ? [] : ['Fixture: visual review remains incomplete.'] },
    issues: ready ? [] : [{ id: 'fixture-issue', type: 'visual_match', severity: 'major', start: 0, end: 4,
      evidence: 'Fixture: this visual still needs a human check.', resolved: false }] }
  }
}

await page.route('**/v1/**', (route) => route.fulfill({ json: { access_token: 'synthetic-token', user: {
  id: '00000000-0000-4000-8000-000000000063', email: 'story-processing@example.invalid', name: 'Processing fixture', credits: 100, plan: 'free', access_role: 'member'
} } }))
await page.route('**/api/**', async (route) => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  if (path === '/api/workspace-agent/runs') return route.fulfill({ json: { runs: [], has_more: false } })
  if (path === '/api/workspace-agent/suggestions') return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  if (path === '/api/stories') return route.fulfill({ json: { stories: [project], limits } })
  if (path === `/api/stories/${projectID}/cancel`) {
    mutations.push(path)
    assert.equal(request.method(), 'POST')
    assert.deepEqual(request.postDataJSON(), {})
    cancelCount++
    await cancelGate
    project = { ...project, status: 'cancelled', message: 'Fixture cancelled after user request' }
    return route.fulfill({ json: project })
  }
  if (path === `/api/stories/${projectID}`) {
    assert.equal(request.method(), 'GET', 'Phase polling must not mutate the project')
    return route.fulfill({ json: project })
  }
  if (path === `/api/jobs/${jobID}`) return route.fulfill({ json: { job } })
  if (request.method() !== 'GET') mutations.push(path)
  return route.fulfill({ json: {} })
})

// The ProcessingCard model: one section, one progressbar with a percentage, five stage items.
const processing = page.getByTestId('story-processing')
const stageItems = () => processing.locator('ol li')
const stageState = async (index) => stageItems().nth(index).getAttribute('data-state')
const stageStates = () => stageItems().evaluateAll((items) => items.map((item) => item.getAttribute('data-state')))
const checkLayout = async () => {
  // Wait for the entrance animation to settle before measuring the page width.
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth, null, { timeout: 5000 })
    .catch(() => {})
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
    'Processing UI must fit the viewport without horizontal scrolling')
}
const checkStageLabels = async () => {
  assert.equal(await stageItems().count(), 5, 'The stage line shows all five upload stages')
  assert.equal(await stageItems().evaluateAll((items) => items.every((item) => item.scrollWidth <= item.clientWidth + 1)), true,
    'All five stage labels remain readable without clipping')
}
const capture = async (name) => {
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0) })
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true, animations: 'disabled' })
}
const waitProgress = async (value) => {
  await page.waitForFunction((expected) => document.querySelector('[data-testid="story-processing"] [role="progressbar"]')
    ?.getAttribute('aria-valuenow') === String(expected), value)
  assert.equal((await processing.innerText()).includes(`${value}%`), true, `Card shows ${value}%`)
  assert.equal(await processing.getByText(project.message, { exact: true }).count(), 0, 'Internal worker messages stay out of the customer view')
}
const advance = async (status, progress, stageIndex) => {
  project = { ...project, status, message: `Fixture ${status} ${Date.now()}` }
  await waitProgress(progress)
  const states = await stageStates()
  assert.equal(states[stageIndex], 'current', `${status} shows stage ${stageIndex} as current`)
  assert.equal(states.slice(0, stageIndex).every((state) => state === 'done'), true, `${status} completes the earlier stages`)
  assert.equal(states.slice(stageIndex + 1).every((state) => state === 'upcoming'), true, `${status} keeps later stages upcoming`)
  assert.equal(await processing.getByRole('button', { name: 'Cancel processing', exact: true }).isEnabled(), true)
}
const loadStatus = async (status, extra = {}, path = `/dashboard/create?story=${projectID}`) => {
  project = { ...project, status, message: `Fixture ${status}`, error: undefined, ...extra }
  await page.goto(`${origin}${path}`, { waitUntil: 'networkidle', timeout: 180000 })
  await processing.waitFor()
}

try {
  await loadStatus('pending')
  await waitProgress(12)
  assert.equal(await processing.getByRole('heading', { name: 'Uploading your footage', exact: true }).count(), 1)
  assert.deepEqual(await stageStates(), ['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])
  assert.equal(await processing.getAttribute('data-animated'), 'true', 'An active upload animates its orbit')
  await capture('pending-desktop')
  await advance('analyzing', 34, 1)
  await advance('building_story', 58, 2)
  await advance('improving', 78, 3)
  assert.equal(project.current_version, 0)
  assert.equal(await stageState(3), 'current', 'A pre-render repair cannot imply a completed render')
  assert.equal(await stageState(4), 'upcoming')
  await advance('editing', 78, 3)
  await advance('reviewing', 94, 4)
  assert.equal(await stageState(4), 'current', 'Repair cannot certify the final review')
  await capture('reviewing-desktop')
  await page.setViewportSize({ width: 320, height: 740 })
  await checkLayout()
  await checkStageLabels()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(await processing.locator('span[aria-hidden="true"]').evaluateAll((nodes) => nodes.every((node) =>
    getComputedStyle(node).animationName === 'none')), true, 'Reduced motion disables the decorative orbital animations')
  await capture('reviewing-mobile-reduced-motion')
  project = { ...project, current_version: 1, versions: [version('ready')] }
  project = { ...project, status: 'ready', message: 'Fixture ready after completed checks' }
  await processing.waitFor({ state: 'detached' })
  await page.getByTestId('story-result').waitFor()
  assert.equal(await page.getByText('Automatic checks completed', { exact: true }).count(), 0)

  project = { ...project, status: 'needs_review', versions: [version('needs_review')] }
  await page.goto(`${origin}/dashboard/create?story=${projectID}`, { waitUntil: 'networkidle', timeout: 180000 })
  await page.getByTestId('story-result').waitFor()
  assert.equal(await processing.count(), 0)
  assert.equal(await page.getByText('Before you publish', { exact: true }).count(), 0)
  assert.equal(await page.getByText('Technical report', { exact: true }).count(), 0)
  assert.equal(await page.getByText('Fixture: visual review remains incomplete.', { exact: true }).count(), 0)
  assert.equal(await page.getByTestId('story-block').count(), 0, 'Completed stories do not expose a second editor')
  await page.screenshot({ path: `${output}/needs-review-mobile.png`, fullPage: true, animations: 'disabled' })
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  await loadStatus('failed', { current_version: 0, versions: [], error: 'Fixture render failed; original recordings are safe.' })
  await page.locator('[data-testid="story-processing"][role="alert"]').waitFor()
  assert.equal(await processing.getByRole('heading', { name: 'Processing failed', exact: true }).count(), 1)
  assert.equal(await processing.getByText(project.error, { exact: true }).count(), 0, 'Raw failure detail remains internal')
  assert.equal(await processing.getAttribute('data-animated'), null, 'Failed work does not keep the orbit animating')
  assert.equal(await processing.locator('li[data-state="done"]').count(), 0, 'Failure must not invent which stages finished')
  assert.equal(await processing.locator('li[data-state="failed"]').count(), 1, 'The failed stage is marked with a failure state')
  assert.equal(await processing.getByRole('button', { name: 'Cancel processing', exact: true }).count(), 0)
  await capture('failed-desktop')

  await loadStatus('pending')
  const cancel = processing.getByRole('button', { name: 'Cancel processing', exact: true })
  await cancel.click()
  await page.waitForFunction(() => document.querySelector('[data-testid="story-processing"] button')?.disabled)
  assert.equal(cancelCount, 1)
  assert.equal(await cancel.isDisabled(), true, 'Pending cancellation cannot be submitted twice')
  releaseCancel()
  await processing.getByRole('heading', { name: 'Processing stopped', exact: true }).waitFor()
  assert.equal(await stageItems().count(), 0, 'A stopped upload shows no stage line')
  assert.equal(await processing.getByRole('button', { name: 'Cancel processing', exact: true }).count(), 0)
  assert.equal(project.assets[0].id, 'source-1')
  assert.deepEqual(mutations, [`/api/stories/${projectID}/cancel`])

  project = { ...project, status: 'reviewing', message: 'Fixture Romanian review' }
  await page.goto(`${origin}/ro/dashboard/create?story=${projectID}`, { waitUntil: 'networkidle', timeout: 180000 })
  await processing.getByRole('heading', { name: 'Verificăm clipul', exact: true }).waitFor()
  await waitProgress(94)
  await checkLayout()
  await checkStageLabels()
  await capture('reviewing-ro-mobile')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${origin}/dashboard/jobs/${jobID}`, { waitUntil: 'networkidle', timeout: 180000 })
  const linkPanel = page.getByTestId('job-processing')
  await linkPanel.getByRole('heading', { name: 'Downloading the video', exact: true }).waitFor()
  assert.equal(await linkPanel.getByRole('progressbar').getAttribute('aria-valuenow'), '18')
  job = { ...job, status: 'transcribing', progress: 42, progress_message: 'Fixture transcription message' }
  await linkPanel.getByRole('heading', { name: 'Transcribing speech', exact: true }).waitFor()
  assert.equal(await linkPanel.getByRole('progressbar').getAttribute('aria-valuenow'), '42')
  await capture('link-transcribing-desktop')
  job = { ...job, status: 'completed', progress: 96 }
  await page.getByTestId('job-complete').waitFor()
  assert.equal(await page.getByTestId('job-complete').getByRole('progressbar').count(), 0, 'The done hero follows the canvas and shows no progress bar')
  assert.equal(await page.getByTestId('job-complete').getByRole('heading', { name: 'All clips are ready!', exact: true }).count(), 1)
  await page.getByTestId('job-complete').getByRole('link', { name: 'View clips', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS: story processing card phases with percentages, stage states, pre/post-render repair gates, verified completion, needs-review and failure states, one cancellation, 320px and reduced motion, Romanian copy, and YouTube job card download/transcribe/completed')
} finally {
  releaseCancel()
  await browser.close()
}
