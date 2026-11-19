import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generatedSnapshot, scriptId } from './fixtures/scripts-workspace.mjs'

// Synthetic Scripts library, brief and Coach checks against the Romanian
// canvas (Sc-Main, Sc-Archived, Sc-Empty, Sc-NoResults, Sc-Loading, Sc-Error,
// Sc-New, Sc-Generating, Sc-Coach and their mobile variants). Every API read
// and mutation is intercepted; no request reaches a real database.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE to installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local Vite server')
const output = new URL('../test-results/scripts-library-canvas/', import.meta.url)
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome'
const browser = await chromium.launch({ channel: channel || undefined, headless: true })
const runtimeErrors = [], unexpectedMutations = [], captures = [], checks = []

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }
const PRIMARY = { light: 'rgb(11, 11, 12)', dark: 'rgb(142, 155, 176)' }
const CANVAS_TITLES = [
  ['Cum am crescut la 10k urmăritori', 'ready', 'tiktok', 45, 'acum 2 ore'],
  ['3 greșeli la primul podcast', 'review', 'youtube', 60, 'ieri'],
  ['Pâine de casă în 3 pași', 'draft', 'instagram', 30, 'ieri'],
  ['De ce public marțea', 'idea', 'tiktok', 30, 'acum 3 zile'],
  ['Unboxing microfon de 200 de lei', 'in_production', 'youtube', 90, 'acum 4 zile'],
  ['Paste cremoase fără smântână', 'published', 'instagram', 30, 'acum o săptămână'],
  ['Întrebarea care schimbă tot', 'draft', 'facebook', 45, 'acum o săptămână'],
  ['Biroul meu de creator', 'ready', 'tiktok', 15, 'acum 2 săptămâni'],
  ['Primul meu sponsor', 'idea', 'tiktok', 60, 'acum 2 săptămâni']
]

// Two archived scripts sit beside the nine active ones in the canvas data.
function canvasRecords() {
  const active = CANVAS_TITLES.map(([title, status, platform, duration], index) => ({
    id: scriptId(index), title, topic: 'Synthetic brief for the library canvas',
    status, platform, language: 'ro', targetDurationSeconds: duration,
    tone: 'educational', style: 'talking_head', audience: 'Synthetic audience',
    snapshot: { ...generatedSnapshot(), title }, archived: false,
    revision: 3 + (index % 3),
    updatedAt: new Date(Date.now() - (index + 1) * 3_600_000 * (index % 2 ? 24 : 1)).toISOString(),
    createdAt: '2026-10-20T06:30:00Z'
  }))
  const archived = ['Vlog de vacanță · partea 1', 'Tur prin noul studio'].map((title, index) => ({
    id: scriptId(20 + index), title, topic: 'Archived synthetic brief',
    status: 'archived', platform: 'youtube', language: 'ro', targetDurationSeconds: 60,
    tone: 'educational', style: 'talking_head', audience: 'Synthetic audience',
    snapshot: { ...generatedSnapshot(), title }, archived: true, revision: 2,
    updatedAt: '2026-10-10T07:00:00Z', createdAt: '2026-10-01T06:30:00Z'
  }))
  return [...active, ...archived]
}

