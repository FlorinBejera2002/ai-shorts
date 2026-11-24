import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chooseCreationSource } from './creation-browser-helpers.mjs'

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5196'
const output = resolve('test-results/unified-creation')
await mkdir(output, { recursive: true })
// The channel list is the only YouTube source; these rows stand in for the connected channel's videos.
const CHANNEL_VIDEOS = [
  { id: 'abcdefghijk', title: 'Synthetic channel clip', duration_seconds: 212, published_at: '2026-11-01T10:00:00Z', visibility: 'public', thumbnail_url: null, url: 'https://www.youtube.com/watch?v=abcdefghijk' },
  { id: 'lmnopqrstuv', title: 'Second synthetic clip', duration_seconds: 340, published_at: '2026-10-20T10:00:00Z', visibility: 'private', thumbnail_url: null, url: 'https://www.youtube.com/watch?v=lmnopqrstuv' }
]
const clipRow = (page) => page.getByRole('checkbox', { name: /Synthetic channel clip/ })
const consentBox = (page) => page.getByRole('checkbox', { name: /I agree that the chosen videos|Sunt de acord ca videoclipurile alese/ })
const user = { id: '00000000-0000-4000-8000-000000000041', email: 'unified-creation@example.invalid', name: 'Synthetic creator', credits: 1000, plan: 'free', access_role: 'member' }
const limits = { max_file_bytes: 2 * 1024 ** 3, max_total_bytes: 10 * 1024 ** 3, max_source_seconds: 900, max_total_seconds: 3600 }
const report = []
const studioPhoto = await readFile(new URL('./fixtures/create-clips/studio-source.png', import.meta.url))

async function installFixtures(page, account = {}) {
  const fixtureUser = { ...user, ...account }
  const errors = []
  const projects = new Map()
  const calls = { uploads: 0, registrations: 0, jobs: [], generations: [], assistant: [], selections: [] }
  let releaseUpload
  const uploadGate = new Promise((resolve) => { releaseUpload = resolve })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return route.continue()
    return route.abort('blockedbyclient')
  })
  await page.route('https://www.youtube.com/oembed**', (route) => route.fulfill({ json: { title: 'Synthetic YouTube title', author_name: 'Fixture author' } }))
  await page.route('https://img.youtube.com/**', (route) => route.fulfill({
    contentType: 'image/png', body: studioPhoto
  }))
  await page.route('**/original/**', (route) => route.fulfill({ status: 204 }))
  await page.route('**/v1/**', (route) => route.fulfill({ json: { access_token: 'synthetic-token', user: fixtureUser } }))
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const reply = (json, status = 200) => route.fulfill({ json, status })
    if (path === '/api/user/credits') return account.creditsUnavailable
      ? reply({ error: 'Synthetic credits connection failure' }, 503)
      : reply({ credits: fixtureUser.credits, creditsUnlimited: fixtureUser.access_role === 'admin' })
    if (path === '/api/user/brand') return reply({ brandKit: null })
    if (path === '/api/media-capabilities') return reply({ audio_cleanup: { available: true } })
    if (path === '/api/workspace-agent/runs') return reply({ runs: [], has_more: false })
    if (path === '/api/workspace-agent/suggestions') return reply({ suggestions: [], capabilities: [] })
    if (path === '/api/assistant/history') return reply({ messages: [] })
    if (path === '/api/assistant/chat' && method === 'POST') {
      calls.assistant.push(request.postDataJSON())
      return reply({ reply: 'Configured three square clips.', actions: [
        { type: 'update_settings', settings: { clips: 3, aspect_ratio: '1:1', subtitle_style: 'bold', smart_crop: false } },
        { type: 'set_instructions', instructions: 'Keep the strongest practical tips.' }
      ] })
    }
    if (path === '/api/upload/authorize') return reply({ uploadUrl: '/api/upload', token: null })
    if (path === '/api/upload') {
      calls.uploads++
      await uploadGate
      return reply({ file_path: 'uploads/synthetic-phone-video.mp4' })
    }
    if (path === '/api/stories') {
      if (method === 'GET') return reply({ stories: [...projects.values()] })
      const body = request.postDataJSON()
      const project = { id: body.id, options: body.options, status: 'draft', assets: [], versions: [], current_version: 0, limits }
      projects.set(project.id, project)
      return reply(project)
    }
    const story = /^\/api\/stories\/([^/]+)(.*)$/.exec(path)
    if (story) {
      const project = projects.get(story[1])
      assert.ok(project, 'Only synthetic projects are requested')
      if (story[2] === '/assets') {
        calls.registrations++
        const body = request.postDataJSON()
        project.assets.push({ id: body.id, name: body.name, size: 23, duration: 4, kind: 'video', order: body.order, role: 'auto', include: 'auto', source_url: '/original/phone-video.mp4', candidates: [] })
      } else if (story[2] === '/generate') calls.generations.push(request.postDataJSON())
      else if (method === 'PATCH') Object.assign(project, request.postDataJSON())
      return reply(project)
    }
    if (path === '/api/jobs' && method === 'POST') {
      calls.jobs.push(request.postDataJSON())
      return reply({ id: '00000000-0000-4000-8000-000000000042' })
    }
    if (path === '/api/youtube/imports/selection' && method === 'POST') {
      calls.selections.push(request.postDataJSON())
      return reply({ import_id: 'synthetic-import', url: 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic' })
    }
    if (path === '/api/youtube/imports' && method === 'GET') return reply({ imports: [] })
    if (path === '/api/youtube/channel') return reply({ enabled: true, connected: true, account: { channel_id: 'UCsynthetic', title: 'Synthetic channel', avatar_url: null } })
    if (path === '/api/youtube/channel/videos') return reply({ videos: CHANNEL_VIDEOS, next_page_token: null })
    if (path.startsWith('/api/jobs/')) return reply({ job: { id: path.split('/').at(-1), status: 'pending', progress: 0, clips: [] } })
    if (path === '/api/clips') return reply({ clips: [], jobs: [], total: 0 })
    if (path === '/api/jobs') return reply({ jobs: [], total: 0 })
    if (path === '/api/dashboard') return reply({ metrics: { credits: 1000, plan: 'free', jobCount: 0, clipCount: 0, durationMinutes: 0, activity: [], statuses: {} }, recentClips: [] })
    return reply({})
  })
  return { calls, projects, errors, releaseUpload }
}

