// Opt-in synthetic-account test. Restores the original database role in finally.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import pg from 'pg'

const origin = process.env.SNEEPCUT_BROWSER_ORIGIN ?? 'http://localhost:3001'
const url = new URL(origin)
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:')
assert.equal(process.env.SNEEPCUT_BROWSER_MUTATIONS, 'allow-synthetic-account')
const email = process.env.SNEEPCUT_BROWSER_EMAIL
assert.ok(email?.endsWith('@example.invalid'))
const databaseURL = new URL(process.env.DATABASE_URL)
assert.ok(['localhost', '127.0.0.1'].includes(databaseURL.hostname))
assert.equal(databaseURL.pathname, '/sneepcut_integration_test')
const database = new pg.Client({ connectionString: databaseURL.href })
await database.connect()
const { rows } = await database.query('SELECT id, access_role FROM users WHERE email=$1', [email])
assert.equal(rows.length, 1)
const user = rows[0]
assert.equal(user.access_role, 'member')
const playwright = await import(pathToFileURL(process.env.SNEEPCUT_PLAYWRIGHT_MODULE).href)
try {
  for (const name of ['chromium', 'firefox']) {
    const browser = await playwright[name].launch({ headless: true })
    try {
      const context = await browser.newContext()
      const page = await context.newPage()
      await page.goto(`${origin}/login`)
      await page.getByLabel('Email', { exact: true }).fill(email)
      await page.getByLabel('Password', { exact: true }).fill(process.env.SNEEPCUT_BROWSER_PASSWORD)
      await page.getByRole('button', { name: 'Sign in', exact: true }).click()
      await page.waitForURL('**/dashboard')
      await database.query("UPDATE users SET access_role='viewer' WHERE id=$1", [user.id])
      assert.equal((await context.request.get(`${origin}/api/jobs`)).status(), 200)
      assert.equal((await context.request.put(`${origin}/api/user/brand`, { data: { primaryColor: '#123456', accessRole: 'member' } })).status(), 403)
      assert.equal((await context.request.post(`${origin}/api/calendar`, { data: {} })).status(), 403)
      assert.equal((await context.request.post(`${origin}/api/jobs`, { data: { source_type: 'youtube', source_url: 'https://youtube.com/watch?v=fixture' }, headers: { 'X-Role': 'member' } })).status(), 403)
      assert.equal((await context.request.post(`${origin}/api/clips/00000000-0000-4000-8000-000000000001/recut`, { data: { segments: [{ start: 0, end: 4, order: 0 }] } })).status(), 403)
      await database.query("UPDATE users SET access_role='member' WHERE id=$1", [user.id])
      console.log(`PASS ${name}: live role refresh, viewer reads, write denial and escalation rejection`)
    } finally {
      await database.query('UPDATE users SET access_role=$1 WHERE id=$2', [user.access_role, user.id])
      await browser.close()
    }
  }
} finally {
  await database.query('UPDATE users SET access_role=$1 WHERE id=$2', [user.access_role, user.id])
  await database.end()
}
