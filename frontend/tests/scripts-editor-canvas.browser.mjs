import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { libraryRecords, scriptId } from './fixtures/scripts-workspace.mjs'

// Scenarii editor against the Claude reference canvas. Every /api request is
// intercepted with synthetic records; no user database or real workspace is used.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE to installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local Vite server')
const output = new URL('../test-results/scripts-editor-canvas/', import.meta.url)
const channel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome'
const browser = await chromium.launch({ channel: channel || undefined, headless: true })
const consoleErrors = [], unexpectedMutations = [], checks = [], screenshots = []

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }
const user = {
  id: '00000000-0000-4000-8000-000000004300',
  name: 'Alex Morgan', email: 'scripts-editor@example.invalid',
  credits: 1000, plan: 'pro', access_role: 'member'
}
const STATUS_LABELS = {
  idea: 'Idee', draft: 'Schiță', review: 'În revizuire',
  ready: 'Pregătit', in_production: 'În producție', published: 'Publicat'
}

function versionsFor(record) {
  return Array.from({ length: record.revision }, (_, index) => ({
    id: `${record.id}-v${record.revision - index}`,
    versionNumber: record.revision - index,
    changeType: index === record.revision - 1 ? 'create' : 'edit',
    summary: index === 0 ? 'Editare manuală' : index === 1 ? 'Generat cu AI' : 'Script nou',
    createdAt: '2026-10-23T08:00:00Z',
    snapshot: { ...structuredClone(record.snapshot), hook: `Hook from v${record.revision - index}` }
  }))
}

async function until(predicate, message, timeout = 15000) {
  const start = Date.now()
  while (!(await predicate())) {
    assert.ok(Date.now() - start < timeout, message)
    await new Promise(resolve => setTimeout(resolve, 40))
  }
}

async function fixture({ light = true, viewport = DESKTOP } = {}) {
  const context = await browser.newContext({
    viewport,
    timezoneId: 'Europe/Bucharest',
    colorScheme: light ? 'light' : 'dark',
    reducedMotion: 'reduce',
    acceptDownloads: true,
    permissions: ['clipboard-read', 'clipboard-write']
  })
  const page = await context.newPage()
  page.setDefaultTimeout(25000)
  page.setDefaultNavigationTimeout(120000)
  page.on('pageerror', error => consoleErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text()))
      consoleErrors.push(message.text())
  })
  const records = structuredClone(libraryRecords())
  const histories = new Map(records.map(record => [record.id, versionsFor(record)]))
  const calls = { save: [], restore: [], archive: [] }
  const failures = new Map()
  const record = () => records.find(item => item.id === scriptId(0))

  // Each synthetic failure answers the next matching request with 503.
  function takeFailure(key) {
    if (!(failures.get(key) > 0)) return false
    failures.set(key, failures.get(key) - 1)
    return true
  }

  await context.route('**/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path !== '/v1/auth/refresh') unexpectedMutations.push(`${route.request().method()} ${path}`)
    return route.fulfill({ json: { access_token: 'synthetic-scripts-editor-token', user } })
  })
  await context.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    const item = path.match(/^\/api\/scripts\/items\/([^/]+)$/)
    const versions = path.match(/^\/api\/scripts\/items\/([^/]+)\/versions$/)
    const restore = path.match(/^\/api\/scripts\/items\/([^/]+)\/versions\/([^/]+)\/restore$/)
    if (path === '/api/scripts/items' && method === 'GET')
      return route.fulfill({ json: { scripts: records.filter(item => !item.archived) } })
    if (item && method === 'PATCH') {
      const payload = request.postDataJSON()
      calls.save.push(payload)
      if (takeFailure('save')) return route.fulfill({ status: 503, json: { error: 'Synthetic save failure' } })
      const target = records.find(entry => entry.id === item[1])
      assert.ok(target, 'Only a synthetic script can be saved')
      Object.assign(target, {
        title: payload.title, status: payload.status, snapshot: payload.snapshot,
        revision: target.revision + 1, updatedAt: '2026-10-23T09:00:00Z'
      })
      histories.get(target.id).unshift({
        id: `${target.id}-v${target.revision}`, versionNumber: target.revision,
        changeType: 'edit', summary: 'Editare manuală', createdAt: '2026-10-23T09:00:00Z',
        snapshot: structuredClone(target.snapshot)
      })
      return route.fulfill({ json: { script: target } })
    }
    if (item && method === 'DELETE') {
      calls.archive.push(item[1])
      const target = records.find(entry => entry.id === item[1])
      Object.assign(target, { archived: true, status: 'archived' })
      return route.fulfill({ json: { archived: true } })
    }
    if (versions && method === 'GET')
      return route.fulfill({ json: { versions: (histories.get(versions[1]) || []).map(({ snapshot: _snapshot, ...version }) => version) } })
    if (restore && method === 'POST') {
      const target = records.find(entry => entry.id === restore[1])
      const version = histories.get(restore[1]).find(entry => entry.id === restore[2])
      calls.restore.push({ id: restore[1], versionId: restore[2] })
      Object.assign(target, { snapshot: structuredClone(version.snapshot), revision: target.revision + 1 })
      return route.fulfill({ json: { script: target } })
    }
    if (method !== 'GET') {
      unexpectedMutations.push(`${method} ${path}`)
      return route.fulfill({ status: 405, json: { error: 'Blocked by synthetic Scenarii fixture' } })
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
    page, context, calls, records, record,
    fail(key, count = 1) { failures.set(key, count) },
    async open() {
      await page.goto(`${origin}/ro/dashboard/script-generator`, { waitUntil: 'networkidle' })
      await page.locator('[data-script-library]').waitFor()
      await page.locator(`[data-script-card="${scriptId(0)}"]`).click()
      await page.locator('[data-script-editor]').waitFor()
      await page.locator('#script-title').waitFor()
    },
    async close() { await context.close() }
  }
}

