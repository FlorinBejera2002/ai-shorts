import assert from 'node:assert/strict'
import { mkdir, readFile, stat, utimes, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generatedSnapshot, libraryRecords, scriptId } from './fixtures/scripts-workspace.mjs'

// Start local Vite separately. Auth, every API read, and every API mutation are
// intercepted with synthetic records. The runner never reaches a user database.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE to installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local Vite server')
const output = new URL('../test-results/scripts-layout/', import.meta.url)
// PLAYWRIGHT_CHANNEL='' uses Playwright's bundled Chromium instead of Chrome.
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome'
const browser = await chromium.launch({ channel: channel || undefined, headless: true })
const runtimeErrors = [], unexpectedMutations = [], reports = [], checks = []
let fastRefreshVerified = false, sourceRestorationVerified = false

async function fixture(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1488, height: 1058 },
    timezoneId: 'Europe/Bucharest',
    colorScheme: options.light ? 'light' : 'dark',
    reducedMotion: 'reduce',
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write']
  })
  const page = await context.newPage()
  page.setDefaultTimeout(25000)
  page.setDefaultNavigationTimeout(120000)
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text()))
      runtimeErrors.push(message.text())
  })
  const records = structuredClone(options.empty ? [] : libraryRecords())
  if (options.unsupportedPlatform && records[0]) records[0].platform = 'unsupported-fixture'
  const calls = { list: [], create: [], save: [], generation: [], restore: [], archive: [], versions: [] }
  const histories = new Map(), gates = new Map(), failures = new Map()
  for (const record of records) {
    histories.set(record.id, Array.from({ length: record.revision }, (_, index) => ({
      id: `${record.id}-v${record.revision - index}`,
      versionNumber: record.revision - index,
      changeType: index === record.revision - 1 ? 'create' : 'edit',
      summary: index === 0 ? 'Refined scene 2 dialogue' : index === 1 ? 'Updated hook' : 'Initial draft',
      createdAt: `2026-10-23T0${9 - Math.min(index, 2)}:00:00Z`,
      snapshot: {
        ...structuredClone(record.snapshot),
        hook: index === 0 ? record.snapshot.hook : `Restored hook from v${record.revision - index}`
      }
    })))
  }
  const user = {
    id: '00000000-0000-4000-8000-000000004299',
    name: 'Alex Morgan', email: 'scripts-layout@example.invalid',
    credits: 1000, plan: 'pro', access_role: 'member'
  }
  function addVersion(record, summary = 'Updated script') {
    const history = histories.get(record.id) || []
    history.unshift({
      id: `${record.id}-v${record.revision}`, versionNumber: record.revision,
      changeType: 'edit', summary, createdAt: '2026-10-23T08:00:00Z',
      snapshot: structuredClone(record.snapshot)
    })
    histories.set(record.id, history)
  }
  async function maybeFail(route, key) {
    if (gates.has(key)) await gates.get(key).promise
    if (!(failures.get(key) > 0)) return false
    failures.set(key, failures.get(key) - 1)
    await route.fulfill({ status: 503, json: { error: `Synthetic ${key} failure. Try again.` } })
    return true
  }
  await context.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path !== '/v1/auth/refresh') unexpectedMutations.push(`${route.request().method()} ${path}`)
    return route.fulfill({ json: { access_token: 'synthetic-scripts-token', user } })
  })
  await context.route('**/api/**', async (route) => {
    const request = route.request(), url = new URL(request.url())
    const path = url.pathname, method = request.method()
    const item = path.match(/^\/api\/scripts\/items\/([^/]+)$/)
    const versions = path.match(/^\/api\/scripts\/items\/([^/]+)\/versions$/)
    const restore = path.match(/^\/api\/scripts\/items\/([^/]+)\/versions\/([^/]+)\/restore$/)
    if (path === '/api/scripts/items' && method === 'GET') {
      calls.list.push(Object.fromEntries(url.searchParams))
      if (await maybeFail(route, 'list')) return
      const query = (url.searchParams.get('query') || '').toLowerCase()
      return route.fulfill({ json: { scripts: records.filter(record =>
        (url.searchParams.get('archived') === 'true' || !record.archived) &&
        `${record.title} ${record.topic}`.toLowerCase().includes(query)
      ) } })
    }
    if (path === '/api/scripts/items' && method === 'POST') {
      const payload = request.postDataJSON()
      calls.create.push(payload)
      if (await maybeFail(route, 'create')) return
      const record = {
        id: scriptId(100 + calls.create.length), title: payload.title,
        topic: payload.topic, status: payload.status, platform: payload.platform,
        language: payload.language, targetDurationSeconds: payload.target_duration_seconds,
        tone: payload.tone, style: payload.style, audience: payload.audience,
        snapshot: payload.snapshot, archived: false, revision: 1,
        createdAt: '2026-10-23T07:00:00Z', updatedAt: '2026-10-23T07:00:00Z'
      }
      records.unshift(record)
      addVersion(record, 'Initial draft')
      return route.fulfill({ json: { script: record } })
    }
    if (path === '/api/scripts/generate' && method === 'POST') {
      calls.generation.push(request.postDataJSON())
      if (await maybeFail(route, 'generation')) return
      return route.fulfill({ json: { script: generatedSnapshot() } })
    }
    if (item && ['PATCH', 'DELETE'].includes(method)) {
      const record = records.find(record => record.id === item[1])
      assert.ok(record, 'Only a synthetic script can be mutated')
      if (method === 'DELETE') {
        calls.archive.push(record.id)
        if (await maybeFail(route, 'archive')) return
        Object.assign(record, { archived: true, status: 'archived' })
        return route.fulfill({ json: { archived: true } })
      }
      const payload = request.postDataJSON()
      calls.save.push({ id: record.id, payload })
      if (await maybeFail(route, 'save')) return
      assert.equal(payload.revision, record.revision, 'Autosave uses the current revision')
      Object.assign(record, {
        title: payload.title, topic: payload.topic, status: payload.status,
        platform: payload.platform, language: payload.language,
        targetDurationSeconds: payload.target_duration_seconds, tone: payload.tone,
        style: payload.style, audience: payload.audience, snapshot: payload.snapshot,
        revision: record.revision + 1, updatedAt: '2026-10-23T08:00:00Z'
      })
      addVersion(record, payload.summary || 'Updated script')
      return route.fulfill({ json: { script: record } })
    }
    if (versions && method === 'GET') {
      assert.ok(histories.has(versions[1]))
      calls.versions.push(versions[1])
      return route.fulfill({ json: { versions: histories.get(versions[1]).map(({ snapshot: _snapshot, ...version }) => version) } })
    }
    if (restore && method === 'POST') {
      const record = records.find(record => record.id === restore[1])
      const version = histories.get(restore[1])?.find(version => version.id === restore[2])
      assert.ok(record && version, 'Restore addresses only a synthetic version')
      assert.notEqual(version.versionNumber, record.revision, 'Current version cannot be restored')
      const payload = request.postDataJSON()
      assert.equal(payload.revision, record.revision)
      calls.restore.push({ id: record.id, versionId: version.id, payload })
      if (await maybeFail(route, 'restore')) return
      Object.assign(record, { snapshot: structuredClone(version.snapshot), title: version.snapshot.title, revision: record.revision + 1 })
      addVersion(record, `Restored v${version.versionNumber}`)
      return route.fulfill({ json: { script: record } })
    }
    if (method !== 'GET') {
      unexpectedMutations.push(`${method} ${path}`)
      return route.fulfill({ status: 405, json: { error: 'Unexpected mutation blocked by synthetic Scripts fixture' } })
    }
    const responses = {
      '/api/projects': { projects: [] },
      '/api/publishing': { providers: [], accounts: [], clips: [], posts: [] },
      '/api/calendar': { posts: [], clips: [] },
      '/api/workspace-agent/runs': { runs: [], has_more: false },
      '/api/workspace-agent/suggestions': { suggestions: [], capabilities: [] },
      '/api/user/profile': { profile: {
        ...user, image: null, provider: 'password', canChangePassword: true,
        recentlyAuthenticated: true, emailVerified: '2026-10-01T09:00:00Z', createdAt: '2026-10-01T09:00:00Z'
      } }
    }
    return route.fulfill({ json: responses[path] || {} })
  })
  return {
    page, context, calls, records,
    workspace: page.locator('[data-script-workspace]'),
    library: page.locator('[data-script-library]'),
    editor: page.locator('[data-script-editor]'),
    fail(key, count = 1) { failures.set(key, count) },
    hold(key) {
      let release
      const promise = new Promise(resolve => { release = resolve })
      gates.set(key, { promise, release })
    },
    release(key) { gates.get(key)?.release(); gates.delete(key) },
    async open(locale = '') {
      await page.goto(`${origin}${locale ? `/${locale}` : ''}/dashboard/script-generator`, { waitUntil: 'networkidle' })
      await page.locator('[data-script-library]').waitFor()
      await until(() => calls.list.length > 0)
    },
    async close() {
      for (const gate of gates.values()) gate.release()
      await context.close()
    }
  }
}

