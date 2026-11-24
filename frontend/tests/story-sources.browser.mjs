import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Footage source step: upload list, keyboard and pointer reordering, refused-file
// toast and the mobile layout. Runs against the Vite dev server with an in-page
// synthetic API; no database or provider calls.
if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5196'
const screenshots = join(process.cwd(), 'test-results', 'story-sources')
mkdirSync(screenshots, { recursive: true })

const GB = 1024 ** 3
const limits = {
  max_files: 0,
  max_file_bytes: 2 * GB,
  max_total_bytes: 10 * GB,
  max_source_seconds: 900,
  max_total_seconds: 3600
}
const sizes = {
  'interviu-mara-partea-1.mp4': 1.2 * GB,
  'interviu-mara-partea-2.mp4': 0.98 * GB,
  'b-roll-studio.mov': 0.42 * GB,
  'slow-cut.mp4': 0.3 * GB,
  'replacement.mp4': 0.2 * GB
}
const durations = {
  'interviu-mara-partea-1.mp4': 760,
  'interviu-mara-partea-2.mp4': 605,
  'b-roll-studio.mov': 192,
  'slow-cut.mp4': 90,
  'replacement.mp4': 45
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 960 } })
page.setDefaultTimeout(30000)
const pageErrors = []
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(message.text().slice(0, 400)) })

let project
const patches = []
const apiLog = []
const registrations = []
let releaseSlow
const slowGate = new Promise((resolve) => {
  releaseSlow = resolve
})

const assetFor = (name, id, order) => ({
  id,
  name,
  size: sizes[name] ?? GB,
  duration: durations[name] ?? 60,
  role: 'auto',
  include: 'auto',
  order,
  kind: 'video',
  candidates: [],
  source_url: `/original/${id}.mp4`
})

await page.route('**/v1/**', (route) =>
  route.fulfill({
    json: {
      access_token: 'synthetic-token',
      user: {
        id: '00000000-0000-4000-8000-000000000077',
        email: 'sources-fixture@example.invalid',
        name: 'Sources fixture',
        credits: 100,
        plan: 'free',
        access_role: 'member'
      }
    }
  })
)
await page.route('**/original/**', (route) => route.fulfill({ status: 204 }))
await page.route('**/api/**', async (route) => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  const method = request.method()
  apiLog.push(method + ' ' + path)
  if (path === '/api/dashboard')
    return route.fulfill({
      json: {
        metrics: { credits: 100, plan: 'free', jobCount: 0, clipCount: 0, durationMinutes: 0, activity: [], statuses: {} },
        recentClips: []
      }
    })
  if (path === '/api/stories' && method === 'GET')
    return route.fulfill({ json: { stories: project ? [project] : [], limits } })
  if (path === '/api/stories' && method === 'POST') {
    const body = request.postDataJSON()
    project = { id: body.id, options: body.options, status: 'draft', limits, assets: [], versions: [], current_version: 0 }
    return route.fulfill({ json: project })
  }
  if (path === '/api/upload/authorize')
    return route.fulfill({ json: { uploadUrl: '', token: null } })
  if (path === '/api/upload') {
    const body = request.postData() ?? ''
    const name = /filename="([^"]+)"/.exec(body)?.[1] ?? 'unknown.mp4'
    if (name === 'slow-cut.mp4') await slowGate
    return route.fulfill({ json: { file_path: `uploads/${name}` } })
  }
  if (project && path === `/api/stories/${project.id}/assets` && method === 'POST') {
    const body = request.postDataJSON()
    registrations.push(body.name)
    project = {
      ...project,
      assets: [...project.assets, assetFor(body.name, body.id, body.order)].sort((a, b) => a.order - b.order)
    }
    return route.fulfill({ json: project })
  }
  if (project && path === `/api/stories/${project.id}` && method === 'PATCH') {
    const body = request.postDataJSON()
    patches.push(body)
    if (body.assets) {
      const order = new Map(body.assets.map((asset) => [asset.id, asset.order]))
      project = {
        ...project,
        assets: project.assets.map((asset) => ({ ...asset, order: order.get(asset.id) ?? asset.order })).sort((a, b) => a.order - b.order)
      }
    }
    return route.fulfill({ json: project })
  }
  if (project && path === `/api/stories/${project.id}` && method === 'GET')
    return route.fulfill({ json: project })
  // Agent and other side panels load on the page; answer them empty so only real failures reach the console.
  if (path === '/api/workspace-agent/runs') return route.fulfill({ json: { runs: [], has_more: false } })
  if (path === '/api/workspace-agent/suggestions') return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  return route.fulfill({ json: {} })
})

