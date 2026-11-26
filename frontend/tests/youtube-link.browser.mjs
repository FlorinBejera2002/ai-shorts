import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// All browser requests use a synthetic account and mocked API. No user data,
// Google consent, real job queue, credits or provider calls are mutated.
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.TEST_ORIGIN || 'http://localhost:3001'
const output = resolve('artifacts/youtube-link-20261126')
const user = {
  id: '00000000-0000-4000-8000-000000000081',
  email: 'youtube-link@example.invalid',
  name: 'Link fixture',
  credits: 1000,
  plan: 'free',
  access_role: 'member'
}
const jobID = '00000000-0000-4000-8000-000000000090'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
await mkdir(output, { recursive: true })
const report = []

async function verifyFastRefresh(page, input) {
  const file = resolve('frontend/src/components/create/youtube-link-workflow.tsx')
  const original = await readFile(file, 'utf8')
  const probe = original.replace('<form\n', '<form data-refresh-probe="youtube-link"\n')
  assert.notEqual(probe, original, 'Fast Refresh probe must target the component form')
  const value = await input.inputValue()
  await page.evaluate(() => {
    window.__linkRefreshProof = document.querySelector('[data-sidebar="sidebar"]')
  })
  try {
    await writeFile(file, probe)
    await page.locator('form[data-refresh-probe="youtube-link"]').waitFor()
    assert.equal(await input.inputValue(), value, 'Component state must survive Fast Refresh')
    assert.equal(
      await page.evaluate(
        () => window.__linkRefreshProof === document.querySelector('[data-sidebar="sidebar"]')
      ),
      true,
      'Fast Refresh must preserve the dashboard'
    )
  } catch (error) {
    console.error(
      'Fast Refresh state:',
      await page.evaluate(() => ({
        url: location.href,
        probe: document.querySelector('form[data-refresh-probe="youtube-link"]') !== null,
        sourceSelection: Array.from(document.querySelectorAll('.yt-source-switch button')).map((button) =>
          button.getAttribute('aria-pressed')
        ),
        sidebarPreserved: window.__linkRefreshProof === document.querySelector('[data-sidebar="sidebar"]'),
        error: document.querySelector('vite-error-overlay')?.shadowRoot?.textContent
      }))
    )
    throw error
  } finally {
    const current = await readFile(file, 'utf8')
    assert.equal(current, probe, 'Preserve concurrent source changes instead of overwriting them')
    await writeFile(file, original)
  }
  await page.locator('form[data-refresh-probe="youtube-link"]').waitFor({ state: 'detached' })
  assert.equal(await input.inputValue(), value)
}

try {
  for (const [locale, width, theme] of [
    ['en', 1280, 'light'],
    ['ro', 390, 'dark']
  ]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const calls = []
    const errors = []
    let fail = true
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript((theme) => {
      localStorage.clear()
      sessionStorage.clear()
      localStorage.setItem('theme', theme)
    }, theme)
    await page.route('**/v1/**', (route) =>
      route.fulfill({ json: { access_token: 'synthetic-token', user } })
    )
    await page.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname
      const reply = (json, status = 200) => route.fulfill({ json, status })
      if (path === '/api/user/credits') return reply({ credits: 1000 })
      if (path === '/api/media-capabilities') return reply({ audio_cleanup: { available: true } })
      if (path === '/api/youtube/channel') return reply({ enabled: true, connected: false, account: null })
      if (path === '/api/youtube/imports') return reply({ imports: [] })
      if (path === '/api/workspace-agent/runs') return reply({ runs: [], has_more: false })
      if (path === '/api/workspace-agent/suggestions') return reply({ suggestions: [], capabilities: [] })
      if (path === '/api/jobs' && route.request().method() === 'POST') {
        calls.push(route.request().postDataJSON())
        return fail ? reply({ detail: 'synthetic outage' }, 503) : reply({ id: jobID }, 201)
      }
      if (path === `/api/jobs/${jobID}`)
        return reply({
          job: {
            id: jobID,
            user_id: user.id,
            source_type: 'youtube',
            source_url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
            status: 'downloading',
            progress: 5,
            progress_message: 'Downloading YouTube video (up to 4K)',
            num_clips_requested: 5,
            aspect_ratio: '9:16',
            clips: [],
            created_at: new Date().toISOString()
          },
          celery_state: null,
          celery_meta: null
        })
      return reply({})
    })
    try {
      await page.goto(`${origin}${locale === 'ro' ? '/ro' : ''}/dashboard/create?mode=youtube`, {
        waitUntil: 'domcontentloaded',
        timeout: 180000
      })
      const switcher = page.locator('.yt-source-switch')
      await switcher.getByRole('button').nth(1).click()
      const input = page.locator('input[name="youtube_url"]')
      await input.fill('https://example.invalid/video')
      await input.press('Enter')
      await page.locator('.yt-link-field input[aria-invalid="true"]').waitFor()
      assert.equal(calls.length, 0)
      await input.fill('https://youtu.be/aqz-KE-bpKQ?si=tracking')
      if (locale === 'en' && process.env.TEST_FAST_REFRESH === '1') await verifyFastRefresh(page, input)
      await switcher.getByRole('button').nth(0).click()
      await switcher.getByRole('button').nth(1).click()
      assert.equal(await input.inputValue(), 'https://youtu.be/aqz-KE-bpKQ?si=tracking')
      assert.equal(
        await page.locator('form.yt-path .yt-consent').count(),
        0,
        'Paste link must not request Google export consent'
      )
      await input.press('Enter')
      await page
        .locator('.yt-link-field__error')
        .filter({ hasText: locale === 'ro' ? 'Nu am putut' : "couldn't" })
        .waitFor()
      assert.equal(await input.inputValue(), 'https://youtu.be/aqz-KE-bpKQ?si=tracking')
      assert.equal(calls[0].source_url, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ')
      assert.equal(calls[0].source_type, 'youtube')
      assert.equal(calls[0].source_storage_key, undefined)
      assert.equal(calls[0].skip_scan, undefined)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      if (process.env.TEST_SCREENSHOTS !== '0') {
        await page.screenshot({ path: resolve(output, `paste-link-${locale}-${theme}.png`), fullPage: true })
      }
      await page.evaluate(() => {
        window.__linkSidebar = document.querySelector('[data-sidebar="sidebar"]')
        window.__linkHeader = document.querySelector('header')
      })
      fail = false
      await input.press('Enter')
      await page.waitForURL(new RegExp(`/dashboard/jobs/${jobID}$`))
      await page.getByTestId('job-processing').waitFor()
      assert.equal(
        await page.evaluate(
          () => window.__linkSidebar === document.querySelector('[data-sidebar="sidebar"]')
        ),
        true,
        'Dashboard sidebar must remain mounted'
      )
      assert.equal(
        await page.evaluate(() => window.__linkHeader === document.querySelector('header')),
        true,
        'Dashboard header must remain mounted'
      )
      assert.deepEqual(errors, [])
      report.push({ locale, width, theme, validated: true, statePreserved: true, jobNavigation: true })
    } finally {
      await page.close()
    }
  }
  console.log(JSON.stringify({ suite: 'youtube-link', status: 'passed', checks: report }, null, 2))
} finally {
  await browser.close()
}