async function until(predicate, message = 'Expected fixture request', timeout = 25000) {
  const start = Date.now()
  while (!predicate()) {
    assert.ok(Date.now() - start < timeout, message)
    await new Promise(resolve => setTimeout(resolve, 40))
  }
}
async function noOverflow(page, label) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  // Responsive shell/toast transitions can retain their old scroll bounds for
  // a few frames after a viewport resize. Persistent overflow still fails.
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1,
    undefined, { timeout: 2500 }).catch(() => {})
  const layout = await page.evaluate(() => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')].map(element => {
      const bounds = element.getBoundingClientRect()
      return { tag: element.tagName, class: element.className, left: bounds.left, right: bounds.right }
    }).filter(element => element.left >= 0 && element.right > innerWidth + 1).slice(0, 12)
  }))
  if (layout.scrollWidth > layout.width + 1)
    await page.screenshot({ path: fileURLToPath(new URL(`overflow-${label}.png`, output)), fullPage: true })
  assert.ok(layout.scrollWidth <= layout.width + 1, `${label}: no horizontal page overflow; ${JSON.stringify(layout)}`)
}
async function capture(f, name, target) {
  await noOverflow(f.page, name)
  await f.page.mouse.move(0, 0)
  const menuOpen = await f.page.locator('[role="listbox"], [role="menu"], [role="dialog"]').count() > 0
  if (!menuOpen) await f.page.evaluate(() => window.scrollTo(0, 0))
  if (target) await target.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) })
  // Radix closes its popup on viewport resize; full-page capture may resize the
  // viewport internally, so an open selector uses the existing viewport.
  else await f.page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: !menuOpen })
  reports.push(name)
}
async function rememberShell(page) {
  await page.evaluate(() => {
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    window.scriptsShellProbe = {
      document, main: document.querySelector('main'),
      header: document.querySelector('header.studio-topbar'), sidebar,
      state: sidebar?.getAttribute('data-state')
    }
    if (!window.scriptsShellProbe.main || !window.scriptsShellProbe.header || !sidebar)
      throw new Error('Dashboard shell missing')
  })
}
async function assertShell(page) {
  assert.equal(await page.evaluate(() => {
    const p = window.scriptsShellProbe, sidebar = document.querySelector('[data-slot="sidebar"]')
    return p?.document === document && p.main === document.querySelector('main') &&
      p.header === document.querySelector('header.studio-topbar') && p.sidebar === sidebar &&
      p.state === sidebar?.getAttribute('data-state')
  }), true, 'Dashboard document/main/header/sidebar/state remain mounted')
}
async function expectCards(f, count) {
  await f.page.waitForFunction(expected => document.querySelectorAll('[data-script-card]').length === expected, count)
}
async function openCard(f, index = 0) {
  await f.library.locator(`[data-script-card="${scriptId(index)}"]`).click()
  await f.editor.waitFor()
}
async function newScript(f) {
  await f.library.getByRole('button', { name: 'New script', exact: true }).first().click()
  await f.editor.waitFor()
}
async function backToLibrary(f) {
  await f.workspace.getByRole('button', { name: 'Scripts', exact: true }).click()
  await f.library.waitFor()
}
async function moreActions(f) {
  await f.workspace.getByRole('button', { name: 'More actions', exact: true }).click()
}
async function menuAction(f, name) {
  await moreActions(f)
  await f.page.getByRole('menuitem', { name, exact: true }).click()
}
async function readDownload(download) {
  const chunks = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}
