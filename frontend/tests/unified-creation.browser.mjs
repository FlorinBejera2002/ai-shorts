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
const firstURL = 'https://www.youtube.com/watch?v=abcdefghijk'
const secondURL = 'https://youtu.be/lmnopqrstuv'
const user = { id: '00000000-0000-4000-8000-000000000041', email: 'unified-creation@example.invalid', name: 'Synthetic creator', credits: 1000, plan: 'free', access_role: 'member' }
const limits = { max_file_bytes: 2 * 1024 ** 3, max_total_bytes: 10 * 1024 ** 3, max_source_seconds: 900, max_total_seconds: 3600 }
const report = []

async function installFixtures(page) {
  const errors = []
  const projects = new Map()
  const calls = { uploads: 0, registrations: 0, jobs: [], batches: [], generations: [] }
  let releaseUpload
  const uploadGate = new Promise((resolve) => { releaseUpload = resolve })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('https://www.youtube.com/oembed**', (route) => route.fulfill({ json: { title: 'Synthetic YouTube title', author_name: 'Fixture author' } }))
  await page.route('https://img.youtube.com/**', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270"><rect width="480" height="270" fill="#e5e7eb"/><path d="M225 100v70l60-35z" fill="#6b7280"/></svg>'
  }))
  await page.route('**/original/**', (route) => route.fulfill({ status: 204 }))
  await page.route('**/v1/**', (route) => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const reply = (json, status = 200) => route.fulfill({ json, status })
    if (path === '/api/user/credits') return reply({ credits: 1000 })
    if (path === '/api/user/brand') return reply({ brandKit: null })
    if (path === '/api/media-capabilities') return reply({ audio_cleanup: { available: true } })
    if (path === '/api/workspace-agent/runs') return reply({ runs: [], has_more: false })
    if (path === '/api/workspace-agent/suggestions') return reply({ suggestions: [], capabilities: [] })
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
    if (path === '/api/jobs/batch' && method === 'POST') {
      calls.batches.push(request.postDataJSON())
      return reply({ jobs: [{ id: 'synthetic-batch-one' }, { id: 'synthetic-batch-two' }] })
    }
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
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal page overflow')
  const duplicateIDs = await page.locator('[id]').evaluateAll((nodes) => {
    const seen = new Set()
    return nodes.map((node) => node.id).filter((id) => seen.has(id) || !seen.add(id))
  })
  assert.deepEqual(duplicateIDs, [], 'Both mounted workspaces have unique DOM IDs')
}

async function changeQuery(page, query) {
  await page.evaluate((value) => {
    history.pushState({}, '', location.pathname + value)
    dispatchEvent(new PopStateEvent('popstate'))
  }, query)
}

