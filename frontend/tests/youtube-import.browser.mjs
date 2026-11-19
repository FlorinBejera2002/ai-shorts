import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chooseCreationSource } from './creation-browser-helpers.mjs'

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5173'
const output = resolve('frontend/test-results/youtube-import')
await mkdir(output, { recursive: true })
const report = []
const user = { id: '00000000-0000-4000-8000-000000000071', email: 'youtube-import@example.invalid', name: 'Import fixture', credits: 1000, plan: 'free', access_role: 'member' }
const asset = { id: 'synthetic-video', import_id: 'synthetic-import', title: 'A strong message', file_name: 'own-video.mp4', file_size: 12 * 1024 ** 2, source_storage_key: `uploads/${user.id}/own-video.mp4`, created_at: '2026-11-17T10:00:00Z' }
const exportJob = { id: 'synthetic-import', status: 'exporting', visibilities: ['public'], video_count: 0, created_at: '2026-11-17T10:00:00Z', updated_at: '2026-11-17T10:00:00Z' }

async function fixtures(page, overrides = {}) {
  const state = { enabled: true, imports: [], videos: [], loadFailed: false, removalFailed: false, ...overrides }
  const calls = { reads: 0, connects: [], deletes: [], jobs: [], batches: [] }
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript((theme) => localStorage.setItem('theme', theme), overrides.theme ?? 'dark')
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return route.continue()
    if (url.hostname === 'accounts.google.com') return route.fulfill({ contentType: 'text/html', body: '<p>Synthetic Google consent page</p>' })
    return route.abort('blockedbyclient')
  })
  await page.route('**/v1/**', (route) => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
  await page.route('**/api/**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const reply = (json, status = 200) => route.fulfill({ json, status })
    if (path === '/api/user/credits') return reply({ credits: user.credits })
    if (path === '/api/user/brand') return reply({ brandKit: null })
    if (path === '/api/media-capabilities') return reply({ audio_cleanup: { available: true } })
    if (path === '/api/workspace-agent/runs') return reply({ runs: [], has_more: false })
    if (path === '/api/workspace-agent/suggestions') return reply({ suggestions: [], capabilities: [] })
    if (path === '/api/youtube/imports' && method === 'GET') {
      calls.reads++
      return state.loadFailed ? reply({ error: 'Synthetic outage' }, 503) : reply({ enabled: state.enabled, imports: state.imports, videos: state.videos })
    }
    if (path === '/api/youtube/imports/connect') {
      calls.connects.push(request.postDataJSON())
      return reply({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic' })
    }
    if (path.startsWith('/api/youtube/imports/') && method === 'DELETE') {
      calls.deletes.push(path)
      if (state.removalFailed) return reply({ error: 'Synthetic removal failure' }, 503)
      state.imports = state.imports.map((item) => ({ ...item, status: 'cancelled' }))
      return reply({ ok: true })
    }
    if (path.startsWith('/api/youtube/import-videos/') && method === 'DELETE') {
      calls.deletes.push(path)
      if (state.removalFailed) return reply({ error: 'Synthetic removal failure' }, 503)
      state.videos = state.videos.filter((video) => video.id !== path.split('/').at(-1))
      return reply({ ok: true })
    }
    if (path === '/api/jobs' && method === 'POST') {
      calls.jobs.push(request.postDataJSON())
      return reply({ id: '00000000-0000-4000-8000-000000000072' })
    }
    if (path === '/api/jobs/batch' && method === 'POST') {
      calls.batches.push(request.postDataJSON())
      return reply({ jobs: [] })
    }
    if (path.startsWith('/api/jobs/')) return reply({ job: { id: path.split('/').at(-1), status: 'pending', progress: 0, clips: [] } })
    if (path === '/api/stories') return reply({ stories: [] })
    return reply({})
  })
  return { state, calls, errors }
}

async function openLibrary(page, locale = 'en', suffix = '') {
  const pathname = `${locale === 'ro' ? '/ro' : ''}/dashboard/create`
  await page.goto(origin + pathname + '?mode=youtube' + suffix, { waitUntil: 'domcontentloaded', timeout: 180000 })
  const source = page.getByRole('radiogroup', { name: locale === 'ro' ? 'Sursa YouTube' : 'YouTube source', exact: true })
  await source.getByRole('radio', { name: locale === 'ro' ? 'Videoclipurile mele YouTube' : 'My YouTube videos', exact: true }).click()
  await page.getByTestId('youtube-import-library').waitFor()
  return source
}

async function assertNoOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal page overflow')
}