async function expectStyle(locator, expected, label) {
  const actual = await locator.evaluate((element, keys) => {
    const style = getComputedStyle(element)
    return Object.fromEntries(keys.map(key => [key, style.getPropertyValue(key)]))
  }, Object.keys(expected))
  assert.deepEqual(actual, expected, label)
}
async function settled(f) {
  await until(() => f.calls.save.length > 0, 'Autosave request missing')
  await f.workspace.getByText(/^Saved.*v\d+/).first().waitFor()
}
const scene = (f, number) => f.editor.locator(`[data-script-scene="${number}"]`)
const sceneToggle = (f, number) => scene(f, number).locator('button[aria-controls$="-fields"]')
const field = (f, id) => f.page.locator(`#script-${id}`)

async function libraryAndShell() {
  const f = await fixture({ light: true, viewport: { width: 1440, height: 1000 } })
  try {
    await f.open()
    await expectCards(f, 6)
    const archivedSwitch = f.library.getByRole('switch', { name: 'Archived', exact: true })
    const switchSize = await archivedSwitch.boundingBox()
    assert.deepEqual([Math.round(switchSize.width), Math.round(switchSize.height)], [40, 24], 'Archived switch keeps reference geometry under dashboard input styles')
    // Reference palette, geometry and typography on the light canvas.
    await expectStyle(f.page.locator('#dashboard-main'), { 'background-color': 'rgb(245, 247, 251)' }, 'Scripts paints the reference canvas')
    await expectStyle(f.library.locator('article').first(), {
      'background-color': 'rgb(255, 255, 255)', 'border-top-left-radius': '22px'
    }, 'Library card')
    await expectStyle(f.library.locator('[data-script-new]'), {
      'background-color': 'rgb(37, 99, 235)', 'border-top-left-radius': '999px', height: '52px'
    }, 'New script pill')
    await expectStyle(f.library.getByRole('heading', { level: 1 }), { 'font-size': '34px', 'font-weight': '600' }, 'Library heading')
    assert.match(await f.library.getByRole('heading', { level: 1 }).evaluate(element => getComputedStyle(element).fontFamily), /Sora/)
    await capture(f, 'desktop-library')
    await f.page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click()
    await rememberShell(f.page)
    const route = f.page.url()
    const search = f.library.getByRole('searchbox', { name: 'Search scripts', exact: true })
    await search.fill('creative studio')
    await expectCards(f, 1)
    assert.equal(await f.library.locator('[data-script-card]').textContent(), 'Inside the creative studio')
    assert.equal(f.calls.list.at(-1).query, 'creative studio')
    await search.fill('no synthetic match')
    await expectCards(f, 0)
    await f.library.getByRole('heading', { name: 'No matching scripts', exact: true }).waitFor()
    await capture(f, 'desktop-library-empty-search')
    await search.fill('')
    await expectCards(f, 6)
    await archivedSwitch.check()
    await expectCards(f, 7)
    assert.equal(f.calls.list.at(-1).archived, 'true')
    await capture(f, 'desktop-library-archived')
    await openCard(f, 6)
    assert.equal(await field(f, 'title').inputValue(), 'A slower weekend')
    assert.equal(await f.page.locator('#script-status').isDisabled(), true, 'Archived status cannot be changed with a new unarchive action')
    await moreActions(f)
    assert.equal(await f.page.getByRole('menuitem', { name: 'Archive', exact: true }).isDisabled(), true)
    await f.page.keyboard.press('Escape')
    assert.equal(await f.workspace.getByRole('button', { name: /Unarchive/i }).count(), 0)
    assert.equal(f.page.url(), route, 'Library/editor are local views of the same route')
    await assertShell(f.page)
    await backToLibrary(f)
    await archivedSwitch.uncheck()
    await expectCards(f, 6)
    await openCard(f)
    await assertShell(f.page)
    await backToLibrary(f)
    await f.page.locator('[data-slot="sidebar"] a[href="/dashboard/publish"]').filter({ visible: true }).first().click()
    await f.page.waitForURL('**/dashboard/publish')
    await assertShell(f.page)
    await f.page.locator('[data-slot="sidebar"] a[href="/dashboard/script-generator"]').filter({ visible: true }).first().click()
    await f.library.waitFor()
    await assertShell(f.page)
    checks.push('Library search, archived switch, archived open, local views, reference styles and route shell identity')
  } finally { await f.close() }
  const failing = await fixture({ light: true, viewport: { width: 1440, height: 1000 } })
  try {
    failing.fail('list')
    await failing.open()
    const alert = failing.library.getByRole('alert')
    await alert.getByRole('heading', { name: "Couldn't load scripts", exact: true }).waitFor()
    await capture(failing, 'desktop-library-load-error')
    await alert.getByRole('button', { name: 'Retry', exact: true }).click()
    await expectCards(failing, 6)
    checks.push('Library load error is retryable')
  } finally { await failing.close() }
  const unsupported = await fixture({ unsupportedPlatform: true })
  try {
    await unsupported.open()
    await openCard(unsupported)
    const platforms = unsupported.page.locator('#script-platform')
    assert.equal(await platforms.locator('[aria-checked="true"]').count(), 0, 'Retired platform is not replaced silently')
    await unsupported.editor.getByText('Choose a supported platform', { exact: true }).first().waitFor()
    await unsupported.workspace.getByRole('button', { name: 'Regenerate', exact: true }).click()
    await unsupported.page.getByText('Choose a supported platform', { exact: true }).filter({ visible: true }).last().waitFor()
    assert.equal(unsupported.calls.generation.length, 0, 'Unsupported stored platform is validated before generation')
  } finally { await unsupported.close() }
}