async function fixture({ viewport = DESKTOP, dark = false, empty = false } = {}) {
  const context = await browser.newContext({
    viewport, timezoneId: 'Europe/Bucharest', colorScheme: dark ? 'dark' : 'light',
    reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write']
  })
  const page = await context.newPage()
  page.setDefaultTimeout(25000)
  page.setDefaultNavigationTimeout(120000)
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text()))
      runtimeErrors.push(message.text())
  })
  const records = empty ? [] : canvasRecords()
  const calls = { list: [], create: [], save: [], generation: [] }
  const gates = new Map(), failures = new Map()
  const user = {
    id: '00000000-0000-4000-8000-000000004399', name: 'Synthetic Creator',
    email: 'scripts-canvas@example.invalid', credits: 1000, plan: 'pro', access_role: 'member'
  }
  async function maybeFail(route, key) {
    if (gates.has(key)) await gates.get(key).promise
    if (!(failures.get(key) > 0)) return false
    failures.set(key, failures.get(key) - 1)
    await route.fulfill({ status: 503, json: { error: `Synthetic ${key} failure. Try again.` } })
    return true
  }
  await context.route('**/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path !== '/v1/auth/refresh') unexpectedMutations.push(`${route.request().method()} ${path}`)
    return route.fulfill({ json: { access_token: 'synthetic-scripts-canvas-token', user } })
  })
  await context.route('**/api/**', async (route) => {
    const request = route.request(), url = new URL(request.url())
    const path = url.pathname, method = request.method()
    const item = path.match(/^\/api\/scripts\/items\/([^/]+)$/)
    if (path === '/api/scripts/items' && method === 'GET') {
      calls.list.push(Object.fromEntries(url.searchParams))
      if (await maybeFail(route, 'list')) return
      const query = (url.searchParams.get('query') || '').trim().toLowerCase()
      const includeArchived = url.searchParams.get('archived') === 'true'
      return route.fulfill({ json: { scripts: records.filter(record =>
        (includeArchived || !record.archived) &&
        `${record.title} ${record.topic}`.toLowerCase().includes(query)
      ) } })
    }
    if (path === '/api/scripts/items' && method === 'POST') {
      const payload = request.postDataJSON()
      calls.create.push(payload)
      if (await maybeFail(route, 'create')) return
      const record = {
        id: scriptId(100 + calls.create.length), title: payload.title, topic: payload.topic,
        status: payload.status, platform: payload.platform, language: payload.language,
        targetDurationSeconds: payload.target_duration_seconds, tone: payload.tone,
        style: payload.style, audience: payload.audience, snapshot: payload.snapshot,
        archived: false, revision: 1, createdAt: '2026-10-23T07:00:00Z', updatedAt: '2026-10-23T07:00:00Z'
      }
      records.unshift(record)
      return route.fulfill({ json: { script: record } })
    }
    if (path === '/api/scripts/generate' && method === 'POST') {
      calls.generation.push(request.postDataJSON())
      if (await maybeFail(route, 'generation')) return
      return route.fulfill({ json: { script: { ...generatedSnapshot(), title: 'A better morning routine' } } })
    }
    if (item && method === 'PATCH') {
      const record = records.find(entry => entry.id === item[1])
      assert.ok(record, 'Only a synthetic script can be mutated')
      const payload = request.postDataJSON()
      calls.save.push({ id: record.id, payload })
      if (await maybeFail(route, 'save')) return
      Object.assign(record, {
        title: payload.title, topic: payload.topic, status: payload.status, platform: payload.platform,
        language: payload.language, targetDurationSeconds: payload.target_duration_seconds,
        tone: payload.tone, style: payload.style, audience: payload.audience, snapshot: payload.snapshot,
        revision: record.revision + 1, updatedAt: new Date().toISOString()
      })
      return route.fulfill({ json: { script: record } })
    }
    if (method !== 'GET') {
      unexpectedMutations.push(`${method} ${path}`)
      return route.fulfill({ status: 405, json: { error: 'Unexpected mutation blocked by synthetic fixture' } })
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
  const workspace = page.locator('[data-script-workspace]')
  return {
    page, context, calls, records, workspace,
    library: page.locator('[data-script-library]'),
    editor: page.locator('[data-script-editor]'),
    fail(key, count = 1) { failures.set(key, count) },
    hold(key) {
      let release
      gates.set(key, { promise: new Promise(resolve => { release = resolve }), release })
    },
    release(key) { gates.get(key)?.release(); gates.delete(key) },
    async open() {
      await page.goto(`${origin}/ro/dashboard/script-generator`, { waitUntil: 'networkidle' })
      await this.library.waitFor()
      await until(() => calls.list.length > 0, 'Library list request missing')
    },
    async close() {
      for (const gate of gates.values()) gate.release()
      await context.close()
    }
  }
}

async function until(predicate, message = 'Expected fixture request', timeout = 25000) {
  const start = Date.now()
  while (!(await predicate())) {
    assert.ok(Date.now() - start < timeout, message)
    await new Promise(resolve => setTimeout(resolve, 40))
  }
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1, undefined, { timeout: 2500 }).catch(() => {})
}

async function noOverflow(page, label) {
  await settle(page)
  const layout = await page.evaluate(() => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll('body *')].map(element => {
      const bounds = element.getBoundingClientRect()
      return { tag: element.tagName, class: String(element.className), left: bounds.left, right: bounds.right }
    }).filter(element => element.left >= 0 && element.right > innerWidth + 1).slice(0, 12)
  }))
  assert.ok(layout.scrollWidth <= layout.width + 1, `${label}: no horizontal page overflow; ${JSON.stringify(layout)}`)
}

