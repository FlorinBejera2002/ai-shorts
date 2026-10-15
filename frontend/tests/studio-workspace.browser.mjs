import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// All auth, library and Studio requests use synthetic fixtures.
const modulePath = process.env.PLAYWRIGHT_MODULE
if (!modulePath) throw new Error('Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(modulePath).href)
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5188'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const studioOrigin = 'http://localhost:5191'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(30000)
page.setDefaultNavigationTimeout(60000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const id = '00000000-0000-4000-8000-000000000001'
const otherId = '00000000-0000-4000-8000-000000000002'
const user = { id, email: 'studio@example.invalid', name: 'Synthetic Studio', credits: 100, plan: 'free', access_role: 'member' }
const clip = { id, title: 'Synthetic generated clip', duration: 12, aspectRatio: '9:16', thumbnailUrl: null, hookText: null, viralScore: 80, resolution: '1080x1920', createdAt: '2026-10-15T00:00:00Z', hasSubtitles: false, fileUrl: '/fixture.mp4', folderId: null }
const projects = [{ id, name: 'Generated project', status: 'completed', source: '', brandKit: {}, folders: [], clips: [clip, { ...clip, id: otherId, title: 'Second generated clip' }], updatedAt: clip.createdAt }]
const calls = []
let failSession = false
let failImport = false
let ownedProjects = [{ id: 'existing-project', title: 'Existing project' }]
const sourcePath = new URL('../src/pages/studio-route.tsx', import.meta.url)
let originalSource
let sourceChanged = false
const cors = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' }
await page.route('**/*', async route => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.origin === studioOrigin) {
    if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Main Studio</title><h1>Main Studio fixture</h1>' })
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    calls.push(url.pathname)
    const result = (json, status = 200) => route.fulfill({ status, headers: cors, json })
    if (url.pathname.endsWith('/session')) return result({ ok: !failSession }, failSession ? 503 : 200)
    if (url.pathname.endsWith('/projects')) return result({ projects: ownedProjects })
    if (url.pathname.endsWith('/workspace')) return result({ project: { id: 'blank-project', title: 'Blank project' } })
    if (url.pathname.endsWith('/open')) return result(failImport ? { error: 'Unavailable clip' } : { project: { id: 'clip-project', title: clip.title } }, failImport ? 404 : 200)
    return result({ error: 'Unexpected fixture request' }, 404)
  }
  if (url.pathname.startsWith('/v1/')) return route.fulfill({ json: { access_token: 'synthetic-token', user } })
  if (url.pathname === '/api/projects') return route.fulfill({ json: { projects } })
  if (url.pathname.startsWith('/api/')) return route.fulfill({ json: {} })
  return route.continue()
})
async function library(prefix = '') {
  await page.goto(origin + prefix + '/dashboard/clips', { waitUntil: 'domcontentloaded' })
  await page.getByRole('link', { name: clip.title, exact: true }).waitFor()
  assert.equal(await page.locator('iframe').count(), 0)
}
async function mainStudio(projectId) {
  await page.waitForURL(studioOrigin + '/#project/' + projectId)
  await page.getByRole('heading', { name: 'Main Studio fixture' }).waitFor()
  assert.equal(await page.locator('iframe').count(), 0)
}
async function unchangedLayout() {
  assert.equal(await page.evaluate(() => window.fixtureLayout.shell === document.querySelector('#dashboard-shell') && window.fixtureLayout.sidebar === document.querySelector('#dashboard-navigation') && window.fixtureLayout.header === document.querySelector('header.studio-topbar')), true)
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).waitFor()
}
try {
  await library()
  assert.equal(await page.getByRole('link', { name: 'Second generated clip', exact: true }).count(), 1)
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await page.evaluate(() => { window.fixtureLayout = { shell: document.querySelector('#dashboard-shell'), sidebar: document.querySelector('#dashboard-navigation'), header: document.querySelector('header.studio-topbar') }; window.fixtureDocument = crypto.randomUUID() })
  const documentId = await page.evaluate(() => window.fixtureDocument)
  failSession = true
  await page.getByRole('link', { name: clip.title, exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Could not open Studio' }).waitFor()
  await unchangedLayout()
  assert.equal(await page.locator('iframe').count(), 0)
  assert.equal(calls.some(path => path.endsWith('/open')), false, 'Do not import before authentication succeeds')

  // A component-only hot update keeps launcher failure and shared sidebar state.
  originalSource = await readFile(sourcePath, 'utf8')
  const hotSource = originalSource.replace('<div className="flex min-h-[50vh]', '<div data-studio-refresh-fixture="ready" className="flex min-h-[50vh]')
  assert.notEqual(hotSource, originalSource)
  sourceChanged = true
  await writeFile(sourcePath, hotSource)
  await page.locator('[data-studio-refresh-fixture="ready"]').waitFor()
  assert.equal(await page.evaluate(() => window.fixtureDocument), documentId, 'Fast Refresh must not reload the page')
  await page.getByRole('alert').filter({ hasText: 'Could not open Studio' }).waitFor()
  await unchangedLayout()
  await writeFile(sourcePath, originalSource)
  sourceChanged = false
  await page.locator('[data-studio-refresh-fixture]').waitFor({ state: 'detached' })

  await page.getByRole('link', { name: 'Back to clips', exact: true }).click()
  await page.getByRole('link', { name: clip.title, exact: true }).waitFor()
  await unchangedLayout()
  failSession = false
  await page.getByRole('link', { name: clip.title, exact: true }).click()
  await mainStudio('clip-project')
  assert.ok(calls.includes('/sneepcut/clips/' + id + '/open'))

  // All saved clip/edit URLs open the same main Studio project.
  for (const path of ['/dashboard/clips/' + id + '/edit', '/dashboard/studio?clip=' + id, '/ro/dashboard/clips/' + id]) {
    await page.goto(origin + path)
    await mainStudio('clip-project')
  }
  await page.goto(origin + '/dashboard/studio?workspace=1&project=existing-project')
  await mainStudio('existing-project')
  await page.goto(origin + '/dashboard/studio')
  await mainStudio('existing-project')
  ownedProjects = []
  await page.goto(origin + '/dashboard/studio')
  await mainStudio('blank-project')

  // Missing projects and imports remain recoverable; never open the wrong project.
  await page.goto(origin + '/dashboard/studio?project=missing-project')
  await page.getByRole('alert').filter({ hasText: 'Could not open Studio' }).waitFor()
  assert.ok(page.url().startsWith(origin))
  failImport = true
  await page.goto(origin + '/dashboard/clips/' + id)
  await page.getByRole('alert').filter({ hasText: 'Could not open Studio' }).waitFor()
  failImport = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await mainStudio('clip-project')

  await mkdir('test-results/studio-unification', { recursive: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await library()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, 'Library must fit viewport')
    await page.screenshot({ path: 'test-results/studio-unification/library-' + width + '.png', fullPage: true })
  }
  assert.deepEqual(errors, [])
  console.log('PASS: one clip library; direct main Studio handoff; legacy URLs/locales; authenticated project selection; errors/retry; preserved dashboard DOM/sidebar; component Fast Refresh; desktop/mobile layout')
} finally {
  if (sourceChanged && originalSource !== undefined) await writeFile(sourcePath, originalSource)
  await browser.close()
}