async function briefAndGeneration() {
  const f = await fixture({ empty: true, light: true, viewport: { width: 1440, height: 1000 } })
  try {
    await f.open()
    await f.library.getByRole('heading', { name: 'No scripts yet', exact: true }).waitFor()
    await capture(f, 'desktop-library-empty')
    await f.page.setViewportSize({ width: 390, height: 844 })
    await capture(f, 'mobile-library-empty')
    await f.page.setViewportSize({ width: 1440, height: 1000 })
    await newScript(f)
    assert.equal(f.calls.create.length, 1, 'New script creates a server draft before opening')
    assert.deepEqual({
      platform: f.calls.create[0].platform, duration: f.calls.create[0].target_duration_seconds,
      language: f.calls.create[0].language, tone: f.calls.create[0].tone,
      style: f.calls.create[0].style, status: f.calls.create[0].status,
      topic: f.calls.create[0].topic, audience: f.calls.create[0].audience
    }, { platform: 'tiktok', duration: 30, language: 'en', tone: 'entertaining', style: 'talking_head', status: 'draft', topic: '', audience: '' })
    const document = f.editor.locator('[data-script-document]')
    await document.getByRole('heading', { name: 'Complete the brief', exact: true }).waitFor()
    await capture(f, 'desktop-document-empty')
    const generate = f.workspace.getByRole('button', { name: 'Generate script', exact: true })
    await generate.click()
    assert.equal(f.calls.generation.length, 0, 'Empty topic does not call generation API')
    await field(f, 'topic').fill('A calm morning routine for busy creators')
    assert.equal(await field(f, 'topic').getAttribute('maxlength'), '1000')
    await field(f, 'audience').fill('Busy creators')
    await field(f, 'tone').getByRole('radio', { name: 'Educational', exact: true }).click()
    await field(f, 'style').getByRole('radio', { name: 'Talking Head', exact: true }).press('ArrowRight')
    assert.equal(await field(f, 'style').getByRole('radio', { name: 'B-Roll', exact: true }).getAttribute('aria-checked'), 'true', 'Arrow keys move the chip selection')
    await field(f, 'style').getByRole('radio', { name: 'Tutorial', exact: true }).click()
    const platforms = f.page.locator('#script-platform')
    for (const name of ['TikTok', 'YouTube Shorts', 'Instagram Reels', 'Facebook'])
      await platforms.getByRole('radio', { name, exact: true }).waitFor()
    await platforms.getByRole('radio', { name: 'Instagram Reels', exact: true }).click()
    assert.equal(await platforms.getByRole('radio', { name: 'Instagram Reels', exact: true }).getAttribute('aria-checked'), 'true')
    await f.page.locator('#script-duration').selectOption('45')
    await f.page.locator('#script-language').selectOption('ro')
    await capture(f, 'desktop-brief')
    await f.page.setViewportSize({ width: 390, height: 844 })
    await capture(f, 'mobile-brief')
    await f.page.setViewportSize({ width: 1440, height: 1000 })
    await settled(f)
    f.hold('generation')
    f.fail('generation')
    await generate.click()
    const generating = f.workspace.getByRole('button', { name: /Generating/i })
    await generating.waitFor()
    assert.equal(await generating.isDisabled(), true)
    await f.editor.locator('[aria-busy="true"]').getByRole('heading', { name: /Generating/i }).waitFor()
    assert.equal(await field(f, 'topic').inputValue(), 'A calm morning routine for busy creators')
    await capture(f, 'desktop-generating')
    await f.page.setViewportSize({ width: 390, height: 844 })
    await capture(f, 'mobile-generating')
    await f.page.setViewportSize({ width: 1440, height: 1000 })
    f.release('generation')
    await generate.waitFor()
    await f.page.getByText('Synthetic generation failure. Try again.', { exact: true }).waitFor()
    assert.equal(await field(f, 'audience').inputValue(), 'Busy creators')
    assert.equal(await field(f, 'tone').locator('[aria-checked="true"]').textContent(), 'Educational')
    assert.equal(await field(f, 'style').locator('[aria-checked="true"]').textContent(), 'Tutorial')
    assert.equal(await f.page.locator('#script-duration').inputValue(), '45')
    assert.equal(await f.page.locator('#script-language').inputValue(), 'ro')
    await capture(f, 'desktop-generation-error')
    await generate.click()
    await f.page.waitForFunction(() => document.querySelector('#script-title')?.value === 'A better morning routine')
    await until(() => f.calls.save.some(call => call.payload.summary === 'AI generation'))
    assert.deepEqual(f.calls.generation.at(-1), {
      topic: 'A calm morning routine for busy creators', platform: 'instagram', duration: 45,
      tone: 'educational', target_audience: 'Busy creators', language: 'ro', style: 'tutorial'
    })
    assert.equal(await f.editor.locator('[data-script-scene]').count(), 3)
    await f.workspace.getByRole('button', { name: 'Regenerate', exact: true }).waitFor()
    await capture(f, 'desktop-document')
    await f.page.setViewportSize({ width: 390, height: 844 })
    await capture(f, 'mobile-document')
    checks.push('Server draft defaults, empty document, topic validation, platform radios, tone/style chips, preserved loading/failure and generation success')
  } finally { await f.close() }
  const manual = await fixture({ empty: true })
  try {
    await manual.open()
    await newScript(manual)
    await manual.editor.getByRole('button', { name: "I'll write it", exact: true }).click()
    await manual.page.waitForFunction(() => document.activeElement?.id === 'script-hook')
    await manual.editor.getByRole('button', { name: 'Add scene', exact: true }).click()
    assert.equal(await manual.editor.locator('[data-script-scene]').count(), 1)
    checks.push('Manual writing starts at the hook without generation')
  } finally { await manual.close() }
}

