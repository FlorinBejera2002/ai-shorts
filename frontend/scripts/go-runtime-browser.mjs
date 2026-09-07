import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Only the state file produced by the disposable application runner is valid.
const statePath = process.env.SNEEPCUT_BROWSER_FIXTURE_STATE
assert.ok(statePath, 'SNEEPCUT_BROWSER_FIXTURE_STATE is required')
const state = JSON.parse(await readFile(statePath, 'utf8'))
assert.match(state.name, /^sneepcut-go-browser-test-[a-f0-9]{12}$/)
assert.equal(new URL(state.base).hostname, '127.0.0.1')
assert.equal(state.email, 'browser-fixture@example.invalid')
assert.ok(state.clipId, 'Run the application fixture including signed media first')
const modulePath = process.env.PLAYWRIGHT_MODULE
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright')
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const output = 'test-results/go-runtime'
await mkdir(output, { recursive: true })
const results = []
let inspectedPage = null
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  inspectedPage = page
  page.setDefaultTimeout(15000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${state.base}/dashboard/settings`)
  await page.waitForURL('**/login?callbackUrl=*')
  await page.getByLabel('Email', { exact: true }).fill(state.email)
  await page.locator('#password').fill(state.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL('**/dashboard/settings')
  const name = page.locator('#profile-name')
  await name.waitFor()
  const updatedName = 'Browser profile ' + Date.now()
  await name.fill(updatedName)
  const saved = page.waitForResponse(response => response.url().endsWith('/api/user/profile') && response.request().method() === 'PATCH')
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  assert.equal((await saved).status(), 200)
  await page.reload({ waitUntil: 'domcontentloaded' })
  assert.equal(await name.inputValue(), updatedName)
  const cookie = (await context.cookies()).find(cookie => cookie.name === 'refreshToken')
  assert.ok(cookie?.httpOnly)
  assert.equal(cookie.path, '/v1/auth')
  assert.equal(cookie.sameSite, 'Strict')
  assert.equal(await page.evaluate(() => document.cookie.includes('refreshToken=')), false)
  assert.equal(await page.evaluate(() => Object.values(localStorage).some(value => value.startsWith('eyJ'))), false)
  results.push('Actual form sign-in, PostgreSQL profile persistence, reload refresh and HttpOnly cookie')

  for (const route of ['/dashboard', '/dashboard/analytics', '/dashboard/history', '/dashboard/review', '/dashboard/clips', '/dashboard/calendar', '/dashboard/billing']) {
    console.log('CHECK ' + route)
    const response = await page.goto(state.base + route, { waitUntil: 'domcontentloaded' })
    assert.equal(response.status(), 200)
    await page.locator('h1').first().waitFor()
    assert.equal(new URL(page.url()).pathname, route)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
    assert.deepEqual(errors, [], route)
    results.push(route)
  }
  await page.goto(state.base + '/dashboard/brand', { waitUntil: 'domcontentloaded' })
  const brandSaved = page.waitForResponse(response => response.url().endsWith('/api/user/brand') && response.request().method() === 'PUT')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  assert.equal((await brandSaved).status(), 200)
  results.push('Existing brand kit saved through actual Go handler')

  await page.goto(`${state.base}/dashboard/clips/${state.clipId}`, { waitUntil: 'domcontentloaded' })
  const video = page.locator('video').first()
  await video.waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some(video => video.readyState >= 2 && video.duration >= 3.9))
  await video.evaluate(async video => { video.muted = true; await video.play() })
  await page.waitForFunction(() => [...document.querySelectorAll('video')].some(video => video.currentTime > 0.2))
  await video.evaluate(video => video.pause())
  await page.screenshot({ path: `${output}/clip-playback.png`, fullPage: true })
  assert.deepEqual(errors, [])
  results.push('Browser playback of actual Go-signed/Nginx-served H.264 clip')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(state.base + '/ro/dashboard', { waitUntil: 'domcontentloaded' })
  await page.locator('h1').first().waitFor()
  assert.equal(new URL(page.url()).pathname, '/ro/dashboard')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
  await page.screenshot({ path: `${output}/ro-mobile-dashboard.png`, fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await context.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: state.base }])
  await page.goto(state.base + '/dashboard/settings', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await page.waitForURL('**/login?callbackUrl=*')
  await page.reload({ waitUntil: 'domcontentloaded' })
  assert.ok(new URL(page.url()).pathname.endsWith('/login'))
  assert.equal((await context.cookies()).some(cookie => cookie.name === 'refreshToken'), false)
  assert.deepEqual(errors, [])
  results.push('Romanian mobile layout and persistent server logout')
  await writeFile(`${output}/report.json`, JSON.stringify({ base: state.base, runtimeErrors: errors, passed: results }, null, 2))
  for (const result of results) console.log('PASS ' + result)
} catch (error) {
  if (inspectedPage) {
    await inspectedPage.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {})
    console.error('Page at failure:', inspectedPage.url())
    console.error((await inspectedPage.locator('body').innerText().catch(() => '')).slice(0, 4000))
  }
  throw error
} finally {
  await browser.close()
}
