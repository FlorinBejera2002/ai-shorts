// Read the accompanying integration guide before running: this suite mutates
// only an explicitly configured synthetic account on a loopback test server.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const origin = process.env.SNEEPCUT_BROWSER_ORIGIN ?? 'http://localhost:3001'
const parsed = new URL(origin)
assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname))
assert.equal(parsed.protocol, 'http:')
assert.equal(process.env.SNEEPCUT_BROWSER_MUTATIONS, 'allow-synthetic-account')
const email = process.env.SNEEPCUT_BROWSER_EMAIL
const password = process.env.SNEEPCUT_BROWSER_PASSWORD
assert.ok(email?.endsWith('@example.invalid') && password)
const playwright = process.env.SNEEPCUT_PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.SNEEPCUT_PLAYWRIGHT_MODULE).href)
  : await import('playwright')
const output = process.env.SNEEPCUT_BROWSER_OUTPUT ?? 'test-results/integration'
await mkdir(output, { recursive: true })

for (const name of ['chromium', 'firefox']) {
  const browser = await playwright[name].launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  context.setDefaultTimeout(30000)
  context.setDefaultNavigationTimeout(60000)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(`${origin}/login`)
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL('**/dashboard')
    await page.getByRole('heading', { level: 1 }).waitFor()

    await page.goto(`${origin}/dashboard/settings`)
    const profile = page.getByLabel('Display name', { exact: true })
    const originalName = await profile.inputValue()
    const testName = `Browser ${name} ${Date.now()}`
    await profile.fill(testName)
    const [saved] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/api/user/profile') && r.request().method() === 'PATCH'),
      page.getByRole('button', { name: 'Save profile', exact: true }).click()
    ])
    assert.equal(saved.status(), 200)
    await page.waitForLoadState('networkidle')
    // A separate page checks persistence without racing Next's router.refresh
    // against an explicit reload (Firefox cancels one of those navigations).
    const persistedPage = await context.newPage()
    await persistedPage.goto(`${origin}/dashboard/settings`)
    assert.equal(await persistedPage.getByLabel('Display name', { exact: true }).inputValue(), testName)
    await persistedPage.close()
    await profile.fill(originalName)
    const [restored] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/api/user/profile') && r.request().method() === 'PATCH'),
      page.getByRole('button', { name: 'Save profile', exact: true }).click()
    ])
    assert.equal(restored.status(), 200)
    await page.waitForLoadState('networkidle')

    console.log(`${name}: profile persistence verified`)

    const before = await (await context.request.get(`${origin}/api/user/credits`)).json()
    await page.getByRole('link', { name: 'Create', exact: true }).click()
    await page.waitForURL('**/dashboard/create')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Batch', exact: true }).click()
    await page.getByLabel('YouTube URL 1', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'YouTube', exact: true }).click()
    await page.getByLabel('YouTube URL', { exact: true }).pressSequentially('https://www.youtube.com/watch?v=abcdefghijk')
    await page.getByText('Ready to process', { exact: true }).waitFor()
    const [created] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/api/jobs') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Generate 5 clips', exact: true }).click()
    ])
    assert.equal(created.status(), 201)
    const job = await created.json()
    await page.waitForURL(`**/dashboard/jobs/${job.id}`)
    await page.waitForLoadState('networkidle')
    const poll = await context.request.get(`${origin}/api/jobs/${job.id}`)
    assert.equal(poll.status(), 200)
    assert.equal((await poll.json()).job.status, 'pending')
    const charged = await (await context.request.get(`${origin}/api/user/credits`)).json()
    assert.equal(charged.credits, before.credits - 50)
    const cancelled = await context.request.post(`${origin}/api/jobs/${job.id}`)
    assert.equal(cancelled.status(), 200)
    assert.equal((await cancelled.json()).status, 'cancelled')
    await context.request.post(`${origin}/api/jobs/${job.id}`)
    const refunded = await (await context.request.get(`${origin}/api/user/credits`)).json()
    assert.equal(refunded.credits, before.credits)
    await page.getByText('Cancelled', { exact: true }).waitFor()

    for (const path of ['/dashboard/clips', '/dashboard/billing', '/dashboard/brand', '/ro/dashboard/settings']) {
      await page.goto(`${origin}${path}`)
      await page.getByRole('heading', { level: 1 }).waitFor()
      assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1)
    }
    await page.goto(`${origin}/ro/dashboard/brand`)
    await page.getByRole('button', { name: 'Stânga sus', exact: true }).waitFor()

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(`${origin}/dashboard/create`)
      await page.getByRole('heading', { level: 1 }).waitFor()
      await page.waitForLoadState('networkidle')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name} horizontal overflow at ${width}px`)
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true })
    }
    assert.deepEqual(errors, [], `${name} browser runtime errors`)
    console.log(`PASS ${name}: sign-in, profile persistence, real backend queue/poll/cancel/refund, localized pages, responsive layout; no page errors`)
  } catch (error) {
    console.error(name, page.url(), (await page.locator('body').innerText()).slice(0, 1800))
    await page.screenshot({ path: `${output}/${name}-failure.png`, fullPage: true })
    throw error
  } finally {
    await context.close()
    await browser.close()
  }
}