async function documentEditing() {
  const f = await fixture({ light: true, viewport: { width: 1440, height: 1000 } })
  try {
    await f.open()
    await openCard(f)
    await capture(f, 'desktop-document-default')
    await expectStyle(f.editor.locator('[data-script-toolbar]'), {
      'background-color': 'rgb(255, 255, 255)', 'border-top-left-radius': '999px'
    }, 'Editor header bar')
    await expectStyle(scene(f, 1), { 'box-shadow': 'rgb(37, 99, 235) 0px 0px 0px 2px' }, 'Selected scene ring')
    await rememberShell(f.page)
    await f.page.locator('#script-status').click()
    for (const status of ['Idea', 'Draft', 'In review', 'Ready', 'In production', 'Published'])
      await f.page.getByRole('option', { name: status, exact: true }).waitFor()
    await capture(f, 'desktop-status-listbox')
    await f.page.getByRole('option', { name: 'Ready', exact: true }).click()
    await until(() => f.records.find(record => record.id === scriptId(0)).status === 'ready')
    await moreActions(f)
    await f.page.getByRole('menuitem', { name: 'Download JSON', exact: true }).waitFor()
    await capture(f, 'desktop-actions-menu')
    await f.page.keyboard.press('Escape')
    f.fail('save')
    await field(f, 'hook').fill('Give yourself one quiet minute.')
    await f.workspace.getByText('Save failed', { exact: true }).waitFor()
    assert.equal(await field(f, 'hook').inputValue(), 'Give yourself one quiet minute.')
    assert.equal(f.records.find(record => record.id === scriptId(0)).snapshot.hook, generatedSnapshot().hook)
    await capture(f, 'desktop-save-error')
    await f.page.setViewportSize({ width: 390, height: 844 })
    await capture(f, 'mobile-save-error')
    await f.page.setViewportSize({ width: 1440, height: 1000 })
    await f.workspace.getByRole('button', { name: 'Retry', exact: true }).click()
    await settled(f)
    assert.equal(f.records.find(record => record.id === scriptId(0)).snapshot.hook, 'Give yourself one quiet minute.')
    const first = scene(f, 1)
    const firstId = await first.getAttribute('data-scene-id')
    assert.equal(await sceneToggle(f, 1).getAttribute('aria-expanded'), 'true', 'First scene is selected by default')
    assert.equal(await sceneToggle(f, 2).getAttribute('aria-expanded'), 'false', 'Other scenes are collapsed rows')
    await first.getByLabel('Visual', { exact: true }).fill('Open the curtains slowly')
    await first.getByLabel('Dialogue', { exact: true }).fill('Take one quiet breath.')
    await first.getByLabel('Camera', { exact: true }).fill('wide shot')
    await first.getByLabel('Transition', { exact: true }).fill('Dissolve')
    await first.getByLabel('Text overlay', { exact: true }).fill('A calm start')
    await first.getByLabel('Music', { exact: true }).fill('Soft piano')
    assert.equal(await first.getByRole('button', { name: 'Move scene up', exact: true }).isDisabled(), true)
    await first.getByRole('button', { name: 'Move scene down', exact: true }).click()
    assert.equal(await scene(f, 2).getAttribute('data-scene-id'), firstId, 'Scene identity follows reorder')
    assert.equal(await scene(f, 2).getByLabel('Visual', { exact: true }).inputValue(), 'Open the curtains slowly')
    assert.equal(await sceneToggle(f, 2).getAttribute('aria-expanded'), 'true', 'Selection follows the moved scene')
    await scene(f, 2).getByRole('button', { name: 'Move scene up', exact: true }).click()
    assert.equal(await scene(f, 1).getAttribute('data-scene-id'), firstId)
    await sceneToggle(f, 3).click()
    assert.equal(await sceneToggle(f, 3).getAttribute('aria-expanded'), 'true')
    assert.equal(await sceneToggle(f, 1).getAttribute('aria-expanded'), 'false', 'Selecting a row collapses the previous scene')
    await f.editor.getByRole('button', { name: 'Add scene', exact: true }).click()
    assert.equal(await f.editor.locator('[data-script-scene]').count(), 4)
    const fourth = scene(f, 4)
    assert.equal(await sceneToggle(f, 4).getAttribute('aria-expanded'), 'true', 'A new scene opens for editing')
    assert.equal(await fourth.getByRole('button', { name: 'Move scene down', exact: true }).isDisabled(), true)
    await fourth.getByRole('button', { name: 'Delete scene', exact: true }).click()
    assert.equal(await f.editor.locator('[data-script-scene]').count(), 3)
    await field(f, 'cta').fill('Try a calmer morning tomorrow')
    await field(f, 'caption').fill('Start your day with intention')
    for (const tag of ['morningroutine', 'creators'])
      await f.editor.getByRole('button', { name: `Remove #${tag}`, exact: true }).click()
    await field(f, 'hashtags').fill('#calm, creators, #morning')
    await field(f, 'hashtags').press('Enter')
    await until(() => f.records.find(record => record.id === scriptId(0)).snapshot.caption === 'Start your day with intention')
    await until(() => f.records.find(record => record.id === scriptId(0)).snapshot.hashtags.join() === 'calm,creators,morning', 'Hashtag chips save in order')
    await capture(f, 'desktop-scene-editor')
    await f.page.setViewportSize({ width: 390, height: 844 })
    await capture(f, 'mobile-scene-editor')
    await f.page.setViewportSize({ width: 1440, height: 1000 })
    // Responsive sidebar variants may change their DOM at a breakpoint. Record
    // the desktop shell again before checking the local Archive transition.
    await noOverflow(f.page, 'Desktop scene editor after resize')
    await rememberShell(f.page)
    await f.workspace.getByRole('button', { name: 'Copy', exact: true }).click()
    await f.workspace.getByRole('status').filter({ hasText: 'Copied' }).waitFor()
    await capture(f, 'desktop-copied')
    const clipboard = await f.page.evaluate(() => navigator.clipboard.readText())
    assert.ok(clipboard.includes('A better morning routine') && clipboard.includes('Take one quiet breath.') && clipboard.includes('#calm #creators #morning'))
    const textDownload = f.page.waitForEvent('download')
    await f.workspace.getByRole('button', { name: 'Download', exact: true }).click()
    const text = await textDownload
    assert.equal(text.suggestedFilename(), 'a-better-morning-routine.txt')
    assert.ok((await readDownload(text)).includes('Take one quiet breath.'))
    const jsonDownload = f.page.waitForEvent('download')
    await menuAction(f, 'Download JSON')
    const download = await jsonDownload
    assert.equal(download.suggestedFilename(), 'a-better-morning-routine.json')
    const json = JSON.parse(await readDownload(download))
    assert.equal(json.scenes[0].visual_description, 'Open the curtains slowly')
    assert.deepEqual(json.hashtags, ['calm', 'creators', 'morning'])
    for (let count = 3; count > 0; count--)
      await scene(f, 1).getByRole('button', { name: 'Delete scene', exact: true }).click()
    assert.equal(await f.editor.locator('[data-script-scene]').count(), 0)
    for (const [id, expected] of [['cta', 'Try a calmer morning tomorrow'], ['caption', 'Start your day with intention']]) {
      await field(f, id).waitFor({ state: 'visible' })
      assert.equal(await field(f, id).inputValue(), expected, `${id} remains editable after deleting the last scene`)
    }
    await f.editor.getByRole('button', { name: 'Remove #calm', exact: true }).waitFor()
    await f.editor.getByRole('button', { name: 'Add scene', exact: true }).click()
    assert.equal(await f.editor.locator('[data-script-scene]').count(), 1)
    assert.equal(await field(f, 'caption').inputValue(), 'Start your day with intention')
    await menuAction(f, 'Archive')
    await f.library.waitFor()
    await until(() => f.calls.archive.length === 1)
    assert.equal(f.records.find(record => record.id === scriptId(0)).archived, true)
    await expectCards(f, 5)
    await assertShell(f.page)
    checks.push('Status listbox, autosave failure/retry, single selected scene edit/reorder/add/delete, hashtag chips, clipboard pill, text/JSON downloads and archive')
  } finally { await f.close() }
}

