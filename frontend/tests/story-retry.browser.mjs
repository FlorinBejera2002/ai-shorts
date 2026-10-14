import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(45000)
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5196'
const id = '00000000-0000-4000-8000-000000000091'
const actions = []
const retries = []
let conflictNext = false
let projectReads = 0
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const assets = ['b', 'a'].map((name, order) => ({ id: `source-${name}`, name: `${name}.mp4`, duration: 3, size: 1000, order, role: 'auto', include: 'auto', audio_cleanup: { status: 'failed', message: 'Synthetic failure' }, candidates: [] }))
const accepted = { number: 1, parent: 0, accepted: true, plan: { title: 'Retry fixture', summary: '', blocks: [] }, timeline: [], report: { status: 'ready', issues: [], coverage: { plan: true, file: true, audio: true, visual: true, captions: true, semantics: true, boundaries: true } } }
let project = { id, status: 'failed', message: 'Audio cleanup failed', current_version: 0, versions: [], assets, expected_state: 'a'.repeat(64), options: { brief: '', target_seconds: 45, aspect_ratio: '9:16', language: 'auto', mode: 'smart', preserve_order: true, captions: false, caption_mode: 'off', audio_cleanup: { enabled: true } }, limits: { max_files: 200, max_file_bytes: 2 * 1024 ** 3, max_total_bytes: 10 * 1024 ** 3, max_source_seconds: 900, max_total_seconds: 3600 } }
try {
  await page.route('**/v1/**', (route) => route.fulfill({ json: { access_token: 'synthetic-token', user: { id: '00000000-0000-4000-8000-000000000092', email: 'story-retry@example.invalid', name: 'Story retry', credits: 100, plan: 'free', access_role: 'member' } } }))
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/stories') return route.fulfill({ json: { stories: [project] } })
    if (path === `/api/stories/${id}/generate`) {
      actions.push(route.request().postDataJSON())
      if (conflictNext) {
        conflictNext = false
        project = { ...project, status: 'ready', operation_status: 'succeeded', expected_state: 'c'.repeat(64), options: { ...project.options, captions: false, caption_mode: 'off' } }
        return route.fulfill({ status: 409, json: { detail: 'The story changed or is still processing; refresh and try again' } })
      }
      project = { ...project, status: project.current_version ? 'ready' : 'failed', operation_status: 'failed', expected_state: 'b'.repeat(64) }
      return route.fulfill({ json: project })
    }
    if (path === `/api/stories/${id}/retry`) {
      retries.push(route.request().postDataJSON())
      return route.fulfill({ json: project })
    }
    if (path === `/api/stories/${id}`) { projectReads++; return route.fulfill({ json: project }) }
    if (path === '/api/workspace-agent/runs') return route.fulfill({ json: { runs: [], has_more: false } })
    if (path === '/api/workspace-agent/suggestions') return route.fulfill({ json: { suggestions: [], capabilities: [] } })
    return route.fulfill({ json: {} })
  })
  await page.goto(`${origin}/dashboard/create?story=${id}`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Compare audio', { exact: true }).click()
  await page.getByRole('button', { name: 'Retry cleanup', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'))
  assert.deepEqual(retries[0].asset_ids, assets.map((asset) => asset.id))

  project = { ...project, current_version: 1, versions: [accepted], status: 'ready' }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Faster pace', exact: true }).click()
  await page.getByText('Compare audio', { exact: true }).click()
  const retry = page.getByRole('button', { name: 'Retry cleanup', exact: true })
  await retry.click()
  await page.waitForTimeout(150)
  assert.equal(retries[1].action, 'faster')
  assert.equal(retries[1].version, 1)
  assert.notEqual(retries[1].request_id, actions[0].request_id)

  await page.getByRole('button', { name: 'Continue with original audio', exact: true }).click()
  await retry.click()
  await page.waitForTimeout(150)
  assert.equal(retries[2].action, 'restyle')
  assert.equal(retries[2].version, 1)
  assert.deepEqual(retries[2].style, { audio_cleanup: { enabled: false } })
  assert.equal(retries[2].expected_state, 'b'.repeat(64))

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('Compare audio', { exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Retry cleanup', exact: true }).count(), 0, 'Unknown old edit must not retry a guessed operation after reload')
  project = { ...project, options: { ...project.options, audio_cleanup: { enabled: false } } }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('Compare audio', { exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Continue with original audio', exact: true }).count(), 0, 'Disabled cleanup must not show obsolete failure actions')
  assert.equal(await page.locator('audio').count(), 1, 'Disabling cleanup retains comparison access')
  project = { ...project, status: 'ready', operation_status: 'succeeded' }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  const captionChoice = page.getByRole('checkbox', { name: 'Captions', exact: true })
  await captionChoice.check()
  const beforeActions = actions.length
  const beforeReads = projectReads
  conflictNext = true
  await page.getByRole('button', { name: 'Apply appearance', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'The project changed. Your choices are kept. Review them and apply again.' }).waitFor()
  await page.getByRole('button', { name: 'Apply appearance', exact: true }).waitFor({ state: 'visible' })
  await page.waitForTimeout(200)
  assert.ok(projectReads > beforeReads, 'Conflict refreshes authenticated project state')
  assert.equal(actions.length, beforeActions + 1, 'Conflict must never replay the mutation automatically')
  assert.equal(await captionChoice.isChecked(), true, 'Server refresh must retain the pending appearance choice')
  await page.getByRole('button', { name: 'Apply appearance', exact: true }).click()
  await page.waitForTimeout(150)
  assert.equal(actions.length, beforeActions + 2)
  assert.equal(actions.at(-1).expected_state, 'c'.repeat(64), 'Explicit reapply uses the refreshed state guard')
  assert.equal(actions.at(-1).style.captions, true)
  assert.equal(actions.at(-1).style.caption_mode, 'all')
  await page.getByRole('button', { name: 'Retry', exact: true }).waitFor({ state: 'visible' })
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, initialManifest: true, existingVersion: true, originalAction: true, originalStyle: true, refreshedState: true, unknownRetryHidden: true, staleConflictRefresh: true, pendingChoiceRetained: true, noAutomaticReplay: true, persistedFailureRetry: true }))
} finally {
  await browser.close()
}