try {
  for (const viewport of [{ width: 1280, height: 960 }, { width: 390, height: 844 }]) {
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
      const uploadInput = page.getByLabel('Upload story clips')
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
      const generate = page.getByRole('button', { name: 'Generate', exact: true })
      assert.equal(await generate.isDisabled(), true)
      await page.locator('#youtube-url').fill('this is not a video URL')
      assert.equal(await page.locator('#youtube-url').getAttribute('aria-invalid'), 'true')
      assert.equal(await generate.isDisabled(), true)
      await page.locator('#youtube-url').fill(firstURL)
      await page.getByTestId('youtube-preview').waitFor()
      assert.equal(await generate.isEnabled(), true)
      const clips = page.getByRole('slider', { name: 'Clips per video', exact: true })
      await clips.focus()
      await clips.press('ArrowRight')
      const selectedClips = Number(await clips.getAttribute('aria-valuenow'))
      await chooseCreationSource(page, 'upload')
      assert.equal(await youtubeWorkspace.evaluate((node) => node.isConnected && node.hidden), true)
      await page.getByTestId('story-wizard').getByRole('button', { name: 'Continue', exact: true }).click()
      await page.getByTestId('story-step-1').waitFor({ state: 'visible' })
      const brief = page.getByRole('textbox', { name: 'Describe your video (optional)', exact: true })
      await brief.fill('Retain this phone-video direction while I choose a source.')
      const briefNode = await brief.elementHandle()
      await chooseCreationSource(page, 'youtube')
      assert.equal(await page.locator('#youtube-url').inputValue(), firstURL)
      assert.equal(Number(await clips.getAttribute('aria-valuenow')), selectedClips)
      await chooseCreationSource(page, 'upload')
      assert.equal(await brief.inputValue(), 'Retain this phone-video direction while I choose a source.')
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
          assert.equal(await brief.inputValue(), 'Retain this phone-video direction while I choose a source.')
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
      assert.equal(fixture.calls.jobs.length + fixture.calls.batches.length + fixture.calls.generations.length, 0, 'Changing sources or editing drafts never generates')
      await generate.click()
      await page.waitForURL('**/dashboard/jobs/*')
      assert.equal(fixture.calls.jobs.length, 1)
      assert.equal(fixture.calls.jobs[0].source_type, 'youtube')
      assert.equal(fixture.calls.jobs[0].source_url, firstURL)
      assert.equal(fixture.calls.jobs[0].num_clips_requested, selectedClips)
      assert.equal('source_file_path' in fixture.calls.jobs[0], false)
      assert.deepEqual(fixture.errors, [])
      report.push({ viewport, uploadRetained: true, draftRetained: true, singleYouTubeRequest: true, layoutIdentity: true })
    } finally {
      fixture.releaseUpload()
      await page.close()
    }
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } })
  page.setDefaultTimeout(30000)
  const fixture = await installFixtures(page)
  fixture.releaseUpload()
  try {
    await page.goto(origin + '/dashboard/create?mode=batch', { waitUntil: 'domcontentloaded', timeout: 180000 })
    await page.getByRole('textbox', { name: 'YouTube URL 2', exact: true }).waitFor()
    await assertSinglePage(page)
    const first = page.getByRole('textbox', { name: 'YouTube URL 1', exact: true })
    await first.fill(firstURL)
    await page.getByRole('textbox', { name: 'YouTube URL 2', exact: true }).fill('invalid')
    await page.getByRole('button', { name: 'Add URL', exact: true }).click()
    await page.getByRole('textbox', { name: 'YouTube URL 3', exact: true }).fill('https://youtu.be/abcdefghijk')
    assert.equal(await page.getByRole('textbox', { name: 'YouTube URL 3', exact: true }).getAttribute('aria-invalid'), 'true', 'Duplicate video IDs are identified')
    await page.getByRole('button', { name: 'Add URL', exact: true }).click()
    await page.getByRole('textbox', { name: 'YouTube URL 4', exact: true }).fill(secondURL)
    await page.getByRole('button', { name: 'Process 2 videos', exact: true }).click()
    await page.waitForURL('**/dashboard/clips')
    assert.equal(fixture.calls.batches.length, 1)
    assert.deepEqual(fixture.calls.batches[0].source_urls, [firstURL, secondURL], 'Batch sends only unique valid YouTube URLs')

    await page.goto(origin + '/dashboard/create?mode=upload', { waitUntil: 'domcontentloaded' })
    await page.getByTestId('story-wizard').waitFor()
    await page.getByLabel('Upload story clips').setInputFiles({ name: 'query-fixture.mp4', mimeType: 'video/mp4', buffer: Buffer.from('synthetic source') })
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
    await page.locator('#youtube-url').waitFor({ state: 'visible' })
    await changeQuery(page, '?mode=batch')
    await page.getByRole('textbox', { name: 'YouTube URL 1', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Add URL', exact: true }).click()
    await page.getByRole('textbox', { name: 'YouTube URL 2', exact: true }).waitFor()
    await changeQuery(page, '?mode=upload')
    await page.getByTestId('validated-source').waitFor()
    await changeQuery(page, `?mode=batch&story=${other.id}`)
    await page.getByTestId('validated-source').getByText('other-linked-project.mp4', { exact: true }).waitFor()
    assert.equal(await page.getByTestId('creation-youtube-workspace').isVisible(), false, 'A linked project takes precedence over legacy mode')
    assert.equal(await header.evaluate((node) => node === document.querySelector('header')), true, 'Query-only navigation preserves shared layout')
    await assertSinglePage(page)
    await changeQuery(page, '?mode=upload')
    await page.getByTestId('validated-source').getByText('other-linked-project.mp4', { exact: true }).waitFor()
    await changeQuery(page, `?story=${other.id}`)
    await page.getByRole('button', { name: 'New story', exact: true }).click()
    await page.getByTestId('validated-source').waitFor({ state: 'detached' })
    assert.equal(await page.getByLabel('Open story project', { exact: true }).inputValue(), '', 'New story is not overridden by an unchanged linked project query')
    await changeQuery(page, `?story=${project.id}`)
    await page.getByTestId('validated-source').getByText('query-fixture.mp4', { exact: true }).waitFor()
    await page.goto(origin + `/dashboard/create?story=${project.id}&mode=youtube`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('validated-source').getByText('query-fixture.mp4', { exact: true }).waitFor()
    assert.equal(await page.getByTestId('creation-youtube-workspace').isVisible(), false)
    assert.deepEqual(fixture.errors, [])
    report.push({ batchDeduplication: true, queryChanges: true, linkedProjectPrecedence: true })
  } finally { await page.close() }

  const romanian = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  const roFixture = await installFixtures(romanian)
  roFixture.releaseUpload()
  try {
    await romanian.goto(origin + '/ro/dashboard/create', { waitUntil: 'domcontentloaded', timeout: 180000 })
    await romanian.getByTestId('story-wizard').waitFor()
    await assertSinglePage(romanian, 'ro')
    await chooseCreationSource(romanian, 'youtube', 'ro')
    await romanian.locator('#youtube-url').fill(firstURL)
    await romanian.getByTestId('youtube-preview').waitFor()
    await assertSinglePage(romanian, 'ro')
    await chooseCreationSource(romanian, 'upload', 'ro')
    assert.deepEqual(roFixture.errors, [])
    report.push({ romanianMobileSources: true })
  } finally { await romanian.close() }

  console.log('PASS: ' + JSON.stringify(report))
} finally {
  await browser.close()
}