async function versionsAndCoach() {
  const f = await fixture({ light: true, viewport: { width: 1440, height: 1000 } })
  try {
    await f.open()
    await openCard(f)
    await f.workspace.getByRole('button', { name: 'Versions', exact: true }).click()
    const panel = f.page.getByRole('dialog', { name: 'Version history', exact: true })
    const versions = panel.locator('[data-script-versions]')
    await versions.getByText('Current', { exact: true }).waitFor()
    assert.equal(f.calls.versions.length, 1)
    assert.equal(await versions.getByRole('button', { name: 'Restore', exact: true }).count(), 2, 'Current version has no Restore')
    assert.equal(await versions.locator('[data-current="true"]').getByRole('button', { name: 'Restore', exact: true }).count(), 0)
    await capture(f, 'desktop-versions')
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
    await panel.waitFor({ state: 'detached' })
    await f.workspace.getByRole('button', { name: 'Versions', exact: true }).click()
    await versions.getByRole('button', { name: 'Restore', exact: true }).first().click()
    assert.equal(f.calls.versions.length, 2, 'History refreshes each time it opens')
    await until(() => f.calls.restore.length === 1)
    await f.page.waitForFunction(() => document.querySelector('#script-hook')?.value === 'Restored hook from v2')
    await f.workspace.locator('[data-script-coach-open]').click()
    const coach = f.workspace.locator('[data-shooting-coach]')
    await coach.waitFor()
    await f.workspace.getByRole('heading', { level: 1, name: 'A better morning routine' }).waitFor()
    await expectStyle(coach.locator('[data-coach-stage]'), {
      'background-color': 'rgb(15, 23, 42)', 'border-top-left-radius': '24px', height: '520px'
    }, 'Coach stage')
    for (const [mode, name] of [['director', 'studio'], ['camera', 'camera'], ['top', 'plan']]) {
      await coach.locator(`[data-coach-view="${mode}"]`).click()
      assert.equal(await coach.locator(`[data-coach-view="${mode}"]`).getAttribute('aria-pressed'), 'true')
      assert.equal(await coach.locator('[data-coach-stage]').getAttribute('data-view'), mode)
      await capture(f, `desktop-coach-${name}`, coach)
      await capture(f, `desktop-coach-${name}-page`)
    }
    const widths = await coach.locator('[data-coach-scene]').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width))
    assert.ok(widths.every(width => Math.abs(width - widths[0]) < 2), 'Equal scene durations have equal timeline widths')
    await coach.locator('[data-coach-scene="1"]').click()
    assert.equal(await coach.locator('[data-coach-scene="1"]').getAttribute('aria-current'), 'step')
    await coach.locator('[data-coach-scene="1"]').press('ArrowRight')
    assert.equal(await coach.locator('[data-coach-scene="2"]').getAttribute('aria-current'), 'step')
    await coach.getByRole('complementary', { name: 'Scene details' }).getByRole('heading', { name: 'Scene 3' }).waitFor()
    await coach.getByRole('button', { name: 'Restart preview', exact: true }).click()
    assert.equal(await coach.locator('[data-coach-scene="0"]').getAttribute('aria-current'), 'step')
    // Restart preserves the existing behavior: playback starts at scene one.
    await coach.getByRole('button', { name: 'Pause preview', exact: true }).click()
    await coach.getByRole('button', { name: 'Play preview', exact: true }).click()
    await coach.getByRole('button', { name: 'Pause preview', exact: true }).waitFor()
    await coach.getByRole('button', { name: 'Pause preview', exact: true }).click()
    await coach.getByRole('button', { name: 'Mute preview', exact: true }).click()
    await coach.getByRole('button', { name: 'Unmute preview', exact: true }).waitFor()
    await coach.getByRole('button', { name: 'Unmute preview', exact: true }).click()
    await coach.getByRole('button', { name: 'Play preview', exact: true }).click()
    const playbackTime = coach.getByText(/^\d{2}:\d{2}\s*\/\s*\d{2}:\d{2}$/)
    await f.page.waitForFunction(() => [...document.querySelectorAll('[data-shooting-coach] p')]
      .some(element => /^\d{2}:\d{2}\s*\//.test(element.textContent) && !element.textContent.startsWith('00:00')))
    await f.workspace.getByRole('button', { name: 'Edit script', exact: true }).click()
    const pausedAt = await playbackTime.textContent()
    await f.workspace.locator('[data-script-coach-open]').click()
    await coach.getByRole('button', { name: 'Play preview', exact: true }).waitFor()
    assert.equal(await playbackTime.textContent(), pausedAt, 'Returning to editor pauses Coach and preserves elapsed time')
    for (const width of [390, 768]) {
      await f.page.setViewportSize({ width, height: width === 390 ? 844 : 1024 })
      for (const [mode, name] of [['director', 'studio'], ['camera', 'camera'], ['top', 'plan']]) {
        await coach.locator(`[data-coach-view="${mode}"]`).click()
        await capture(f, `${width === 390 ? 'mobile' : 'tablet'}-coach-${name}`, coach)
        if (width === 390) await capture(f, `mobile-coach-${name}-page`)
      }
      const clippedTimes = await coach.locator('[data-coach-scene] [class*="timelineDuration"]').evaluateAll(elements =>
        elements.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent))
      assert.deepEqual(clippedTimes, [], `${width}px scene durations stay readable without clipping`)
      const playSize = await coach.locator('[data-coach-play]').boundingBox()
      assert.ok(Math.abs(playSize.width - playSize.height) < 1, 'Coach Play control stays square before applying full circular radius')
      assert.equal(await coach.locator('[data-coach-play]').evaluate(element => {
        const radius = getComputedStyle(element).borderRadius
        return radius.includes('%') ? parseFloat(radius) >= 50 : parseFloat(radius) >= element.clientHeight / 2
      }), true, 'Coach Play keeps its circular exception')
    }
    checks.push('Version panel close/refresh/restore and Coach Studio/Camera/Plan, proportional timeline, keyboard, playback and audio controls')
  } finally { await f.close() }
}

