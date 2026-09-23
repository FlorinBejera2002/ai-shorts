import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { mkdir, readFile } from 'node:fs/promises'

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(60000)
page.on('pageerror', error => console.error('Browser error:', error.message))
const runs = []
const sends = []
const controls = []
let preferences = { follow: false, recommendations: true }
const projectId = '00000000-0000-4000-8000-000000000042'
const createdProjectId = '00000000-0000-4000-8000-000000000043'
const project = { id: projectId, status: 'draft', options: {}, assets: [], versions: [], limits: { max_files: 20, max_file_bytes: 10000000, max_total_bytes: 100000000, max_source_seconds: 900, max_total_seconds: 3600 } }
let registrations = 0
const resources = []
let revisedInstructions = []
await mkdir('test-results', { recursive: true })
let failOnce = true
const suggestion = { id: 'suggestion-1', title: 'Create a story', description: 'Create a draft without spending credits.', action: { name: 'stories.create', input: {} }, context: { route: '/dashboard/create' }, missing_resources: [], cost_credits: 0 }
await page.route('**/v1/**', route => route.fulfill({ json: { access_token: 'synthetic-token', user: { id: '00000000-0000-4000-8000-000000000001', email: 'agent@example.invalid', name: 'Test', credits: 100, plan: 'free', access_role: 'member' } } }))
await page.route('**/api/**', async route => {
  const request = route.request(); const path = new URL(request.url()).pathname
  if (path === '/api/workspace-agent/preferences') {
    if (request.method() === 'POST') { const body = request.postDataJSON(); preferences = body.reset ? { follow: false, recommendations: true } : { ...preferences, ...body } }
    return route.fulfill({ json: preferences })
  }
  if (path === '/api/workspace-agent/history/clear') {
    const cleared_ids = runs.filter(run => ['completed', 'failed', 'cancelled'].includes(run.status)).map(run => run.id)
    for (let index = runs.length - 1; index >= 0; index--) if (cleared_ids.includes(runs[index].id)) runs.splice(index, 1)
    return route.fulfill({ json: { cleared_ids } })
  }
  if (path === '/api/test-media/video.mp4') return route.fulfill({ contentType: 'video/mp4', body: await readFile(new URL('../../editor/packages/studio/tests/e2e/fixtures/design-panel-qa/assets/test.mp4', import.meta.url)) })
  if (path === `/api/clips/${createdProjectId}`) return route.fulfill({ json: { id: createdProjectId, file_url: '/api/test-media/video.mp4', transcript_text: 'Synthetic fixture transcript' } })
  if (path === '/api/workspace-agent/resources') { const body = request.postDataJSON(); const resource = { id: `resource-${resources.length}`, kind: body.kind, name: body.name, project_id: body.project_id }; resources.push(resource); return route.fulfill({ json: resource }) }
  if (path.endsWith('/suggestions/suggestion-1/revise')) { revisedInstructions.push(request.postDataJSON().instruction); return route.fulfill({ json: { ...suggestion, id: 'suggestion-revised', title: 'Revised story draft' } }) }
  if (path === '/api/upload/authorize') return route.fulfill({ json: { uploadUrl: '/api/upload', token: null } })
  if (path === '/api/upload') return route.fulfill({ json: { file_path: 'synthetic-source' } })
  if (path === `/api/stories/${projectId}/assets`) {
    registrations++
    const body = request.postDataJSON()
    project.assets.push({ id: body.id, name: body.name, size: 16, duration: 2, order: body.order })
    return route.fulfill({ json: project })
  }
  if (path === `/api/stories/${projectId}`) return route.fulfill({ json: project })
  if (path === `/api/stories/${createdProjectId}`) return route.fulfill({ json: { ...project, id: createdProjectId, assets: [] } })
  if (path.endsWith('/workspace-agent/suggestions')) return route.fulfill({ json: { suggestions: [suggestion], capabilities: [] } })
  if (path.endsWith('/workspace-agent/runs') && request.method() === 'GET') {
    for (const run of runs) if (run.message === 'Create pending story' && run.status === 'running') Object.assign(run, { status: 'completed', revision: 2, result: { data: { id: createdProjectId } } })
    return route.fulfill({ json: { runs, has_more: false } })
  }
  if (path.endsWith('/workspace-agent/runs') && request.method() === 'POST') {
    const body = request.postDataJSON(); sends.push(body)
    if (failOnce) { failOnce = false; return route.fulfill({ status: 503, json: { detail: 'Temporary failure' } }) }
    const run = { id: `run-${runs.length}`, message: body.message, reply: 'Review this action.', context: body.context, action: { name: 'clips.update', input: { title: 'New title' } }, status: 'waiting_for_confirmation', revision: 1, cost_credits: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    if (body.message === 'Create pending story') { run.status = 'running'; run.action = { name: 'stories.create', input: {} } }
    if (body.message === 'Preview clip') { run.status = 'completed'; run.action = { name: 'clips.trim', input: { id: createdProjectId } }; run.result = { data: { clip_id: createdProjectId, clip: { duration: 2 } } } }
    runs.push(run); return route.fulfill({ json: run })
  }
  if (path.endsWith('/control')) {
    controls.push(request.postDataJSON())
    const run = runs.find(run => path.includes(run.id)); run.status = 'completed'; run.revision++
    run.result = { summary: 'Updated', route: '/dashboard/create' }
    return route.fulfill({ json: run })
  }
  if (path.includes('/workspace-agent/runs/')) return route.fulfill({ json: runs.find(run => path.endsWith(run.id)) })
  return route.fulfill({ json: { projects: [], clips: [], jobs: [], stories: [], items: [], total: 0 } })
})
try {
  await page.goto(`${process.env.TEST_ORIGIN || 'http://127.0.0.1:5191'}/dashboard/create?story=${projectId}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.getByRole('button', { name: 'Open Workspace Agent' }).click()
  const panel = page.locator('#workspace-agent-panel')
  await panel.locator('#agent-recordings').setInputFiles({ name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid') })
  await panel.getByText('Check file format, size and count.').waitFor()
  assert.equal(registrations, 0)
  await panel.locator('#agent-recordings').setInputFiles({ name: 'recording.mp4', mimeType: 'video/mp4', buffer: Buffer.from('synthetic video') })
  await panel.getByText('✓ recording.mp4 · Validated').waitFor()
  assert.equal(registrations, 1)
  await panel.getByLabel('Attach logo or document').setInputFiles({ name: 'brief.md', mimeType: 'text/markdown', buffer: Buffer.from('A synthetic content brief.') })
  await panel.getByText('brief.md', { exact: true }).waitFor()
  assert.equal(resources.length, 1)
  const draft = panel.getByRole('textbox')
  await draft.fill('Keep this draft')
  await page.evaluate(() => { window.agentShell = document.getElementById('dashboard-shell'); window.agentHeader = document.querySelector('.studio-topbar') })
  await page.locator('a[href="/dashboard/brand"]').first().click()
  assert.equal(await draft.inputValue(), 'Keep this draft')
  assert.equal(await page.evaluate(() => window.agentShell === document.getElementById('dashboard-shell') && window.agentHeader === document.querySelector('.studio-topbar')), true)
  await panel.getByText('Explain', { exact: true }).click()
  assert.equal(sends.length, 0)
  await panel.getByRole('button', { name: 'Send', exact: true }).click()
  await panel.getByRole('button', { name: 'Retry request' }).click()
  await panel.getByRole('button', { name: 'Approve action' }).waitFor()
  assert.equal(sends[0].request_id, sends[1].request_id)
  assert.deepEqual(sends[1].resource_ids, ['resource-0'])
  await panel.getByRole('button', { name: 'Approve action' }).click()
  await panel.getByText('Completed', { exact: true }).waitFor()
  assert.equal(controls[0].revision, 1)
  assert.ok(page.url().endsWith('/dashboard/brand'), 'Follow is off by default')
  await panel.getByLabel('Follow AI navigation').check()
  await panel.getByRole('button', { name: 'Edit', exact: true }).click()
  await panel.getByLabel('What would you change?').fill('Make this a shorter story')
  await panel.getByRole('button', { name: 'Revise suggestion', exact: true }).click()
  await panel.getByText('Revised story draft', { exact: true }).waitFor()
  assert.deepEqual(revisedInstructions, ['Make this a shorter story'])
  await panel.getByRole('button', { name: 'Do it', exact: true }).click()
  await panel.getByRole('button', { name: 'Approve action' }).click()
  await page.waitForURL('**/dashboard/create')
  assert.equal(sends.at(-1).suggestion_id, 'suggestion-revised')
  assert.equal(sends.at(-1).action, undefined)
  await page.getByRole('heading', { name: 'Multi-Clip Story Builder' }).waitFor()
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation.playState === 'running'))
  await page.screenshot({ path: 'test-results/workspace-agent-desktop.png' })
  await panel.getByRole('button', { name: 'Collapse agent' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  const opener = page.getByRole('button', { name: 'Open Workspace Agent' })
  await opener.click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('dialog').getByRole('textbox').fill('Mobile draft')
  await page.screenshot({ path: 'test-results/workspace-agent-mobile.png' })
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await opener.evaluate(element => element === document.activeElement), true)
  await opener.click()
  assert.equal(await page.getByRole('dialog').getByRole('textbox').inputValue(), 'Mobile draft')
  await page.getByRole('dialog').getByRole('textbox').fill('Create pending story')
  await page.getByRole('dialog').getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByRole('dialog').getByText(createdProjectId, { exact: true }).waitFor()
  await page.getByRole('dialog').getByRole('textbox').fill('Preview clip')
  await page.getByRole('dialog').getByRole('button', { name: 'Send', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Load preview' }).click()
  await page.waitForFunction(() => document.querySelector('#workspace-agent-panel video')?.readyState >= 1)
  assert.equal(await page.getByRole('dialog').locator('video').getAttribute('autoplay'), null)
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  const sendStyle = await page.getByRole('dialog').getByRole('button', { name: 'Send', exact: true }).evaluate(element => ({ background: getComputedStyle(element).backgroundColor, motion: getComputedStyle(element).transitionDuration }))
  assert.equal(sendStyle.motion, '0s')
  await page.screenshot({ path: 'test-results/workspace-agent-mobile-dark.png' })
  await page.getByRole('dialog').getByText('Preferences and history', { exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reset agent preferences' }).click()
  await page.waitForFunction(() => !document.querySelector('#workspace-agent-panel input[type="checkbox"]')?.checked)
  assert.deepEqual(preferences, { follow: false, recommendations: true })
  await page.getByRole('dialog').getByRole('button', { name: 'Clear finished history' }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('[data-agent-run]')].every(element => !element.textContent.includes('Completed')))
  console.log('Workspace Agent browser checks passed: stable shell/draft, explain, idempotent retry, revision control, opt-in follow, mobile dialog/focus.')
} finally { await browser.close() }