try {
  const consentPage = await browser.newPage({ viewport: { width: 1280, height: 960 } })
  const consentFixture = await fixtures(consentPage, { theme: 'light' })
  try {
    await openLibrary(consentPage)
    const connect = consentPage.getByRole('button', { name: 'Connect Google and import', exact: true })
    assert.equal(await connect.isDisabled(), true, 'Import requires explicit consent')
    assert.equal(consentFixture.calls.connects.length, 0, 'Opening the library never authorizes an import')
    assert.equal(await consentPage.getByRole('checkbox', { name: 'Public', exact: true }).isChecked(), true)
    assert.equal(await consentPage.getByRole('checkbox', { name: 'Unlisted', exact: true }).isChecked(), false)
    assert.equal(await consentPage.getByRole('checkbox', { name: 'Private', exact: true }).isChecked(), false)
    const checkbox = await consentPage.getByRole('checkbox', { name: 'Public', exact: true }).boundingBox()
    assert.ok(checkbox && Math.abs(checkbox.width - checkbox.height) < 1 && checkbox.height <= 20, 'Consent choices use checkbox geometry rather than inheriting switch styling')
    await consentPage.screenshot({ path: resolve(output, 'consent-desktop-light.png'), fullPage: true })
    await consentPage.getByRole('checkbox', { name: 'I authorize this import and the processing described above.', exact: true }).check()
    await consentPage.getByRole('checkbox', { name: 'Public', exact: true }).uncheck()
    assert.equal(await connect.isDisabled(), true, 'At least one visibility category is required')
    await consentPage.getByRole('checkbox', { name: 'Unlisted', exact: true }).check()
    await connect.click()
    await consentPage.waitForURL('https://accounts.google.com/**')
    assert.deepEqual(consentFixture.calls.connects, [{ visibilities: ['unlisted'], consent: true, locale: 'en' }])
    assert.deepEqual(consentFixture.errors, [])
    report.push({ explicitConsent: true, categoriesOptIn: true, sameTabOAuth: true })
  } finally { await consentPage.close() }

  const page = await browser.newPage({ viewport: { width: 1487, height: 1058 } })
  const fixture = await fixtures(page, { imports: [{ ...exportJob }] })
  try {
    const source = await openLibrary(page, 'en', '&youtubeImport=success&preserved=yes')
    await page.getByText('Google is preparing your videos', { exact: true }).waitFor()
    assert.equal(new URL(page.url()).searchParams.has('youtubeImport'), false, 'The callback result is consumed')
    assert.equal(new URL(page.url()).searchParams.get('preserved'), 'yes', 'Other query state is preserved')
    assert.equal(await page.getByRole('button', { name: 'Generate', exact: true }).isDisabled(), true, 'Exporting videos are not usable sources')
    const header = await page.locator('header').first().elementHandle()
    await page.locator('#ai-editing-direction').fill('Keep one strong idea.')
    await page.getByRole('button', { name: '1:1', exact: true }).click()
    fixture.state.imports[0] = { ...exportJob, status: 'ready', video_count: 1 }
    fixture.state.videos = [{ ...asset }]
    await page.getByRole('radio', { name: /A strong message/ }).waitFor({ timeout: 12000 })
    assert.ok(fixture.calls.reads >= 2, 'The active export is polled until ready')
    await page.getByRole('radio', { name: /A strong message/ }).check()
    await source.getByRole('radio', { name: 'YouTube link', exact: true }).click()
    await page.locator('#youtube-url').fill('https://youtu.be/abcdefghijk')
    await source.getByRole('radio', { name: 'My YouTube videos', exact: true }).click()
    assert.equal(await page.getByRole('radio', { name: /A strong message/ }).isChecked(), true, 'The imported selection survives source changes')
    await chooseCreationSource(page, 'upload')
    await chooseCreationSource(page, 'youtube')
    assert.equal(await page.getByRole('radio', { name: /A strong message/ }).isChecked(), true, 'Upload/YouTube switching preserves the imported selection')
    assert.equal(await header.evaluate((node) => node === document.querySelector('header')), true, 'Dashboard header identity is retained')
    assert.equal(await page.locator('#ai-editing-direction').inputValue(), 'Keep one strong idea.')
    if (process.env.RUN_FAST_REFRESH === '1') {
      const sourcePath = resolve('frontend/src/components/create/source-youtube-library.tsx')
      const before = await readFile(sourcePath, 'utf8')
      const changed = before.replace('data-testid="youtube-import-library"', 'data-testid="youtube-import-library" data-youtube-import-refresh-proof="ready"')
      assert.notEqual(changed, before)
      try {
        await writeFile(sourcePath, changed)
        await page.locator('[data-youtube-import-refresh-proof="ready"]').waitFor()
        assert.equal(await page.getByRole('radio', { name: /A strong message/ }).isChecked(), true, 'Fast Refresh preserves the selected import')
        assert.equal(await page.locator('#ai-editing-direction').inputValue(), 'Keep one strong idea.')
        assert.equal(await header.evaluate((node) => node === document.querySelector('header')), true)
      } finally {
        assert.equal(await readFile(sourcePath, 'utf8'), changed, 'Do not overwrite another edit while restoring the probe')
        await writeFile(sourcePath, before)
      }
      await page.locator('[data-youtube-import-refresh-proof="ready"]').waitFor({ state: 'detached' })
    }
    await assertNoOverflow(page)
    await page.screenshot({ path: resolve(output, 'library-desktop-dark.png'), fullPage: true })
    assert.equal(await page.locator('body').innerText().then((text) => /storage\.googleapis|access_token|synthetic-token/.test(text)), false, 'Secrets and signed URLs are never rendered')
    await page.getByRole('button', { name: 'Generate', exact: true }).click()
    await page.waitForURL('**/dashboard/jobs/*')
    assert.equal(fixture.calls.jobs.length, 1)
    assert.equal(fixture.calls.batches.length, 0, 'Imported videos never use the YouTube URL batch endpoint')
    assert.equal(fixture.calls.jobs[0].source_type, 'upload')
    assert.equal(fixture.calls.jobs[0].source_storage_key, asset.source_storage_key)
    assert.equal('source_url' in fixture.calls.jobs[0], false)
    assert.equal(fixture.calls.jobs[0].aspect_ratio, '1:1')
    assert.equal(fixture.calls.jobs[0].user_instructions, 'Keep one strong idea.')
    assert.deepEqual(fixture.errors, [])
    report.push({ callbackCleanup: true, pollingToReady: true, draftAndSelectionRetained: true, uploadJobPayload: true, fastRefresh: process.env.RUN_FAST_REFRESH === '1' ? 'passed' : 'skipped' })
  } catch (error) {
    await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true })
    throw error
  } finally { await page.close() }

  for (const locale of ['en', 'ro']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
    const fixture = await fixtures(page, { imports: [{ ...exportJob }], videos: [{ ...asset }], loadFailed: true })
    try {
      await openLibrary(page, locale, '&youtubeImport=error')
      await page.getByRole('button', { name: locale === 'ro' ? 'Încearcă din nou' : 'Try again', exact: true }).waitFor()
      assert.equal(fixture.calls.connects.length, 0, 'A rejected callback never starts another export')
      fixture.state.loadFailed = false
      await page.getByRole('button', { name: locale === 'ro' ? 'Încearcă din nou' : 'Try again', exact: true }).click()
      await page.getByRole('radio', { name: /A strong message/ }).waitFor()
      await page.getByRole('button', { name: locale === 'ro' ? 'Oprește importul' : 'Stop import', exact: true }).click()
      await page.getByText(locale === 'ro' ? 'Import oprit' : 'Import stopped', { exact: true }).waitFor()
      assert.equal(await page.getByRole('radio', { name: /A strong message/ }).count(), 1, 'Disconnect keeps copied media')
      await page.getByRole('radio', { name: /A strong message/ }).check()
      fixture.state.removalFailed = true
      const remove = page.getByRole('button', { name: locale === 'ro' ? 'Elimină A strong message din bibliotecă' : 'Remove A strong message from library', exact: true })
      await remove.click()
      await page.getByText(locale === 'ro' ? 'Elementul nu a putut fi eliminat. Încearcă din nou.' : "This item couldn't be removed. Try again.", { exact: true }).waitFor()
      assert.equal(await page.getByRole('radio', { name: /A strong message/ }).isChecked(), true, 'A failed deletion preserves the source')
      fixture.state.removalFailed = false
      await remove.click()
      await page.getByRole('radio', { name: /A strong message/ }).waitFor({ state: 'detached' })
      assert.equal(await page.getByRole('button', { name: locale === 'ro' ? 'Generează' : 'Generate', exact: true }).isDisabled(), true, 'Deleting the selected source disables Generate')
      fixture.state.enabled = false
      await page.getByRole('button', { name: locale === 'ro' ? 'Actualizează importurile' : 'Refresh imports', exact: true }).click()
      await page.getByText(locale === 'ro' ? /Importul din contul Google nu este disponibil momentan/ : /Importing from your Google account is currently unavailable/).waitFor()
      assert.equal(await page.getByRole('button', { name: locale === 'ro' ? 'Conectează Google și importă' : 'Connect Google and import', exact: true }).count(), 0)
      await assertNoOverflow(page)
      await page.screenshot({ path: resolve(output, `unavailable-mobile-${locale}.png`), fullPage: true })
      assert.deepEqual(fixture.errors, [])
      report.push({ locale, mobile: true, loadRetry: true, rejectedConsent: true, disconnectKeepsMedia: true, deletionRetry: true, unavailable: true })
    } finally { await page.close() }
  }
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log('PASS: ' + JSON.stringify(report))
} finally { await browser.close() }
