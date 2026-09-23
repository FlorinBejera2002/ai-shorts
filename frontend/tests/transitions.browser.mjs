import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const modulePath = process.env.PLAYWRIGHT_MODULE
if (!modulePath) throw new Error('Set PLAYWRIGHT_MODULE to the installed playwright entry point')
const { chromium } = await import(pathToFileURL(modulePath).href)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const id = '00000000-0000-4000-8000-000000000001'
let requests = 0
let polls = 0
let fail = false
const clip = {
  id, title: 'Synthetic transition verification', duration: 12,
  start_time: 0, end_time: 20, aspect_ratio: '9:16', resolution: '1080x1920',
  created_at: '2026-09-22T00:00:00Z', has_subtitles: false,
  file_url: null, variants: [], can_improve_transitions: true,
  active_edit_tasks: 0, edit_status: null, processing_active: false
}
await page.route('**/v1/**', (route) => route.fulfill({ json: {
  access_token: 'synthetic-token',
  user: { id, email: 'transitions@example.invalid', name: 'Test', credits: 100, plan: 'free', access_role: 'member' }
} }))
await page.route('**/api/**', async (route) => {
  const path = new URL(route.request().url()).pathname
  if (path.endsWith('/transitions')) {
    requests++
    if (fail) return route.fulfill({ status: 409, json: { detail: 'Wait for active processing to finish' } })
    clip.active_edit_tasks = 1
    clip.edit_status = 'pending'
    return route.fulfill({ status: 202, json: { task_id: 'synthetic-task', status: 'processing' } })
  }
  if (path === `/api/clips/${id}`) {
    if (clip.active_edit_tasks && ++polls >= 3) {
      clip.active_edit_tasks = 0
      clip.edit_status = 'completed'
    }
    return route.fulfill({ json: clip })
  }
  return route.fulfill({ json: {} })
})
try {
  await page.goto(`${process.env.TEST_ORIGIN || 'http://127.0.0.1:5188'}/dashboard/clips/${id}`)
  const button = page.getByRole('button', { name: 'Improve transitions', exact: true })
  await button.waitFor({ timeout: 30000 })
  await button.click()
  const busy = page.getByRole('button', { name: 'Analyzing transitions…' })
  await busy.waitFor()
  assert.equal(await busy.isDisabled(), true)
  await page.getByRole('status').filter({ hasText: 'Transitions reviewed' }).waitFor({ timeout: 15000 })
  assert.equal(requests, 1)
  fail = true
  await button.click()
  await page.getByRole('alert').filter({ hasText: 'Wait for active processing' }).waitFor()
  assert.equal(await button.isEnabled(), true)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  assert.deepEqual(errors, [])
  if (process.env.TEST_SCREENSHOT) await page.screenshot({ path: process.env.TEST_SCREENSHOT, fullPage: true })
  console.log('PASS: transition submission, busy state, polling, completion, error recovery, and mobile width')
} catch (error) {
  console.error({ url: page.url(), errors, body: (await page.locator('body').innerText()).slice(0, 3500) })
  throw error
} finally {
  await browser.close()
}