async function assertSinglePage(page, locale = 'en') {
  assert.equal(await page.locator('h1').count(), 1, 'One heading for the creation page, including hidden workspaces')
  assert.equal(await page.getByRole('heading', { level: 1, name: locale === 'ro' ? 'Creează clipuri' : 'Create clips', exact: true }).count(), 1)
  assert.equal(await page.getByRole('button', { name: /^(Multi-clip story|Import a video or link|Poveste din mai multe filmări|Import dintr-un videoclip sau link)$/ }).count(), 0)
  assert.equal(await page.getByRole('tablist').count(), 0, 'Source selection is not duplicated by nested mode tabs')
  assert.equal(await page.locator('.creation-workspace').getByRole('link', { name: /Write.*script|Scrie.*script/i }).count(), 0, 'No script shortcut in the creation content')
  assert.equal(await page.locator('.creation-assistant').count(), 0, 'The large default assistant panel is removed')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal page overflow')
  const duplicateIDs = await page.locator('[id]').evaluateAll((nodes) => {
    const seen = new Set()
    return nodes.map((node) => node.id).filter((id) => seen.has(id) || !seen.add(id))
  })
  assert.deepEqual(duplicateIDs, [], 'Both mounted workspaces have unique DOM IDs')
}

async function assertCreationGeometry(page, viewport) {
  const elements = await Promise.all([
    page.getByTestId('creation-settings-inspector'),
    page.getByTestId('creation-source-media'),
    page.getByRole('button', { name: 'Generate clips', exact: true })
  ].map(locator => locator.elementHandle()))
  // Capture every rectangle in the same frame after fonts settle. Separate
  // browser round trips can observe different scroll/layout positions.
  const [inspector, source, action] = await page.evaluate(async nodes => {
    await document.fonts.ready
    return nodes.map(node => node?.getBoundingClientRect().toJSON())
  }, elements)
  assert.ok(inspector && source && action, 'Every part of the selected layout is visible')
  // Creare controls follow the canvas: the source switch is a 40px pill, segments 34px and Generate 44px or taller.
  for (const [locator, minimumHeight] of [
    [page.locator('#creation-source [role=radio]').first(), 39.9],
    [page.getByRole('radiogroup', { name: 'Subtitles', exact: true }).getByRole('radio').first(), 33.9],
    [page.getByRole('button', { name: 'Generate clips', exact: true }), 43.9]
  ]) {
    const bounds = await locator.boundingBox()
    assert.ok(bounds && bounds.height >= minimumHeight, `Main creation controls keep their pointer target: ${JSON.stringify(bounds)}`)
  }
  if (viewport.width >= 900) {
    assert.ok(inspector.x >= source.x + source.width - 2, 'Desktop settings sit right of the source, as on the canvas')
    assert.ok(source.width >= inspector.width, 'The source uses the larger workspace column')
    assert.ok(Math.abs(inspector.y - source.y) < 12, 'The two desktop columns start together')
    assert.ok(action.x >= source.x && action.y + action.height <= inspector.y + inspector.height + 2, 'Generate stays inside the right settings column')
  } else {
    assert.ok(source.y + source.height <= inspector.y + 2, 'Mobile places source before settings')
    // Canvas Cr-M-Library: Generate closes the settings card, below every setting.
    assert.ok(action.y >= inspector.y && action.y + action.height <= inspector.y + inspector.height + 2, 'Mobile primary action sits at the end of the settings card')
    assert.ok(source.width <= viewport.width, 'Mobile source remains inside the viewport')
    const generate = page.getByRole('button', { name: 'Generate clips', exact: true })
    await generate.scrollIntoViewIfNeeded()
    const visibleAction = await generate.boundingBox()
    const dock = await page.locator('[data-mobile-dashboard-dock]').boundingBox()
    assert.ok(dock && visibleAction.y + visibleAction.height <= dock.y, 'The mobile Generate action scrolls clear of the fixed dock')
  }
  const ratio = page.getByRole('radiogroup', { name: 'Aspect ratio', exact: true }).getByRole('radio', { name: '9:16', exact: true })
  assert.equal(await ratio.getAttribute('aria-checked'), 'true', 'The default 9:16 aspect ratio is selected')
  const ring = await ratio.evaluate(node => getComputedStyle(node).boxShadow + getComputedStyle(node).borderColor)
  assert.doesNotMatch(ring, /rgb(37, 99, 235)|rgb(126, 176, 255)/, 'The selected tile never uses the blue accent')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Creation fits the viewport without horizontal scrolling')
}