async function capture(f, name) {
  await noOverflow(f.page, name)
  await f.page.mouse.move(0, 0)
  await f.page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)) })
  captures.push(name)
}

async function expectStyle(locator, expected, label) {
  const actual = await locator.evaluate((element, keys) => {
    const style = getComputedStyle(element)
    return Object.fromEntries(keys.map(key => [key, style.getPropertyValue(key)]))
  }, Object.keys(expected))
  assert.deepEqual(actual, expected, label)
}

const themeName = (dark) => (dark ? 'dark' : 'light')
const primaryBackground = (dark) => PRIMARY[themeName(dark)]
const isMobile = (viewport) => viewport.width < 640

async function expectCards(f, count) {
  await f.page.waitForFunction(expected => document.querySelectorAll('[data-script-card]').length === expected, count)
}

async function openCard(f, index = 0) {
  await f.library.locator(`[data-script-card="${scriptId(index)}"]`).click()
  await f.editor.waitFor()
}

function search(f) {
  return f.library.getByRole('searchbox', { name: 'Caută scenarii', exact: true })
}

// Archived visibility: a switch on desktop, a pressed icon button on phones.
async function setArchived(f, on, viewport) {
  if (isMobile(viewport)) {
    const toggle = f.library.getByRole('button', { name: 'Arată arhivate', exact: true })
    if ((await toggle.getAttribute('aria-pressed')) !== String(on)) await toggle.click()
    return
  }
  const archived = f.library.getByRole('switch', { name: 'Arhivate', exact: true })
  if (on) await archived.check()
  else await archived.uncheck()
}

// ---------------------------------------------------------------------------

async function libraryStates(dark, viewport) {
  const label = `${isMobile(viewport) ? 'mobile' : 'desktop'}-${themeName(dark)}`
  const f = await fixture({ viewport, dark })
  try {
    await f.open()
    await expectCards(f, 9)
    assert.equal(await f.library.locator('[data-script-count]').textContent(), '9 scenarii', 'Active count line')
    await expectStyle(f.page.locator('#dashboard-main'), {
      'background-color': dark ? 'rgb(14, 19, 28)' : 'rgb(245, 247, 251)'
    }, 'Scripts paints the reference canvas')
    await expectStyle(f.library.locator('[data-script-new]').first(), {
      'background-color': primaryBackground(dark)
    }, 'New scenario uses the black or steel primary')
    await expectStyle(f.library.locator('article').first(), {
      'border-top-left-radius': isMobile(viewport) ? '20px' : '24px'
    }, 'Library card radius')
    await f.library.locator('[data-script-card]').first().waitFor()
    await capture(f, `${label}-main`)

    await search(f).fill('Cum am')
    await expectCards(f, 1)
    assert.equal(f.calls.list.at(-1).query, 'Cum am', 'Search sends the typed query')
    await search(f).fill('zzz fără rezultat')
    await expectCards(f, 0)
    await f.library.getByRole('heading', { name: 'Niciun scenariu găsit', exact: true }).waitFor()
    await capture(f, `${label}-noresults`)
    await search(f).fill('')
    await expectCards(f, 9)

    await setArchived(f, true, viewport)
    await expectCards(f, 11)
    assert.equal(f.calls.list.at(-1).archived, 'true', 'Archived switch requests archived scripts')
    assert.equal(await f.library.locator('[data-script-count]').textContent(), '11 scenarii · inclusiv arhivate')
    await capture(f, `${label}-archived`)
    await setArchived(f, false, viewport)
    await expectCards(f, 9)
    checks.push(`${label}: count, search results, no-results state, archived filter and canvas tokens`)
  } finally { await f.close() }
}

