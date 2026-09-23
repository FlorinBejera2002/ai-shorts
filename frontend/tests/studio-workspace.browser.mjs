import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

// Synthetic HTTP fixtures only: this suite never connects to an account or AI provider.
const modulePath = process.env.PLAYWRIGHT_MODULE
if (!modulePath) throw new Error('Set PLAYWRIGHT_MODULE to the installed playwright entry point')
const { chromium } = await import(pathToFileURL(modulePath).href)
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5188'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(15000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const id = '00000000-0000-4000-8000-000000000001'
const user = { id, email: 'studio@example.invalid', name: 'Synthetic Studio', credits: 100, plan: 'free', access_role: 'member' }
const clip = {
  id, title: 'Synthetic generated clip', duration: 12, aspectRatio: '9:16',
  thumbnailUrl: null, hookText: null, viralScore: 80, resolution: '1080x1920',
  createdAt: '2026-09-22T00:00:00Z', hasSubtitles: false
}
const projects = [{ id: 'existing-project', title: 'Existing synthetic project' }]
let imported = 0
let proposals = 0
let applied = 0
let conflict = false
let renewalFailure = false
let clipsUnavailable = false
await page.route('**/v1/**', (route) => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
await page.route('**/api/**', async (route) => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.pathname === '/api/clips/library') return route.fulfill(clipsUnavailable ? { status: 503, json: { detail: 'Clips temporarily unavailable' } } : { json: { clips: [clip], total: 1, currentPage: 1, totalPages: 1 } })
  if (url.pathname.endsWith('/files/index.html')) {
    if (request.method() === 'PUT') {
      assert.equal(request.headers()['if-match'], 'synthetic-version')
      assert.equal(request.postData(), '<html>Proposed synthetic edit</html>')
      applied++
      return route.fulfill({ status: conflict ? 409 : 200, json: { ok: !conflict } })
    }
    return route.fulfill({ json: { content: '<html>Original synthetic edit</html>', version: 'synthetic-version' } })
  }
  if (url.pathname.endsWith('/assistant')) {
    proposals++
    assert.equal(request.postDataJSON().message, 'Make the title larger')
    return route.fulfill({ json: { html: '<html>Proposed synthetic edit</html>', summary: 'Made the title larger.' } })
  }
  return route.fulfill({ json: {} })
})
await page.route('**/sneepcut/**', async (route) => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  if (path.endsWith('/session')) return route.fulfill({ status: renewalFailure ? 503 : 200, json: { ok: !renewalFailure } })
  if (path.endsWith('/projects')) {
    if (request.method() === 'POST') {
      const project = { id: 'new-project', title: request.postDataJSON().title }
      projects.push(project)
      return route.fulfill({ json: { project } })
    }
    return route.fulfill({ json: { projects } })
  }
  if (path.endsWith(`/clips/${id}/open`)) {
    imported++
    return route.fulfill({ json: { project: { id: 'imported-project', title: clip.title } } })
  }
  return route.fulfill({ status: 404, json: { error: `Unconfigured fixture: ${path}` } })
})
await page.route('**/*', async (route) => {
  if (route.request().isNavigationRequest() && route.request().frame().parentFrame()) {
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic editor</title><p>Editor fixture loaded</p>' })
  }
  return route.fallback()
})

async function assertSharedLayout() {
  assert.equal(await page.evaluate(() =>
    window.studioLayout.shell === document.querySelector('#dashboard-shell') &&
    window.studioLayout.sidebar === document.querySelector('#dashboard-navigation') &&
    window.studioLayout.header === document.querySelector('header.studio-topbar')
  ), true, 'Shared dashboard DOM must remain mounted')
}

try {
  await page.goto(`${origin}/dashboard/studio`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator(`a[href*="studio?clip=${id}"]`).first().waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await page.evaluate(() => {
    window.studioLayout = {
      shell: document.querySelector('#dashboard-shell'),
      sidebar: document.querySelector('#dashboard-navigation'),
      header: document.querySelector('header.studio-topbar')
    }
  })
  await page.locator('a[href*="studio?workspace=1"]').click()
  await page.getByRole('heading', { name: projects[0].title, exact: true }).waitFor()
  await assertSharedLayout()
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click()
  await page.getByRole('button', { name: `Edit in Studio: ${clip.title}`, exact: true }).click()
  await page.getByRole('heading', { name: clip.title, exact: true }).waitFor()
  assert.equal(imported, 1)
  await page.getByRole('button', { name: clip.title, exact: true }).waitFor()
  await page.getByRole('button', { name: 'AI assistant', exact: true }).click()
  await page.getByLabel('What would you like to change?').fill('Make the title larger')
  await page.getByRole('button', { name: 'Generate proposal', exact: true }).click()
  await page.getByText('Made the title larger.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await page.getByRole('status').filter({ hasText: /Changes saved/ }).waitFor()
  assert.equal(applied, 1)
  conflict = true
  await page.getByRole('button', { name: 'Generate proposal', exact: true }).click()
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'The document changed' }).waitFor()
  assert.equal(proposals, 2)
  assert.equal(applied, 2)
  await page.getByRole('button', { name: projects[0].title, exact: true }).click()
  await page.getByRole('heading', { name: projects[0].title, exact: true }).waitFor()
  await page.getByRole('button', { name: 'New project', exact: true }).click()
  await page.getByLabel('Project title', { exact: true }).fill('Synthetic new project')
  await page.getByRole('button', { name: 'Create project', exact: true }).click()
  await page.getByRole('heading', { name: 'Synthetic new project', exact: true }).waitFor()
  await assertSharedLayout()
  if (process.env.TEST_SCREENSHOT) await page.screenshot({ path: process.env.TEST_SCREENSHOT, fullPage: true })
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `No horizontal overflow at ${width}px`)
    if (width === 390 && process.env.TEST_MOBILE_SCREENSHOT) await page.screenshot({ path: process.env.TEST_MOBILE_SCREENSHOT, fullPage: true })
  }
  renewalFailure = true
  await page.evaluate(() => {
    window.studioFrame = document.querySelector('iframe[title^="SneepCut Studio"]')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.getByRole('alert').filter({ hasText: 'Could not connect to Studio (503)' }).waitFor()
  assert.equal(await page.evaluate(() => window.studioFrame === document.querySelector('iframe[title^="SneepCut Studio"]')), true, 'Session renewal failure must preserve the mounted editor')
  renewalFailure = false
  await page.getByRole('button', { name: 'Reconnect', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Could not connect to Studio (503)' }).waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => window.studioFrame === document.querySelector('iframe[title^="SneepCut Studio"]')), true, 'Reconnecting must preserve the mounted editor')
  clipsUnavailable = true
  await page.getByRole('link', { name: 'Back to clip library', exact: true }).click()
  // A fresh document avoids React Query's valid cached library response.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('a[href*="studio?workspace=1"]').waitFor()
  await page.getByRole('alert').waitFor()
  await page.locator('a[href*="studio?workspace=1"]').click()
  await page.getByRole('heading', { name: 'Synthetic new project', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('PASS: gallery/workspace navigation, shared layout, clip import/project list, AI proposal/apply/conflict, project creation, responsive widths, editor preserved on renewal/reconnect, workspace reachable when clips fail')
} catch (error) {
  console.error({ url: page.url(), errors, body: (await page.locator('body').innerText()).slice(0, 5000) })
  throw error
} finally {
  await browser.close()
}