async function responsiveVariants() {
  for (const light of [false, true]) {
    const theme = light ? 'light' : 'dark'
    const f = await fixture({ light, viewport: { width: 390, height: 844 } })
    try {
      await f.open()
      await expectCards(f, 6)
      assert.equal(await f.page.evaluate(() => document.documentElement.classList.contains('dark')), !light)
      await expectStyle(f.page.locator('#dashboard-main'), { 'background-color': light ? 'rgb(245, 247, 251)' : 'rgb(14, 19, 28)' }, `${theme} canvas`)
      await capture(f, `mobile-library-${theme}`)
      const positions = await f.library.locator('[data-script-card]').evaluateAll(cards => cards.slice(0, 3).map(card => card.getBoundingClientRect().left))
      assert.ok(positions.every(left => Math.abs(left - positions[0]) < 1), 'Mobile library is one column')
      await f.library.getByRole('button', { name: 'Show archived', exact: true }).click()
      await expectCards(f, 7)
      assert.equal(await f.library.getByRole('button', { name: 'Show archived', exact: true }).getAttribute('aria-pressed'), 'true')
      await capture(f, `mobile-library-archived-${theme}`)
      await openCard(f)
      await capture(f, `mobile-document-${theme}`)
      const briefToggle = f.workspace.locator('[data-brief-toggle]')
      assert.equal(await briefToggle.getAttribute('aria-expanded'), 'false')
      assert.equal(await field(f, 'topic').isVisible(), false)
      await briefToggle.click()
      assert.equal(await field(f, 'topic').inputValue(), 'A calm morning routine for busy creators')
      await capture(f, `mobile-brief-open-${theme}`)
      await briefToggle.click()
      assert.equal(await briefToggle.getAttribute('aria-expanded'), 'false')
      await moreActions(f)
      const actions = f.page.getByRole('dialog', { name: 'Script actions', exact: true })
      for (const name of ['Versions', 'Copy', 'Download', 'Download JSON', 'Archive'])
        await actions.getByRole('button', { name, exact: true }).waitFor()
      await capture(f, `mobile-actions-sheet-${theme}`)
      await actions.getByRole('button', { name: 'Versions', exact: true }).click()
      const sheet = f.page.getByRole('dialog', { name: 'Versions', exact: true })
      await sheet.locator('[data-script-versions]').getByText('Current', { exact: true }).waitFor()
      await capture(f, `mobile-versions-${theme}`)
      await f.page.keyboard.press('Escape')
      await sheet.waitFor({ state: 'detached' })
      await f.workspace.locator('[data-script-coach-open]').click()
      await f.workspace.locator('[data-shooting-coach]').waitFor()
      await capture(f, `mobile-coach-${theme}`)
      await f.workspace.getByRole('button', { name: 'Edit script', exact: true }).click()
      await backToLibrary(f)
      await newScript(f)
      await capture(f, `mobile-brief-${theme}`)
      await f.page.setViewportSize({ width: 1440, height: 1000 })
      await capture(f, `desktop-brief-${theme}`)
      await f.page.locator('[data-script-library], [data-script-editor]').first().waitFor()
    } finally { await f.close() }
    const desktop = await fixture({ light, viewport: { width: 1440, height: 1000 } })
    try {
      await desktop.open()
      await expectCards(desktop, 6)
      await capture(desktop, `desktop-library-${theme}`)
      await openCard(desktop)
      await capture(desktop, `desktop-document-${theme}`)
      await desktop.page.locator('#script-status').click()
      await desktop.page.getByRole('option', { name: 'Draft', exact: true }).waitFor()
      await capture(desktop, `desktop-status-listbox-${theme}`)
      await desktop.page.keyboard.press('Escape')
      await desktop.workspace.getByRole('button', { name: 'Versions', exact: true }).click()
      await desktop.page.getByRole('dialog', { name: 'Version history' }).getByText('Current', { exact: true }).waitFor()
      await capture(desktop, `desktop-versions-${theme}`)
      await desktop.page.keyboard.press('Escape')
      await desktop.workspace.locator('[data-script-coach-open]').click()
      await desktop.workspace.locator('[data-shooting-coach]').waitFor()
      await capture(desktop, `desktop-coach-${theme}`)
    } finally { await desktop.close() }
  }
  const romanian = await fixture({ light: true, viewport: { width: 1440, height: 1000 } })
  try {
    await romanian.open('ro')
    await expectCards(romanian, 6)
    await romanian.library.getByRole('heading', { level: 1, name: 'Scripturi', exact: true }).waitFor()
    await romanian.library.getByRole('button', { name: 'Script nou', exact: true }).waitFor()
    await romanian.library.getByRole('switch', { name: 'Arhivate', exact: true }).waitFor()
    await capture(romanian, 'desktop-library-ro')
    await openCard(romanian)
    await romanian.workspace.getByRole('button', { name: 'Versiuni', exact: true }).waitFor()
    await capture(romanian, 'desktop-document-ro')
    await romanian.page.setViewportSize({ width: 390, height: 844 })
    await capture(romanian, 'mobile-document-ro')
  } finally { await romanian.close() }
  checks.push('390/768/1440px layouts, Romanian labels, mobile sheets and dark/light themes preserve accessible controls without horizontal overflow')
}