async function libraryLoadingAndError(viewport) {
  const label = `${isMobile(viewport) ? 'mobile' : 'desktop'}-light`
  const loading = await fixture({ viewport })
  try {
    loading.hold('list')
    await loading.page.goto(`${origin}/ro/dashboard/script-generator`, { waitUntil: 'domcontentloaded' })
    await loading.library.waitFor()
    await until(() => loading.calls.list.length > 0, 'Loading list request missing')
    assert.equal(await loading.library.getAttribute('aria-busy'), 'true', 'Loading marks the library busy')
    assert.equal(await loading.library.locator('article').count(), 0, 'Loading shows placeholders, not cards')
    await capture(loading, `${label}-loading`)
    loading.release('list')
    await expectCards(loading, 9)
  } finally { await loading.close() }

  const failing = await fixture({ viewport })
  try {
    failing.fail('list')
    await failing.open()
    const alert = failing.library.getByRole('alert')
    await alert.getByRole('heading', { name: 'Scenariile nu s-au putut încărca', exact: true }).waitFor()
    await capture(failing, `${label}-error`)
    await alert.getByRole('button', { name: 'Reîncearcă', exact: true }).click()
    await expectCards(failing, 9)
    checks.push(`${label}: loading placeholders, load error and Reîncearcă refetch`)
  } finally { await failing.close() }
}

async function libraryEmptyAndNew(viewport) {
  const label = `${isMobile(viewport) ? 'mobile' : 'desktop'}-light`
  const f = await fixture({ viewport, empty: true })
  try {
    await f.open()
    await f.library.getByRole('heading', { name: 'Niciun scenariu încă', exact: true }).waitFor()
    await capture(f, `${label}-empty`)
    // Empty-state action and toolbar action both create a server draft.
    await f.library.locator('article').count().then(count => assert.equal(count, 0))
    await f.library.locator('section').filter({ hasText: 'Niciun scenariu încă' }).getByRole('button', { name: 'Scenariu nou', exact: true }).click()
    await f.editor.waitFor()
    assert.equal(f.calls.create.length, 1, 'Empty-state Scenariu nou creates one server draft')
    assert.equal(f.calls.create[0].language, 'ro', 'Romanian locale drafts Romanian scripts')
    const toolbar = await fixture({ viewport, empty: true })
    try {
      await toolbar.open()
      await toolbar.library.locator('[data-script-new]').click()
      await toolbar.editor.waitFor()
      assert.equal(toolbar.calls.create.length, 1, 'Toolbar Scenariu nou creates one server draft')
    } finally { await toolbar.close() }
    checks.push(`${label}: empty state and Scenariu nou creation path`)
  } finally { await f.close() }
}