async function capture(page, name) {
  await page.mouse.move(0, 0)
  await page.waitForTimeout(150)
  const path = fileURLToPath(new URL(`${name}.png`, output))
  await page.screenshot({ path, fullPage: false })
  screenshots.push(name)
}

async function expectNoOverflow(page, label) {
  const layout = await page.evaluate(() => ({
    width: innerWidth, scrollWidth: document.documentElement.scrollWidth
  }))
  assert.ok(layout.scrollWidth <= layout.width + 1, `${label}: no horizontal page overflow ${JSON.stringify(layout)}`)
}

async function waitForSaved(f, predicate, message) {
  await until(() => f.calls.save.some(predicate), message)
  await f.page.locator('[data-save-state="saved"]').first().waitFor()
}

/** Desktop light: every toolbar, menu and status control reaches the right request. */
async function desktopLight() {
  const f = await fixture({ light: true, viewport: DESKTOP })
  try {
    await f.open()
    const toolbar = f.page.locator('[data-script-toolbar]')
    const back = toolbar.getByRole('button', { name: 'Scenarii', exact: true })
    assert.equal(await back.textContent(), 'Scenarii', 'Back button shows its text')
    await expectNoOverflow(f.page, 'Desktop editor')
    await capture(f.page, 'desktop-light-editor')
    checks.push('desktop back button text')

    // Title autosaves through PATCH.
    await f.page.locator('#script-title').fill('Cum am crescut la 10k')
    await waitForSaved(f, payload => payload.title === 'Cum am crescut la 10k', 'Title autosave PATCH')
    checks.push('title edit autosaves')

    // Status listbox: every status sends its own PATCH.
    for (const [status, label] of Object.entries(STATUS_LABELS)) {
      if (await f.page.locator('#script-status').getAttribute('data-script-status') === status) continue
      await f.page.locator('#script-status').click()
      await f.page.getByRole('option', { name: label, exact: true }).click()
      await waitForSaved(f, payload => payload.status === status, `Status ${status} PATCH`)
    }
    await f.page.locator('#script-status').click()
    await capture(f.page, 'desktop-light-status-menu')
    await f.page.keyboard.press('Escape')
    checks.push('status menu sends every status')

    // Copy writes the script to the clipboard and shows a Copiat toast.
    await toolbar.getByRole('button', { name: 'Copiază', exact: true }).click()
    await f.page.locator('[data-toast-region="corner"] [data-toast]').filter({ hasText: 'Copiat' }).waitFor()
    await capture(f.page, 'desktop-light-copied')
    const clipboard = await f.page.evaluate(() => navigator.clipboard.readText())
    assert.ok(clipboard.includes('Cum am crescut la 10k') && clipboard.includes('#'), 'Clipboard holds the script text')
    checks.push('copy icon writes clipboard and shows Copiat toast')

    // Download icon saves the text version.
    const txt = f.page.waitForEvent('download')
    await toolbar.getByRole('button', { name: 'Descarcă', exact: true }).click()
    assert.ok((await txt).suggestedFilename().endsWith('.txt'), 'Text download uses .txt')
    checks.push('download icon saves text')

    // More menu: JSON download, then archive last.
    await toolbar.getByRole('button', { name: 'Mai multe acțiuni', exact: true }).click()
    await f.page.getByRole('menuitem', { name: 'Descarcă JSON', exact: true }).waitFor()
    await capture(f.page, 'desktop-light-more-menu')
    const json = f.page.waitForEvent('download')
    await f.page.getByRole('menuitem', { name: 'Descarcă JSON', exact: true }).click()
    assert.ok((await json).suggestedFilename().endsWith('.json'), 'JSON download uses .json')
    checks.push('more menu downloads JSON')

    // Versions popover lists history and restores an older revision.
    await toolbar.getByRole('button', { name: 'Versiuni', exact: true }).click()
    const panel = f.page.getByRole('dialog', { name: 'Istoricul versiunilor' })
    await panel.waitFor()
    await capture(f.page, 'desktop-light-versions')
    await panel.getByRole('button', { name: 'Restaurează', exact: true }).first().click()
    await until(() => f.calls.restore.length === 1, 'Restore request sent')
    await f.page.getByText('Versiune restaurată', { exact: true }).waitFor()
    await f.page.keyboard.press('Escape')
    checks.push('versions popover restores a version')

    // Coach entry opens the coach view and returns to the editor.
    await f.page.locator('[data-script-coach-open]').click()
    await f.page.locator('#script-coach').waitFor({ state: 'visible' })
    await capture(f.page, 'desktop-light-coach')
    await f.page.getByRole('button', { name: 'Editează scenariul', exact: true }).click()
    await f.page.locator('[data-script-toolbar]').waitFor({ state: 'visible' })
    checks.push('coach card opens the coach view and back returns')

    // Save failure shows the error state; retry sends the change again.
    f.fail('save')
    await f.page.locator('#script-hook').fill('A quieter first sentence.')
    await f.page.getByRole('alert').filter({ hasText: 'Salvarea a eșuat' }).waitFor()
    await capture(f.page, 'desktop-light-save-failed')
    await f.page.getByRole('button', { name: 'Reîncearcă', exact: true }).click()
    await waitForSaved(f, payload => payload.snapshot.hook === 'A quieter first sentence.', 'Retry save')
    checks.push('save failure shows error and retry succeeds')

    // Archive closes the editor through the More menu.
    await toolbar.getByRole('button', { name: 'Mai multe acțiuni', exact: true }).click()
    await f.page.getByRole('menuitem', { name: 'Arhivează', exact: true }).click()
    await until(() => f.calls.archive.length === 1, 'Archive DELETE sent')
    await f.page.locator('[data-script-library]').waitFor()
    checks.push('more menu archives the script')
  } finally { await f.close() }
}