const names = () => page.locator('[data-testid="validated-source"] p[title]').allInnerTexts()
const rowGrip = (name) => page.getByRole('button', { name: `Drag to move ${name}`, exact: true })
const waitForNames = async (expected) => {
  await page.waitForFunction(
    (wanted) =>
      JSON.stringify(
        Array.from(document.querySelectorAll('[data-testid="validated-source"] p[title]')).map((node) => node.textContent)
      ) === JSON.stringify(wanted),
    expected,
    { timeout: 15000 }
  ).catch(async (cause) => {
    const actual = await names()
    const visible = (await page.locator('main, body').first().innerText().catch(() => '')).slice(0, 600)
    throw new Error(`Expected ${JSON.stringify(expected)} but saw ${JSON.stringify(actual)}: ${cause.message}\nPAGE: ${visible}\nAPI: ${JSON.stringify(apiLog)}\nERR: ${JSON.stringify(pageErrors)}`)
  })
}
const toastFor = (name) => page.getByText(`${name} does not meet the format limits`, { exact: true })

try {
  await page.goto(`${origin}/dashboard/create`, { waitUntil: 'networkidle', timeout: 180000 })
  await page.getByRole('button', { name: 'Choose files', exact: true }).waitFor({ state: 'visible' })
  const drop = page.getByRole('heading', { name: 'Drop footage here', exact: true })
  assert.equal(await drop.isVisible(), true, 'desktop dropzone title shown')
  assert.equal(await page.getByRole('complementary', { name: 'Limits' }).isVisible(), true, 'desktop limits aside shown')
  await page.screenshot({ path: join(screenshots, 'desktop-source.png') })

  // Batch of three files: the saved order follows the picker order.
  const input = page.getByLabel('Upload clips', { exact: true })
  await input.setInputFiles(
    ['interviu-mara-partea-1.mp4', 'interviu-mara-partea-2.mp4', 'b-roll-studio.mov'].map((name) => ({
      name,
      mimeType: 'video/mp4',
      buffer: Buffer.from(`synthetic ${name}`)
    }))
  )
  await waitForNames(['interviu-mara-partea-1.mp4', 'interviu-mara-partea-2.mp4', 'b-roll-studio.mov'])
  assert.equal(await page.getByRole('heading', { name: '3 files', exact: true }).isVisible(), true, 'count heading')
  assert.equal(await page.getByText('Uploaded', { exact: true }).count(), 3, 'uploaded status on saved rows')
  assert.equal(await page.getByRole('complementary', { name: 'Limits' }).getByText('10 GB · 60 min').isVisible(), true)
  await page.screenshot({ path: join(screenshots, 'desktop-uploaded.png') })

  // In-flight upload stays pending until its transfer is released.
  await input.setInputFiles({ name: 'slow-cut.mp4', mimeType: 'video/mp4', buffer: Buffer.from('slow') })
  await page.getByTestId('pending-source').waitFor()
  assert.equal(await page.getByTestId('pending-source').locator('p[title="slow-cut.mp4"]').count(), 1)
  // A refused file never reaches the queue: toast, refused row, nothing sent.
  await input.setInputFiles({ name: 'clip-vechi.avi', mimeType: 'video/x-msvideo', buffer: Buffer.from('old') })
  await toastFor('clip-vechi.avi').waitFor({ state: 'visible' })
  const toastBox = await toastFor('clip-vechi.avi').boundingBox()
  assert.ok(toastBox.x > 640 && toastBox.y < 200, 'refused-file toast is top right')
  const refusedRow = page.getByTestId('rejected-source')
  assert.equal(await refusedRow.count(), 1, 'refused row is kept in the list')
  assert.equal(await refusedRow.getByText('Unsupported format', { exact: true }).isVisible(), true)
  assert.equal(registrations.includes('clip-vechi.avi'), false, 'refused file is never registered')
  await page.screenshot({ path: join(screenshots, 'desktop-refused.png') })

  releaseSlow()
  await waitForNames([
    'interviu-mara-partea-1.mp4',
    'interviu-mara-partea-2.mp4',
    'b-roll-studio.mov',
    'slow-cut.mp4'
  ])

  // Keyboard reorder: Space lifts, arrow moves, Space drops; order is saved.
  await rowGrip('interviu-mara-partea-2.mp4').focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Space')
  await waitForNames(['interviu-mara-partea-2.mp4', 'interviu-mara-partea-1.mp4', 'b-roll-studio.mov', 'slow-cut.mp4'])
  const keyboardPatch = patches.at(-1)
  assert.deepEqual(
    keyboardPatch.assets.map((asset) => asset.order),
    [0, 1, 2, 3],
    'keyboard reorder sends contiguous order'
  )

  // Pointer reorder: drag the last row above the first one.
  const from = await rowGrip('slow-cut.mp4').boundingBox()
  const first = await page.getByTestId('validated-source').first().boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, first.y + 4, { steps: 8 })
  await page.getByTestId('validated-source').nth(0).waitFor()
  await page.screenshot({ path: join(screenshots, 'desktop-dragging.png') })
  await page.mouse.up()
  await waitForNames(['slow-cut.mp4', 'interviu-mara-partea-2.mp4', 'interviu-mara-partea-1.mp4', 'b-roll-studio.mov'])
  assert.equal(patches.length >= 2, true)
  assert.deepEqual(
    patches.at(-1).assets.map((asset) => asset.id).length,
    4,
    'pointer reorder saves all assets'
  )

  // Replacing a refused file opens the picker and swaps the refused row for the new one.
  await page.getByTestId('rejected-source').getByRole('button', { name: 'Replace', exact: true }).waitFor()
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('rejected-source').getByRole('button', { name: 'Replace', exact: true }).click()
  ;(await chooser).setFiles({ name: 'replacement.mp4', mimeType: 'video/mp4', buffer: Buffer.from('replacement') })
  await page.getByTestId('validated-source').nth(4).waitFor()
  assert.equal(await page.getByTestId('rejected-source').count(), 0, 'replaced refused row removed')

  // Mobile: single column, no aside, no horizontal scroll, short status copy.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByTestId('validated-source').first().waitFor()
  assert.equal(await page.getByRole('complementary', { name: 'Limits' }).isVisible(), false, 'limits aside hidden on mobile')
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
    'no horizontal page scroll at 390px'
  )
  assert.equal(
    await page.getByText('Unsupported format', { exact: true }).isVisible(),
    false,
    'desktop refused copy hidden on mobile'
  )
  assert.equal(
    await page.locator('[role="listitem"] [class*="number"]').first().isVisible(),
    false,
    'order number hidden on mobile'
  )
  await input.setInputFiles({ name: 'clip-vechi.avi', mimeType: 'video/x-msvideo', buffer: Buffer.from('old') })
  await page.getByText('Unsupported format', { exact: true }).waitFor({ state: 'visible' })
  await page.screenshot({ path: join(screenshots, 'mobile-refused.png'), fullPage: true })
  const mobileBox = await page.getByTestId('validated-source').first().boundingBox()
  assert.ok(mobileBox.x + mobileBox.width <= 390 - 16 + 1, 'row keeps the 16px side gutter')

  assert.deepEqual(pageErrors, [], 'no uncaught page errors')
  console.log('PASS: story-sources browser suite (upload list, keyboard and pointer reorder, refused toast, mobile layout)')
} finally {
  await browser.close()
}