async function briefOptions(viewport, dark) {
  const label = `${isMobile(viewport) ? 'mobile' : 'desktop'}-${themeName(dark)}`
  const f = await fixture({ viewport, dark, empty: true })
  try {
    await f.open()
    await f.library.getByRole('heading', { name: 'Niciun scenariu încă', exact: true }).waitFor()
    await f.library.locator('[data-script-new]').click()
    await f.editor.waitFor()
    const topic = f.page.locator('#script-topic')
    await topic.waitFor()
    await f.page.locator('[data-script-brief]').first().getByRole('heading', { name: 'Brief', exact: true }).waitFor()
    assert.equal(await f.page.locator('[data-script-brief]').first().getAttribute('data-collapsible'), 'false')
    await expectStyle(f.page.locator('[data-script-generate]'), { 'background-color': primaryBackground(dark) }, 'Generate button primary')
    await capture(f, `${label}-new`)

    await topic.fill('Un ritual de dimineață pentru creatorii ocupați')
    await f.page.locator('#script-audience').fill('Creatori ocupați')
    const tones = f.page.getByRole('radiogroup', { name: 'Ton', exact: true })
    for (const name of ['Distractiv', 'Inspirațional', 'Vânzări', 'Povestire', 'Amuzant', 'Educativ'])
      await tones.getByRole('radio', { name, exact: true }).click()
    assert.equal(await tones.getByRole('radio', { checked: true }).textContent(), 'Educativ', 'Tone chips keep one selection')
    const styles = f.page.getByRole('radiogroup', { name: 'Stil video', exact: true })
    for (const name of ['B-Roll', 'Tutorial', 'Povestire', 'Vlog', 'Demo Produs', 'Talking Head'])
      await styles.getByRole('radio', { name, exact: true }).click()
    assert.equal(await styles.getByRole('radio', { checked: true }).textContent(), 'Talking Head', 'Style chips keep one selection')
    const platforms = f.page.locator('#script-platform')
    for (const name of ['TikTok', 'YouTube Shorts', 'Instagram Reels', 'Facebook']) {
      await platforms.getByRole('radio', { name, exact: true }).click()
      assert.equal(await platforms.getByRole('radio', { name, exact: true }).getAttribute('aria-checked'), 'true', `${name} platform selects`)
    }
    await f.page.locator('#script-duration').selectOption('60')
    await f.page.locator('#script-language').selectOption('en')
    assert.equal(await f.page.locator('#script-language option[value="en"]').textContent(), 'Engleză', 'Language names read as the reference')
    await f.page.locator('#script-language').selectOption('ro')
    await f.page.waitForFunction(() => document.querySelector('#script-language')?.value === 'ro')
    await capture(f, `${label}-brief-filled`)
    if (isMobile(viewport)) await capture(f, `${label}-brief-mobile-filled`)
    checks.push(`${label}: every brief chip, platform circle, duration and language option works`)
  } finally { await f.close() }
}

async function generation(viewport, dark) {
  const label = `${isMobile(viewport) ? 'mobile' : 'desktop'}-${themeName(dark)}`
  const f = await fixture({ viewport, dark, empty: true })
  try {
    await f.open()
    await f.library.locator('[data-script-new]').click()
    await f.editor.waitFor()
    const generate = f.page.locator('[data-script-generate]')
    await generate.click()
    assert.equal(f.calls.generation.length, 0, 'An empty topic is not sent to generation')
    await f.page.locator('#script-topic').fill('Un ritual de dimineață pentru creatorii ocupați')
    f.hold('generation')
    f.fail('generation')
    await generate.click()
    await generate.getByText('Se generează...', { exact: true }).waitFor()
    assert.equal(await generate.isDisabled(), true, 'Generating disables the brief action')
    await capture(f, `${label}-generating`)
    f.release('generation')
    await f.page.getByText('Synthetic generation failure. Try again.', { exact: true }).waitFor()
    await generate.click()
    await f.page.waitForFunction(() => document.querySelector('#script-title')?.value === 'A better morning routine')
    assert.equal(f.calls.generation.at(-1).topic, 'Un ritual de dimineață pentru creatorii ocupați')
    assert.equal(f.calls.generation.at(-1).language, 'ro')
    await f.editor.locator('[data-script-scene]').nth(2).waitFor()
    assert.equal(await f.editor.locator('[data-script-scene]').count(), 3)
    assert.equal(await f.page.locator('[data-script-brief]').first().getAttribute('data-collapsible'), 'true')
    checks.push(`${label}: generation busy, failure retry and success into the editor`)
  } finally { await f.close() }
}