async function fastRefresh() {
  if (process.env.RUN_FAST_REFRESH !== '1') {
    console.log('SKIPPED component Fast Refresh probe; rerun RUN_FAST_REFRESH=1 after concurrent edits finish')
    return
  }
  const f = await fixture()
  try {
    await f.open()
    await openCard(f)
    await f.page.locator('[data-sidebar="trigger"]').filter({ visible: true }).first().click()
    await rememberShell(f.page)
    await field(f, 'hook').fill('Fast Refresh keeps this script edit')
    await until(() => f.records.find(record => record.id === scriptId(0)).snapshot.hook === 'Fast Refresh keeps this script edit')
    if (await sceneToggle(f, 1).getAttribute('aria-expanded') === 'true')
      await sceneToggle(f, 1).click()
    if (await sceneToggle(f, 2).getAttribute('aria-expanded') !== 'true')
      await sceneToggle(f, 2).click()
    const sourcePath = new URL('../src/components/script/script-scene-editor.tsx', import.meta.url)
    const source = await readFile(sourcePath), metadata = await stat(sourcePath)
    const text = source.toString('utf8'), anchor = 'data-script-scene='
    assert.equal(text.split(anchor).length, 2, 'Fast Refresh anchor unique')
    const reads = f.calls.list.length
    try {
      await writeFile(sourcePath, text.replace(anchor, 'data-script-refresh-probe="updated" data-script-scene='))
      await f.page.locator('[data-script-refresh-probe="updated"]').first().waitFor()
      await assertShell(f.page)
      assert.equal(await field(f, 'hook').inputValue(), 'Fast Refresh keeps this script edit')
      assert.equal(await sceneToggle(f, 1).getAttribute('aria-expanded'), 'false')
      assert.equal(await sceneToggle(f, 2).getAttribute('aria-expanded'), 'true')
      assert.equal(f.calls.list.length, reads, 'Component Fast Refresh does not reload/refetch library')
      fastRefreshVerified = true
    } finally {
      await writeFile(sourcePath, source)
      try {
        await f.page.waitForFunction(() => !document.querySelector('[data-script-refresh-probe]'))
        assert.deepEqual(await readFile(sourcePath), source)
        sourceRestorationVerified = true
      } finally { await utimes(sourcePath, metadata.atime, metadata.mtime) }
    }
    checks.push('Scene component Fast Refresh preserves script values, scene expansion, dashboard DOM and sidebar state')
  } finally { await f.close() }
}

try {
  await mkdir(output, { recursive: true })
  const selected = (process.env.SCRIPTS_SCENARIOS || '').split(',').filter(Boolean)
  const run = (name) => !selected.length || selected.includes(name)
  if (run('library')) await libraryAndShell()
  if (run('generation')) await briefAndGeneration()
  if (run('document')) await documentEditing()
  if (run('coach')) await versionsAndCoach()
  if (run('responsive')) await responsiveVariants()
  if (run('refresh')) await fastRefresh()
  assert.deepEqual(unexpectedMutations, [], 'Every API mutation stayed inside explicit synthetic fixture handlers')
  assert.deepEqual(runtimeErrors, [], 'No browser runtime or console errors')
  const reportName = selected.length ? `report-${selected.join('-')}.json` : 'report.json'
  await writeFile(new URL(reportName, output), JSON.stringify({
    checks, screenshots: reports, fastRefreshVerified, sourceRestorationVerified,
    unexpectedMutations, runtimeErrors
  }, null, 2))
  console.log(`Synthetic Scripts browser checks passed: ${checks.length} groups, ${reports.length} captures; Fast Refresh=${fastRefreshVerified}`)
} finally { await browser.close() }