/** Phone light: sheets replace dropdowns, and the same actions still reach the API. */
async function mobileLight() {
  const f = await fixture({ light: true, viewport: MOBILE })
  try {
    await f.open()
    await expectNoOverflow(f.page, 'Mobile editor')
    const toolbar = f.page.locator('[data-script-toolbar]')
    assert.equal(await toolbar.getByRole('button', { name: 'Scenarii', exact: true }).textContent(), 'Scenarii', 'Mobile back button keeps its text')
    await capture(f.page, 'mobile-light-editor')
    checks.push('mobile back text keeps its label')
    const dock = f.page.locator('[data-mobile-dashboard-dock]')
    await dock.waitFor({ state: 'attached' })
    await until(async () => (await dock.getAttribute('data-dock-hidden')) !== null, 'Editor hides the phone dock')
    checks.push('mobile editor hides the bottom dock')

    await f.page.locator('#script-status').click()
    const statusSheet = f.page.getByRole('dialog', { name: 'Stare', exact: true })
    await statusSheet.waitFor()
    await capture(f.page, 'mobile-light-status-sheet')
    await statusSheet.locator('[data-script-status="published"]').click()
    await waitForSaved(f, payload => payload.status === 'published', 'Mobile status PATCH')
    checks.push('mobile status sheet sends the chosen status')

    await toolbar.getByRole('button', { name: 'Mai multe acțiuni', exact: true }).click()
    const actions = f.page.getByRole('dialog', { name: 'Acțiuni scenariu', exact: true })
    await actions.waitFor()
    await capture(f.page, 'mobile-light-actions-sheet')
    await actions.getByRole('button', { name: 'Copiază', exact: true }).click()
    await f.page.locator('[data-toast-region="corner"] [data-toast]').filter({ hasText: 'Copiat' }).waitFor()
    await capture(f.page, 'mobile-light-copied')
    checks.push('mobile copy action shows Copiat')

    await toolbar.getByRole('button', { name: 'Mai multe acțiuni', exact: true }).click()
    await f.page.getByRole('dialog', { name: 'Acțiuni scenariu', exact: true })
      .getByRole('button', { name: 'Versiuni', exact: true }).click()
    const versions = f.page.getByRole('dialog', { name: 'Versiuni', exact: true })
    await versions.waitFor()
    await capture(f.page, 'mobile-light-versions-sheet')
    await versions.getByRole('button', { name: 'Restaurează', exact: true }).first().click()
    await until(() => f.calls.restore.length === 1, 'Mobile restore request sent')
    // Wait for the restored record to be applied; otherwise the response overwrites the title typed below.
    await f.page.getByText('Versiune restaurată', { exact: true }).waitFor()
    checks.push('mobile versions sheet restores a version')

    f.fail('save')
    await f.page.locator('#script-title').fill('Mobile title edit')
    await f.page.getByRole('alert').filter({ hasText: 'Salvarea a eșuat' }).waitFor()
    await capture(f.page, 'mobile-light-save-failed')
    await f.page.getByRole('button', { name: 'Reîncearcă', exact: true }).click()
    await waitForSaved(f, payload => payload.title === 'Mobile title edit', 'Mobile retry save')
    checks.push('mobile save failure and retry')

    await toolbar.getByRole('button', { name: 'Mai multe acțiuni', exact: true }).click()
    await f.page.getByRole('dialog', { name: 'Acțiuni scenariu', exact: true })
      .getByRole('button', { name: 'Arhivează', exact: true }).click()
    await until(() => f.calls.archive.length === 1, 'Mobile archive DELETE sent')
    checks.push('mobile archive action')

    // Archiving returns to the library, where the bottom dock comes back.
    await f.page.locator('[data-script-library]').waitFor()
    await until(async () => (await dock.getAttribute('data-dock-hidden')) === null, 'Library shows the phone dock again')
    checks.push('mobile return to the library restores the bottom dock')
  } finally { await f.close() }
}