async function changeQuery(page, query) {
  await page.evaluate((value) => {
    history.pushState({}, '', location.pathname + value)
    dispatchEvent(new PopStateEvent('popstate'))
  }, query)
}

try {
  for (const viewport of [{ width: 1487, height: 1058 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 600 })
    page.setDefaultTimeout(30000)
    const fixture = await installFixtures(page)
    try {
      await page.goto(origin + '/dashboard/create', { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.getByTestId('story-wizard').waitFor()
      await assertSinglePage(page)
      const uploadWorkspace = await page.getByTestId('creation-upload-workspace').elementHandle()
      const header = await page.locator('header').first().elementHandle()
      const desktopSidebar = page.locator('[data-slot="sidebar"]')
      const sidebar = viewport.width >= 600 ? await desktopSidebar.elementHandle() : null
      let sidebarState
      if (sidebar) {
        const before = await desktopSidebar.getAttribute('data-state')
        await page.locator('[data-sidebar="trigger"]').click()
        await page.waitForFunction((previous) => document.querySelector('[data-slot="sidebar"]')?.dataset.state !== previous, before)
        sidebarState = await desktopSidebar.getAttribute('data-state')
      }
      const uploadInput = page.getByLabel('Upload clips')
      assert.equal(await uploadInput.getAttribute('multiple'), '')
      assert.match(await uploadInput.getAttribute('accept'), /video/)
      await uploadInput.setInputFiles({ name: 'phone-video.mp4', mimeType: 'video/mp4', buffer: Buffer.from('synthetic phone footage') })
      await page.getByRole('progressbar', { name: 'Bytes transferred', exact: true }).waitFor()
      await chooseCreationSource(page, 'youtube')
      assert.equal(await uploadWorkspace.evaluate((node) => node.isConnected && node.hidden), true, 'Switching source retains the upload workspace')
      fixture.releaseUpload()
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="validated-source"]').length === 1)
      assert.equal(fixture.calls.uploads, 1, 'An in-flight upload is not restarted by source switching')
      assert.equal(fixture.calls.registrations, 1)
      const youtubeWorkspace = await page.getByTestId('creation-youtube-workspace').elementHandle()
      const generate = page.getByRole('button', { name: 'Generate clips', exact: true })
      assert.equal(await generate.isDisabled(), true)
      await clipRow(page).waitFor()
      assert.equal(await generate.isDisabled(), true, 'Generate waits for a chosen video')
      await clipRow(page).click()
      assert.equal(await generate.isDisabled(), true, 'Generate waits for the import consent')
      await consentBox(page).check()
      assert.equal(await generate.isEnabled(), true)
      await assertCreationGeometry(page, viewport)
      const clipPresets = page.getByRole('radiogroup', { name: 'Number of clips', exact: true })
      await clipPresets.getByRole('radio', { name: '5', exact: true }).click()
      const selectedClips = 5
      const checkedClipCount = async () => clipPresets.getByRole('radio', { checked: true }).textContent()
      await chooseCreationSource(page, 'upload')
      assert.equal(await youtubeWorkspace.evaluate((node) => node.isConnected && node.hidden), true)
      await page.getByTestId('story-wizard').getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByTestId('story-step-1').waitFor({ state: 'visible' })
      const brief = page.getByRole('textbox', { name: 'Describe the video you want', exact: true })
      await brief.fill('Retain this phone-video direction while I choose a source.')
      const briefNode = await brief.elementHandle()
      await chooseCreationSource(page, 'youtube')
      assert.equal(await clipRow(page).getAttribute('aria-checked'), 'true', 'The chosen video survives a source switch')
      assert.equal((await checkedClipCount()).trim(), String(selectedClips), 'The chosen clip count survives a source switch')
      await chooseCreationSource(page, 'upload')
      assert.equal((await brief.innerText()).trim(), 'Retain this phone-video direction while I choose a source.')
      assert.equal(await briefNode.evaluate((node) => node.isConnected), true)
      if (process.env.TEST_HMR_COMPONENT && viewport.width >= 600) {
        const sourcePath = resolve(process.env.TEST_HMR_COMPONENT)
        const before = await readFile(sourcePath, 'utf8')
        const marker = 'data-creation-refresh-proof="ready"'
        const changed = before.replace('className="creation-workspace ', `${marker} className="creation-workspace `)
        assert.notEqual(changed, before, 'Refresh proof locates the workspace component root')
        try {
          await writeFile(sourcePath, changed)
          await page.locator('[data-creation-refresh-proof="ready"]').waitFor()
          assert.equal(await briefNode.evaluate((node) => node.isConnected), true, 'Component Fast Refresh preserves the mounted draft')
          assert.equal((await brief.innerText()).trim(), 'Retain this phone-video direction while I choose a source.')
          assert.equal(await header.evaluate((node) => node === document.querySelector('header')), true, 'Component refresh retains the dashboard header')
        } finally {
          const current = await readFile(sourcePath, 'utf8')
          assert.equal(current, changed, 'Do not overwrite concurrent source changes while restoring the marker')
          await writeFile(sourcePath, before)
        }
        await page.locator('[data-creation-refresh-proof="ready"]').waitFor({ state: 'detached' })
        report.push({ componentFastRefreshPreservesDraft: true })
      }
      assert.equal(await header.evaluate((node) => node === document.querySelector('header')), true, 'Source changes retain the dashboard header')
      if (sidebar) {
        assert.equal(await sidebar.evaluate((node) => node === document.querySelector('[data-slot="sidebar"]')), true)
        assert.equal(await desktopSidebar.getAttribute('data-state'), sidebarState)
      }
      await assertSinglePage(page)
      await page.screenshot({ path: resolve(output, `upload-${viewport.width}.png`), fullPage: true, animations: 'disabled' })
      await chooseCreationSource(page, 'youtube')
      await page.screenshot({ path: resolve(output, `youtube-${viewport.width}.png`), fullPage: true, animations: 'disabled' })
      assert.equal(fixture.calls.jobs.length + fixture.calls.generations.length, 0, 'Changing sources or editing drafts never generates')
      const selection = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/youtube/imports/selection')
      await generate.click()
      await selection
      assert.equal(fixture.calls.selections.length, 1)
      assert.deepEqual(fixture.calls.selections[0].video_ids, [CHANNEL_VIDEOS[0].id])
      assert.equal(fixture.calls.selections[0].consent, true, 'The import is sent with the consent that was ticked')
      assert.equal(fixture.calls.selections[0].job.num_clips_requested, selectedClips, 'The preset clip count is sent')
      assert.equal('source_url' in fixture.calls.selections[0].job, false, 'The job options carry no link')
      assert.deepEqual(fixture.errors, [])
      report.push({ viewport, uploadRetained: true, draftRetained: true, singleYouTubeRequest: true, layoutIdentity: true })
    } catch (error) {
      await page.screenshot({ path: resolve(output, `failure-${viewport.width}.png`), fullPage: true, animations: 'disabled' })
      throw error
    } finally {
      fixture.releaseUpload()
      await page.close()
    }
  }

  // Linked-project precedence: a linked project wins over the YouTube query mode, and the query alone changes the source.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } })
    page.setDefaultTimeout(30000)
    const fixture = await installFixtures(page)
    fixture.releaseUpload()
    try {
      await page.goto(origin + '/dashboard/create', { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.getByTestId('story-wizard').waitFor()
      await page.getByLabel('Upload clips').setInputFiles({ name: 'query-fixture.mp4', mimeType: 'video/mp4', buffer: Buffer.from('synthetic source') })
      await page.getByTestId('validated-source').waitFor()
      const project = [...fixture.projects.values()][0]
      const other = structuredClone(project)
      other.id = '00000000-0000-4000-8000-000000000043'
      other.options.brief = 'Another linked project'
      other.assets[0].id = '00000000-0000-4000-8000-000000000044'
      other.assets[0].name = 'other-linked-project.mp4'
      fixture.projects.set(other.id, other)
      const header = await page.locator('header').first().elementHandle()
      await changeQuery(page, '?mode=youtube')
      await clipRow(page).waitFor({ state: 'visible' })
      await changeQuery(page, '?mode=upload')
      await page.getByTestId('validated-source').waitFor()
      await changeQuery(page, `?mode=youtube&story=${other.id}`)
      await page.getByTestId('validated-source').getByText('other-linked-project.mp4', { exact: true }).waitFor()
      assert.equal(await page.getByTestId('creation-youtube-workspace').isVisible(), false, 'A linked project takes precedence over the YouTube mode')
      assert.equal(await header.evaluate((node) => node === document.querySelector('header')), true, 'Query-only navigation preserves shared layout')
      await assertSinglePage(page)
      await changeQuery(page, '?mode=upload')
      await page.getByTestId('validated-source').getByText('other-linked-project.mp4', { exact: true }).waitFor()
      // Before a result the canvas shows no project header (no "New project" control), so linked projects are only changed by the query.
      assert.equal(await page.getByRole('button', { name: 'New project', exact: true }).count(), 0, 'No project header before the first result')
      await changeQuery(page, `?story=${project.id}`)
      await page.getByTestId('validated-source').getByText('query-fixture.mp4', { exact: true }).waitFor()
      await page.goto(origin + `/dashboard/create?story=${project.id}&mode=youtube`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('validated-source').getByText('query-fixture.mp4', { exact: true }).waitFor()
      assert.equal(await page.getByTestId('creation-youtube-workspace').isVisible(), false)
      assert.deepEqual(fixture.errors, [])
      report.push({ queryChanges: true, linkedProjectPrecedence: true })
    } finally { await page.close() }
  }

  const romanian = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const roFixture = await installFixtures(romanian)
  roFixture.releaseUpload()
  try {
    await romanian.goto(origin + '/ro/dashboard/create', { waitUntil: 'domcontentloaded', timeout: 180000 })
    await romanian.getByTestId('story-wizard').waitFor()
    await assertSinglePage(romanian, 'ro')
    await chooseCreationSource(romanian, 'youtube', 'ro')
    await clipRow(romanian).click()
    await assertSinglePage(romanian, 'ro')
    await chooseCreationSource(romanian, 'upload', 'ro')
    assert.deepEqual(roFixture.errors, [])
    report.push({ romanianMobileSources: true })
  } finally { await romanian.close() }

  for (const account of [
    { credits: 5, label: 'low', blocked: true },
    { credits: 0, access_role: 'admin', label: 'unlimited', blocked: false },
    { creditsUnavailable: true, label: 'credits-unavailable', blocked: false }
  ]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
    const fixture = await installFixtures(page, account)
    fixture.releaseUpload()
    try {
      await page.goto(origin + '/dashboard/create?mode=youtube', { waitUntil: 'domcontentloaded' })
      await clipRow(page).click()
      const generate = page.getByRole('button', { name: 'Generate clips', exact: true })
      if (account.blocked) {
        await page.getByRole('link', { name: 'View plans', exact: true }).waitFor()
        assert.equal(await generate.count(), 0, 'Known insufficient credits replace Generate with the limit state')
        assert.equal(await clipRow(page).getAttribute('aria-checked'), 'true', 'A credit error retains the source')
      } else {
        await consentBox(page).check()
        await generate.waitFor({ state: 'visible' })
        await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(node => node.textContent.trim() === 'Generate clips')?.disabled)
        const selection = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/youtube/imports/selection')
        await generate.click()
        await selection
        assert.equal(fixture.calls.selections.length, 1, 'An unlimited account or unavailable credits query does not block a valid request')
      }
      assert.deepEqual(fixture.errors, [])
      report.push({ creditState: account.label, blocked: account.blocked, draftRetained: true })
    } finally { await page.close() }
  }


  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log('PASS: ' + JSON.stringify(report))
} finally {
  await browser.close()
}