async function cardOpensEditor(viewport, dark) {
  const f = await fixture({ viewport, dark })
  try {
    await f.open()
    await openCard(f, 0)
    assert.equal(await f.page.locator('#script-title').inputValue(), 'Cum am crescut la 10k urmăritori', 'Card opens its script')
    checks.push(`${isMobile(viewport) ? 'mobile' : 'desktop'}-${themeName(dark)}: card click opens the editor`)
  } finally { await f.close() }
}

async function coachControls(viewport, dark) {
  const label = `${isMobile(viewport) ? 'mobile' : 'desktop'}-${themeName(dark)}`
  const f = await fixture({ viewport, dark })
  try {
    await f.open()
    await openCard(f, 0)
    await f.workspace.locator('[data-script-coach-open]').click()
    const coach = f.workspace.locator('[data-shooting-coach]')
    await coach.waitFor()
    await expectStyle(coach.locator('[data-coach-stage]'), { 'background-color': 'rgb(15, 23, 42)' }, 'Coach stage keeps the scene backdrop')
    for (const mode of ['director', 'camera', 'top']) {
      await coach.locator(`[data-coach-view="${mode}"]`).click()
      assert.equal(await coach.locator(`[data-coach-view="${mode}"]`).getAttribute('aria-pressed'), 'true')
    }
    await capture(f, `${label}-coach`)
    await coach.locator('[data-coach-scene="1"]').click()
    assert.equal(await coach.locator('[data-coach-scene="1"]').getAttribute('aria-current'), 'step')
    await coach.getByRole('button', { name: 'Repornește previzualizarea', exact: true }).click()
    await coach.getByRole('button', { name: 'Întrerupe previzualizarea', exact: true }).click()
    await coach.getByRole('button', { name: 'Pornește previzualizarea', exact: true }).click()
    await coach.getByRole('button', { name: 'Întrerupe previzualizarea', exact: true }).waitFor()
    await coach.getByRole('button', { name: 'Dezactivează sunetul', exact: true }).click()
    await coach.getByRole('button', { name: 'Activează sunetul', exact: true }).click()
    await coach.getByRole('button', { name: 'Întrerupe previzualizarea', exact: true }).click()
    await f.workspace.getByRole('button', { name: 'Editează scenariul', exact: true }).click()
    await f.editor.waitFor()
    checks.push(`${label}: coach view modes, scene selection, restart, play/pause, sound and return to editor`)
  } finally { await f.close() }
}

try {
  await mkdir(output, { recursive: true })
  for (const dark of [false, true]) {
    await libraryStates(dark, DESKTOP)
    await libraryStates(dark, MOBILE)
    await briefOptions(DESKTOP, dark)
    await briefOptions(MOBILE, dark)
    await generation(DESKTOP, dark)
    await generation(MOBILE, dark)
    await cardOpensEditor(DESKTOP, dark)
    await cardOpensEditor(MOBILE, dark)
    await coachControls(DESKTOP, dark)
    await coachControls(MOBILE, dark)
  }
  await libraryLoadingAndError(DESKTOP)
  await libraryLoadingAndError(MOBILE)
  await libraryEmptyAndNew(DESKTOP)
  await libraryEmptyAndNew(MOBILE)
  assert.deepEqual(unexpectedMutations, [], 'Every mutation stayed inside explicit synthetic fixture handlers')
  assert.deepEqual(runtimeErrors, [], 'No browser runtime or console errors')
  await writeFile(new URL('report.json', output), JSON.stringify({ checks, captures, unexpectedMutations, runtimeErrors }, null, 2))
  console.log(`Synthetic Scripts canvas checks passed: ${checks.length} groups, ${captures.length} captures`)
} finally { await browser.close() }
