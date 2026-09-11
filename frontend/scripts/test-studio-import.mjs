// Run from the repository root against disposable localhost fixtures only.
// bypassCSP allows the fixture's HTTP Studio; production uses HTTPS with CSP enabled.
import assert from 'node:assert/strict'
import { chromium } from '../../.cache/deploy-browser/node_modules/playwright/index.mjs'
function studioProjectId(frame) {
  assert.ok(frame, 'Studio frame is present')
  const match = new URL(frame.url()).hash.match(/^#project\/([^?]+)/)
  assert.ok(match?.[1], 'Studio frame has a project identifier')
  return match[1]
}
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
    bypassCSP: true
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Synthetic',
    email: 'synthetic@example.invalid',
    credits: 100,
    plan: 'free',
    access_role: 'member'
  }
  const clip = {
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Generated test clip',
    duration: 6,
    aspectRatio: '16:9',
    thumbnailUrl: null
  }
  await page.route(/\/(?:api|v1)\//, async (route) => {
    const url = new URL(route.request().url())
    if (url.port === '5195') return route.continue()
    if (url.pathname === '/v1/auth/refresh')
      return route.fulfill({
        json: { access_token: 'synthetic-fixture', user }
      })
    if (url.pathname === '/v1/auth/me') return route.fulfill({ json: { user } })
    if (url.pathname === '/api/clips/library')
      return route.fulfill({
        json: {
          clips: url.searchParams.get('search') === 'missing' ? [] : [clip],
          total: 1,
          currentPage: 1,
          totalPages: 1
        }
      })
    if (url.pathname === '/api/user/credits')
      return route.fulfill({ json: { credits: 100, plan: 'free' } })
    return route.fulfill({ json: {} })
  })
  await page.goto('http://localhost:3105/dashboard/studio', {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  })
  await page
    .locator('iframe[title^="SneepCut Studio"]')
    .waitFor({ timeout: 120000 })
  assert.equal(
    await page
      .getByRole('heading', { name: 'Make the next cut yours.' })
      .count(),
    0
  )
  await page
    .getByRole('button', { name: 'Edit in Studio: Generated test clip' })
    .click()
  await page
    .locator('iframe[title="SneepCut Studio — Generated test clip"]')
    .waitFor({ timeout: 60000 })
  let studio
  for (let n = 0; n < 100; n++) {
    studio = page
      .frames()
      .find((f) => f.url().startsWith('http://localhost:5195/#project/'))
    if (studio) break
    await page.waitForTimeout(200)
  }
  assert.ok(studio)
  const projectId = studioProjectId(studio)
  let preview
  for (let n = 0; n < 150; n++) {
    for (const f of page.frames()) {
      if (await f.locator('video#generated-clip').count()) {
        preview = f
        break
      }
    }
    if (preview) break
    await page.waitForTimeout(200)
  }
  assert.ok(preview, 'Imported video preview is present')
  await preview.waitForFunction(
    () => document.querySelector('video')?.readyState >= 2,
    { timeout: 30000 }
  )
  const media = await preview
    .locator('video')
    .evaluate((v) => ({ duration: v.duration, source: v.currentSrc }))
  assert.ok(media.duration > 0)
  assert.match(media.source, /assets\/clip.mp4/)
  console.log('PASS direct editor, generated library and imported video', media)
  const result = await studio.evaluate(async (id) => {
    const created = await fetch(`/api/projects/${id}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fps: 10,
        quality: 'draft',
        format: 'mp4',
        telemetryOptOut: true
      })
    })
    if (!created.ok) throw Error(`Render request failed: ${created.status}`)
    const job = await created.json()
    const state = await new Promise((resolve, reject) => {
      const stream = new EventSource(`/api/render/${job.jobId}/progress`)
      const timer = setTimeout(() => {
        stream.close()
        reject(Error('Render timeout'))
      }, 150000)
      stream.addEventListener('progress', (event) => {
        const state = JSON.parse(event.data)
        if (state.status !== 'rendering') {
          clearTimeout(timer)
          stream.close()
          resolve(state)
        }
      })
    })
    if (state.status !== 'complete') throw Error(JSON.stringify(state))
    const response = await fetch(`/api/render/${job.jobId}/download`)
    if (!response.ok) throw Error(`Render download failed: ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    return {
      status: response.status,
      bytes: bytes.length,
      signature: new TextDecoder().decode(bytes.slice(4, 8))
    }
  }, projectId)
  assert.equal(result.status, 200)
  assert.equal(result.signature, 'ftyp')
  assert.ok(result.bytes > 1000)
  await page
    .getByRole('button', { name: 'Edit in Studio: Generated test clip' })
    .click()
  await page.waitForTimeout(1000)
  assert.equal(
    studioProjectId(
      page
        .frames()
        .find((f) => f.url().startsWith('http://localhost:5195/#project/'))
    ),
    projectId
  )
  await page.screenshot({
    path: '.cache/studio-import-desktop.png',
    fullPage: true
  })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1
    )
  )
  await page.screenshot({
    path: '.cache/studio-import-mobile.png',
    fullPage: true
  })
  assert.deepEqual(errors, [])
  console.log(
    'PASS imported MP4 export, reuse, mobile and browser errors',
    result
  )
} finally {
  await browser.close()
}
