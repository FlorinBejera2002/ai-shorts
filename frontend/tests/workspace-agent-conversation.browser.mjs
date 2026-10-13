// Every API request uses synthetic fixtures; this runner never mutates user data.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

if (!process.env.PLAYWRIGHT_MODULE) throw Error('Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(20000)
const errors = [], runs = [], sends = [], controls = [], resources = []
page.on('pageerror', error => errors.push(error.message))
const projectId = '00000000-0000-4000-8000-000000000042'
const clipId = '00000000-0000-4000-8000-000000000043'
const studioId = '00000000-0000-4000-8000-000000000044'
const sourceProjectId = '00000000-0000-4000-8000-000000000045'
const project = { id: projectId, status: 'draft', options: { brief: 'Synthetic story', target_seconds: 45, aspect_ratio: '9:16', language: 'auto', mode: 'smart', preserve_order: true, captions: false }, assets: [], versions: [], current_version: 0, limits: { max_files: 20, max_file_bytes: 10000000, max_total_bytes: 100000000, max_source_seconds: 900, max_total_seconds: 3600 } }
let registrations = 0, studioUploads = 0, failOnce = true, disconnectHistory = false
let preferences = { follow: false, recommendations: true }
const suggestion = { id: 'suggestion-1', title: 'Create a story', description: 'Create a draft without spending credits.', action: { name: 'stories.create', input: {} }, context: { route: '/dashboard/create' }, missing_resources: [], cost_credits: 0 }
const revisions = []
await mkdir('test-results', { recursive: true })
await page.route('**/v1/**', route => route.fulfill({ json: { access_token: 'synthetic-token', user: { id: '00000000-0000-4000-8000-000000000001', email: 'agent@example.invalid', name: 'Test', credits: 100, plan: 'free', access_role: 'member' } } }))
const cors = request => ({ 'access-control-allow-origin': request.headers().origin || new URL(process.env.TEST_ORIGIN || 'http://127.0.0.1:3001').origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-allow-methods': 'POST, GET, OPTIONS' })
await page.route('**/sneepcut/session', route => route.fulfill({ json: {}, headers: cors(route.request()) }))
await page.route('**/api/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname
  const respond = json => route.fulfill({ json, headers: cors(request) })
  if (path === '/api/dashboard') return respond({ metrics: { credits: 100, plan: 'free', jobCount: 0, clipCount: 0, durationMinutes: 0, activity: [], statuses: {} }, recentClips: [] })
  if (path === '/api/workspace-agent/preferences') {
    if (request.method() === 'POST') { const body = request.postDataJSON(); preferences = body.reset ? { follow: false, recommendations: true } : { ...preferences, ...body } }
    return respond(preferences)
  }
  if (path === '/api/workspace-agent/history/clear') {
    const cleared_ids = runs.filter(run => ['completed', 'failed', 'cancelled'].includes(run.status)).map(run => run.id)
    for (let index = runs.length - 1; index >= 0; index--) if (cleared_ids.includes(runs[index].id)) runs.splice(index, 1)
    return respond({ cleared_ids })
  }
  if (path.endsWith('/suggestions/suggestion-1/revise')) {
    revisions.push(request.postDataJSON().instruction)
    return respond({ ...suggestion, id: 'suggestion-revised', title: 'Revised story draft' })
  }
  if (path === '/api/test-media/video.mp4') return route.fulfill({ contentType: 'video/mp4', body: await readFile(new URL('../../editor/packages/studio/tests/e2e/fixtures/design-panel-qa/assets/test.mp4', import.meta.url)) })
  if (path === `/api/clips/${clipId}`) return respond({ id: clipId, file_url: '/api/test-media/video.mp4', transcript_text: 'Synthetic transcript' })
  if (path === '/api/workspace-agent/resources') {
    const body = request.postDataJSON(), resource = { id: `resource-${resources.length}`, kind: body.kind, name: body.name, project_id: body.project_id }
    resources.push(resource); return respond(resource)
  }
  if (path === '/api/upload/authorize') return respond({ uploadUrl: '/api/upload', token: null })
  if (path === '/api/upload') return respond({ file_path: 'synthetic-source' })
  if (path === '/api/brand/logo' && request.method() === 'POST') return respond({ logo_path: 'synthetic-logo.png' })
  if (path === `/api/stories/${projectId}/assets`) {
    registrations++; const body = request.postDataJSON()
    project.assets.push({ id: body.id, name: body.name, size: 16, duration: 2, order: body.order, role: 'auto', include: 'auto', candidates: [] })
    return respond(project)
  }
  if (path === `/api/stories/${projectId}`) return respond(project)
  if (path === '/api/stories') return respond({ stories: [project], limits: project.limits })
  if (path === '/api/projects') return respond([])
  if (path === `/api/projects/${studioId}/upload`) { studioUploads++; return respond({ files: ['assets/studio-recording.mp4'] }) }
  if (path.endsWith('/workspace-agent/suggestions')) return respond({ suggestions: [suggestion], capabilities: [] })
  if (path.endsWith('/workspace-agent/runs') && request.method() === 'GET') return disconnectHistory ? route.abort('connectionfailed') : respond({ runs, has_more: false })
  if (path.endsWith('/workspace-agent/runs') && request.method() === 'POST') {
    const body = request.postDataJSON(); sends.push(body)
    assert.ok((body.resource_ids || []).every(id => { const resource = resources.find(item => item.id === id); return resource && (!resource.project_id || resource.project_id === body.context.project_id) }), 'New requests must not attach files from another project')
    const existing = runs.find(run => run.request_id === body.request_id)
    if (existing) return respond(existing)
    const run = { id: body.request_id, request_id: body.request_id, message: body.message, reply: body.context.locale === 'ro' ? 'Am încărcat proiectele tale.' : 'The change is saved.', context: body.context, status: 'completed', revision: 1, cost_credits: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    if (body.message === 'Rename the project') {
      run.action = { name: 'projects.rename', input: { id: projectId, name: 'Renamed story' } }
      run.result = { summary: 'Project renamed.', data: { name: 'Renamed story' } }
      runs.push(run)
      if (failOnce) { failOnce = false; return route.abort('connectionfailed') }
      return respond(run)
    }
    if (body.message === 'Change the project logo' || body.message === 'Add recordings') {
      const logo = body.message.includes('logo')
      run.status = 'waiting_for_resources'; run.reply = logo ? 'Attach the new logo.' : 'Attach the recordings.'
      if (logo) run.context = { ...body.context, route: `/dashboard/jobs/${sourceProjectId}`, project_id: sourceProjectId }
      run.missing_resources = [{ kind: logo ? 'logo' : 'videos', label: logo ? 'New logo' : 'Recordings', target_id: logo ? sourceProjectId : projectId }]
    }
    if (body.message === 'Trim and export the clip') {
      run.status = 'running'; run.reply = 'Preparing the clip.'
      run.action = { name: 'clips.trim', input: { id: clipId, edit: { start_time: 0, end_time: 2 } } }
      run.steps = [{ action: { name: 'clips.get', input: { id: clipId } }, result: { summary: 'Inspected the saved clip.', data: { id: clipId, title: 'Synthetic clip' } } }]
      run.result = { pending: true, summary: 'Rendering the trim.' }
    }
    if (body.message === 'Add a video to Studio') {
      run.status = 'waiting_for_resources'; run.reply = 'Attach the new Studio video.'
      run.context = { ...body.context, route: '/dashboard/studio', project_id: studioId }
      run.missing_resources = [{ kind: 'studio_asset', label: 'Studio video', target_id: studioId }]
    }
    if (body.message === 'Publish the clip') {
      run.status = 'waiting_for_confirmation'; run.reply = 'Confirm publication to the connected account.'
      run.action = { name: 'publishing.publish', input: { id: clipId, fields: {} } }
      run.approval_preview = { action: 'publishing.publish', title: 'Synthetic launch', caption: 'Synthetic caption', destinations: [{ provider: 'youtube', name: 'Synthetic account' }], youtube: { termsAccepted: true } }
    }
    runs.push(run); return respond(run)
  }
  if (path.endsWith('/control')) {
    const body = request.postDataJSON(); controls.push(body)
    const run = runs.find(run => path.includes(run.id))
    assert.ok((body.resource_ids || []).every(id => { const resource = resources.find(item => item.id === id); return resource && (!resource.project_id || resource.project_id === run.context.project_id) }), 'Resume must use only files belonging to its own target')
    run.status = body.command === 'stop' ? 'cancelled' : body.command === 'pause' ? 'paused' : 'completed'; run.revision++
    run.missing_resources = []; run.reply = body.command === 'approve' ? 'Publication queued.' : 'The change is saved.'
    run.result = { summary: 'Confirmed by the service.', route: '/dashboard/brand' }
    return respond(run)
  }
  if (path.includes('/workspace-agent/runs/')) return respond(runs.find(run => path.endsWith(run.id)))
  return respond({ projects: [], clips: [], jobs: [], stories: [], items: [], total: 0 })
})
const panel = page.locator('#workspace-agent-panel')
const draft = panel.getByRole('textbox', { name: 'What would you like to create or change?' })
async function send(message) {
  await draft.fill(message); await panel.getByRole('button', { name: 'Send', exact: true }).click()
  await panel.getByText(message, { exact: true }).waitFor()
}
async function menu(name) {
  await panel.getByRole('button', { name: 'Conversation options' }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}
let originalSource
const refreshSource = new URL('../src/components/workspace-agent/workspace-agent.tsx', import.meta.url)
try {
  await page.goto(`${process.env.TEST_ORIGIN || 'http://127.0.0.1:3001'}/dashboard/create?story=${projectId}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.getByRole('button', { name: 'Open Workspace Agent' }).click()
  await draft.waitFor()
  assert.equal(await panel.getByRole('checkbox').count(), 0)
  assert.equal(await panel.locator('input[type="file"]').count(), 0)
  assert.doesNotMatch(await panel.innerText(), /\/dashboard|00000000|Dictation uses|Suggested next steps|Preferences and history/)
  await page.screenshot({ path: 'test-results/workspace-agent-desktop-empty.png' })
  await draft.fill('Keep this draft')
  await page.locator('[data-sidebar="trigger"]').first().click()
  await page.evaluate(() => { window.agentNodes = [document.getElementById('dashboard-shell'), document.querySelector('.studio-topbar'), document.querySelector('[data-sidebar="sidebar"]'), document.querySelector('#workspace-agent-panel textarea')] })
  await page.locator('a[href="/dashboard/brand"]').first().click()
  assert.equal(await draft.inputValue(), 'Keep this draft')
  assert.equal(await page.evaluate(() => window.agentNodes.every(node => node?.isConnected) && window.agentNodes[3] === document.querySelector('#workspace-agent-panel textarea')), true)
  assert.equal(await page.locator('[data-slot="sidebar"]').getAttribute('data-state'), 'collapsed')
  await draft.fill('Rename the project'); await panel.getByRole('button', { name: 'Send', exact: true }).click()
  await panel.getByRole('button', { name: 'Retry request' }).waitFor()
  await draft.fill('New draft survives retry')
  assert.equal(await panel.getByRole('button', { name: 'Send', exact: true }).isDisabled(), true)
  await panel.getByRole('button', { name: 'Retry request' }).click()
  await panel.getByText('The change is saved.', { exact: true }).waitFor()
  assert.equal(sends[0].request_id, sends[1].request_id); assert.equal(runs.length, 1)
  assert.equal(await draft.inputValue(), 'New draft survives retry'); assert.equal(controls.length, 0)
  await send('Change the project logo')
  await panel.getByLabel('Attach logo or document').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') })
  await panel.getByText('logo.png', { exact: true }).waitFor()
  assert.equal(resources[0].kind, 'logo')
  assert.equal(resources[0].project_id, sourceProjectId, 'Use the verified waiting target rather than an unrelated selected story')
  await menu('Attach files')
  await panel.getByLabel('Attach logo or document').setInputFiles({ name: 'conversation-brief.md', mimeType: 'text/markdown', buffer: Buffer.from('Synthetic reusable brief') })
  await panel.getByText('conversation-brief.md', { exact: true }).waitFor()
  assert.equal(resources[1].project_id, undefined, 'Manual conversation attachments must not inherit a stale project target')
  await panel.getByRole('button', { name: 'Close options' }).click()
  await send('Add recordings')
  await panel.locator('#agent-recordings').setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid') })
  await panel.getByText('Check file format, size and count.').waitFor(); assert.equal(registrations, 0)
  await panel.locator('#agent-recordings').setInputFiles({ name: 'recording.mp4', mimeType: 'video/mp4', buffer: Buffer.from('synthetic video') })
  await panel.getByText(/recording.mp4.*Validated/).waitFor(); assert.equal(registrations, 1)
  await send('Trim and export the clip')
  const active = panel.locator('[data-agent-run]').last()
  await active.locator('.agent-shimmer').waitFor()
  assert.equal(await active.getByText('Inspected the saved clip.', { exact: true }).isVisible(), false)
  await active.locator('[data-agent-operation] button').click()
  await active.getByText('Inspected the saved clip.', { exact: true }).waitFor()
  await page.screenshot({ path: 'test-results/workspace-agent-active.png' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => [...document.querySelectorAll('[data-agent-operation="running"] .agent-shimmer')].every(element => getComputedStyle(element).animationName === 'none'))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await active.locator('.agent-shimmer').waitFor()
  disconnectHistory = true
  await panel.getByText('Connection interrupted. Refresh the status before continuing.').waitFor({ timeout: 40000 })
  assert.equal(await active.locator('.agent-shimmer').count(), 0, 'No stale animation after connection failure')
  disconnectHistory = false
  await panel.getByRole('button', { name: 'Retry request' }).click()
  await active.locator('.agent-shimmer').waitFor()
  const conversation = panel.locator('[data-agent-conversation]')
  await conversation.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')) })
  await panel.getByRole('button', { name: 'Latest messages' }).waitFor()
  const running = runs.at(-1)
  running.status = 'completed'; running.revision++; running.reply = 'The trimmed clip is ready.'
  running.result = { summary: 'Trim saved and export verified.', data: { clip_id: clipId, clip: { duration: 2 } }, route: `/dashboard/clips/${clipId}/edit` }
  await active.getByText('The trimmed clip is ready.').waitFor()
  assert.ok(await conversation.evaluate(element => element.scrollTop < 10), 'Incoming output must not pull the reader away from older messages')
  assert.equal(await active.locator('.agent-shimmer').count(), 0)
  await panel.getByRole('button', { name: 'Latest messages' }).click()
  await page.waitForFunction(() => { const element = document.querySelector('[data-agent-conversation]'); return element.scrollHeight - element.scrollTop - element.clientHeight < 65 })
  await active.getByRole('button', { name: 'Load preview' }).click()
  await page.waitForFunction(() => document.querySelector('#workspace-agent-panel video')?.readyState >= 1)
  assert.equal(await active.locator('video').getAttribute('autoplay'), null)
  assert.ok(page.url().includes('/dashboard/brand'))
  await send('Publish the clip')
  await panel.getByRole('button', { name: 'Approve action' }).waitFor()
  assert.equal(controls.some(control => control.command === 'approve'), false)
  await panel.getByRole('button', { name: 'Approve action' }).click()
  await panel.getByText('Publication queued.', { exact: true }).waitFor(); assert.equal(controls.at(-1).revision, 1)
  const beforeStudio = controls.length
  await send('Add a video to Studio')
  assert.ok(page.url().includes('/dashboard/brand'), 'Contextual Studio upload must work without forcing navigation')
  await panel.getByLabel('Attach Studio media').setInputFiles({ name: 'studio-recording.mp4', mimeType: 'video/mp4', buffer: Buffer.from('synthetic studio video') })
  await page.waitForFunction(() => !document.querySelector('[data-agent-context-panel="studio"]'))
  assert.equal(studioUploads, 1)
  assert.equal(controls.length, beforeStudio + 1)
  assert.equal(controls.at(-1).command, 'resume')
  await menu('Suggested next steps')
  const beforeExplain = sends.length
  await panel.getByText('Explain', { exact: true }).click()
  assert.equal(sends.length, beforeExplain)
  await panel.getByRole('button', { name: 'Edit', exact: true }).click()
  await panel.getByLabel('What would you change?').fill('Make this a shorter story')
  await panel.getByRole('button', { name: 'Revise suggestion', exact: true }).click()
  await panel.getByText('Revised story draft', { exact: true }).waitFor()
  assert.deepEqual(revisions, ['Make this a shorter story'])
  await panel.getByRole('button', { name: 'Do it', exact: true }).click()
  await panel.getByText('Revised story draft', { exact: true }).waitFor()
  assert.equal(sends.at(-1).suggestion_id, 'suggestion-revised')
  assert.equal(sends.at(-1).action, undefined)
  if (process.env.TEST_FAST_REFRESH === '1') {
    originalSource = await readFile(refreshSource, 'utf8')
    assert.ok(originalSource.includes('id="workspace-agent-panel"'))
    await draft.fill('Draft across Fast Refresh')
    await writeFile(refreshSource, originalSource.replaceAll('id="workspace-agent-panel"', 'id="workspace-agent-panel" data-refresh-probe="agent-check"'))
    await page.locator('#workspace-agent-panel[data-refresh-probe="agent-check"]').waitFor({ timeout: 60000 })
    assert.equal(await draft.inputValue(), 'Draft across Fast Refresh')
    assert.equal(await page.evaluate(() => window.agentNodes.slice(0, 3).every(node => node?.isConnected)), true)
    await writeFile(refreshSource, originalSource); originalSource = undefined
    await page.waitForFunction(() => !document.getElementById('workspace-agent-panel')?.hasAttribute('data-refresh-probe'), undefined, { timeout: 60000 })
  }
  await menu('Preferences and history')
  await panel.getByLabel('Follow AI navigation').click()
  await page.waitForFunction(() => document.querySelector('#workspace-agent-panel input[type="checkbox"]')?.checked)
  assert.equal(preferences.follow, true)
  await draft.fill('Draft across responsive layout')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('dialog').waitFor()
  assert.equal(await draft.inputValue(), 'Draft across responsive layout')
  await send('Check responsive layout')
  await page.waitForFunction(() => { const element = document.querySelector('[data-agent-conversation]'); return element.scrollHeight - element.scrollTop - element.clientHeight < 65 })
  await panel.getByRole('button', { name: 'Collapse agent' }).click()
  const opener = page.getByRole('button', { name: 'Open Workspace Agent' })
  await opener.click(); await page.getByRole('dialog').waitFor(); await draft.fill('Mobile draft')
  await page.screenshot({ path: 'test-results/workspace-agent-mobile.png' })
  await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await opener.evaluate(element => element === document.activeElement), true)
  await opener.click(); assert.equal(await draft.inputValue(), 'Mobile draft')
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.screenshot({ path: 'test-results/workspace-agent-mobile-dark.png' })
  assert.equal(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), true)
  assert.equal(await panel.locator('.agent-shimmer').evaluateAll(elements => elements.every(element => getComputedStyle(element).animationName === 'none')), true)
  await draft.focus()
  for (const name of ['Start dictation', 'Conversation options', 'Send']) {
    const button = panel.getByRole('button', { name, exact: true })
    if (await button.isDisabled()) continue
    await page.keyboard.press('Tab')
    assert.equal(await button.evaluate(element => element === document.activeElement), true)
  }
  await menu('Preferences and history')
  await panel.getByRole('button', { name: 'Reset preferences' }).click()
  await page.waitForFunction(() => !document.querySelector('#workspace-agent-panel input[type="checkbox"]')?.checked)
  assert.deepEqual(preferences, { follow: false, recommendations: true })
  const beforeClear = runs.length
  await panel.getByRole('button', { name: 'Clear finished history' }).click()
  assert.equal(runs.length, beforeClear, 'History requires its contextual confirmation')
  await panel.getByRole('button', { name: 'Clear history', exact: true }).click()
  await panel.locator('[data-agent-run]').waitFor({ state: 'detached' })
  assert.equal(runs.length, 0)
  await page.goto(`${process.env.TEST_ORIGIN || 'http://127.0.0.1:3001'}/ro/dashboard`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.getByRole('button', { name: 'Deschide Workspace Agent' }).click()
  await panel.getByRole('textbox').fill('Arată proiectele mele')
  await panel.getByRole('button', { name: 'Trimite', exact: true }).click()
  await panel.getByText('Am încărcat proiectele tale.', { exact: true }).waitFor()
  assert.equal(sends.at(-1).context.locale, 'ro')
  assert.deepEqual(errors, [])
  console.log(`PASS: compact initial state, contextual uploads, committed-response retry, multistep results, preview, approval, reconnect, bottom-follow scroll, stable shell/sidebar/draft, mobile/focus, dark/reduced motion. Fast Refresh: ${process.env.TEST_FAST_REFRESH === '1' ? 'passed' : 'not requested'}.`)
} catch (error) {
  console.error('Browser failure:', error, 'Browser errors:', errors)
  await page.screenshot({ path: 'test-results/workspace-agent-failure.png', fullPage: true, timeout: 5000 }).catch(() => {})
  if (await panel.count()) console.error('Panel:', await panel.innerText({ timeout: 2000 }).catch(() => 'unavailable'))
  throw error
} finally {
  if (originalSource) await writeFile(refreshSource, originalSource)
  await browser.close()
}