/** Dark mode keeps the same controls readable and the same flows reachable. */
async function darkSmoke() {
  for (const viewport of [DESKTOP, MOBILE]) {
    const label = viewport === DESKTOP ? 'desktop' : 'mobile'
    const f = await fixture({ light: false, viewport })
    try {
      await f.open()
      await expectNoOverflow(f.page, `Dark ${label} editor`)
      await capture(f.page, `${label}-dark-editor`)
      await f.page.locator('#script-status').click()
      await f.page.locator('[data-script-status="review"]').last().waitFor()
      await capture(f.page, `${label}-dark-status`)
      await f.page.keyboard.press('Escape')
      f.fail('save')
      await f.page.locator('#script-title').fill('Dark mode title')
      await f.page.getByRole('alert').filter({ hasText: 'Salvarea a eșuat' }).waitFor()
      await capture(f.page, `${label}-dark-save-failed`)
      await f.page.getByRole('button', { name: 'Reîncearcă', exact: true }).click()
      await waitForSaved(f, payload => payload.title === 'Dark mode title', `Dark ${label} retry`)
    } finally { await f.close() }
  }
  checks.push('dark mode desktop and mobile editor, status and save failure')
}

try {
  await mkdir(output, { recursive: true })
  await desktopLight()
  await mobileLight()
  await darkSmoke()
  assert.deepEqual(unexpectedMutations, [], 'Every API mutation stayed inside explicit synthetic fixture handlers')
  assert.deepEqual(consoleErrors, [], 'No browser runtime or console errors')
  await writeFile(new URL('report.json', output), JSON.stringify({ checks, screenshots, consoleErrors }, null, 2))
  console.log(`Scenarii editor canvas checks passed: ${checks.length} groups, ${screenshots.length} captures`)
} finally {
  await browser.close()
}
