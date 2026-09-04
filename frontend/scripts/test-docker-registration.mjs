// Runs against the local Compose stack and removes only the synthetic users it creates.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

assert.equal(process.env.SNEEPCUT_BROWSER_MUTATIONS, 'allow-synthetic-account')
const origin = 'http://localhost:3000'
const playwright = await import(pathToFileURL(process.env.SNEEPCUT_PLAYWRIGHT_MODULE).href)
await mkdir('test-results/docker-registration', { recursive: true })

for (const name of ['chromium', 'firefox']) {
  // Both browsers share one client IP. Allow the nginx auth rate bucket to drain.
  console.log(`Waiting for the shared authentication rate limit before ${name}...`)
  await delay(120000)
  const email = `docker-register-check-${randomUUID()}@example.invalid`
  const password = `${randomBytes(24).toString('base64url')}Aa7!`
  const browser = await playwright[name].launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  context.setDefaultTimeout(30000)
  context.setDefaultNavigationTimeout(30000)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.goto(`${origin}${name === 'firefox' ? '/ro' : ''}/register`)
    await page.waitForLoadState('networkidle')
    const fields = await page.locator('form input').evaluateAll(inputs => inputs.map(input => input.name))
    for (const field of ['name', 'email', 'password']) assert.ok(fields.includes(field))
    await page.locator('input[name="name"]').fill('Docker Registration Check')
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="password"]').fill(password)
    const registered = page.waitForResponse(response => response.url().endsWith('/api/auth/register'))
    await page.locator('form button[type="submit"]').click()
    const response = await registered
    assert.equal(response.status(), 201, await response.text())
    const created = (await response.json()).user
    assert.equal(created.email, email)
    assert.equal(created.plan, 'free')
    assert.ok(!('passwordHash' in created))
    // No second credentials submission: registration must establish the session.
    await page.waitForURL('**/dashboard', { timeout: 30000 })
    if (name === 'firefox') assert.equal(new URL(page.url()).pathname, '/ro/dashboard')
    const sessionResponse = await context.request.get(`${origin}/api/auth/session`)
    const session = await sessionResponse.json()
    assert.equal(session.user.email, email)
    assert.equal((await context.request.get(`${origin}/api/jobs`)).status(), 200)
    assert.equal((await context.request.get(`${origin}/api/user/credits`)).status(), 200)
    // Port 80 and port 3000 must reach the same database-backed application.
    const duplicate = await context.request.post('http://localhost/api/auth/register', {
      data: { name: 'Docker Registration Check', email, password }
    })
    assert.equal(duplicate.status(), 409)
    await page.screenshot({ path: `test-results/docker-registration/${name}.png`, fullPage: true })
    assert.deepEqual(errors, [])
    console.log(`${name}: registration 201, automatic login/session, jobs/credits 200, duplicate 409 passed`)
  } finally {
    await browser.close()
    assert.match(email, /^docker-register-check-[a-f0-9-]+@example\.invalid$/)
    execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'sneepcut', '-d', 'sneepcut',
      '-v', 'ON_ERROR_STOP=1', '-c', `DELETE FROM users WHERE email = '${email}' AND name = 'Docker Registration Check';`],
      { cwd: new URL('../../', import.meta.url), stdio: 'pipe' })
    console.log(`${name}: synthetic account removed`)
  }
}
