import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { once } from 'node:events'

// Two real browser origins, with synthetic authentication and no account access.
if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const appOrigin = process.env.TEST_ORIGIN || 'http://localhost:5189'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(appOrigin).hostname))
const studioOrigin = 'http://localhost:5191'
const userId = '00000000-0000-4000-8000-000000000001'
let accountId = userId
let sessionCalls = 0
let refreshCalls = 0
const errors = []
const consoleErrors = []
// A real loopback parent gives Chrome the correct local-network classification.
// Intercepting its HTML navigation would classify the fixture as a public origin.
const fixture = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html')
  response.end(`<!doctype html>
    <title>Studio renewal fixture</title><input aria-label="Unsaved edit" value="Keep my changes">
    <script>
      window.results = [];
      window.renew = requestId => document.querySelector('iframe').contentWindow.postMessage({ type: 'sneepcut:renew-session', requestId, userId: '${userId}' }, '${appOrigin}');
      window.addEventListener('message', event => {
        if (event.origin !== '${appOrigin}' || event.source !== document.querySelector('iframe')?.contentWindow) return;
        window.results.push(event.data);
        if (event.data.type === 'sneepcut:session-bridge-ready') window.renew('initial-request');
      });
    </script><iframe title="Session connection" hidden src="${appOrigin}/studio-session"></iframe>`)
})
fixture.listen(5191, '127.0.0.1')
await once(fixture, 'listening')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
page.setDefaultTimeout(30000)
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('requestfailed', request => consoleErrors.push(`${request.url()}: ${request.failure()?.errorText}`))
await page.route('**/*', async route => {
  const request = route.request()
  const url = new URL(request.url())
  if (url.origin === studioOrigin && request.isNavigationRequest()) {
    return route.continue()
  }
  if (url.origin === studioOrigin && url.pathname === '/sneepcut/session') {
    const headers = { 'access-control-allow-origin': appOrigin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization', 'access-control-allow-methods': 'POST,OPTIONS' }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    assert.equal(request.headers().authorization, 'Bearer synthetic-session-token')
    sessionCalls++
    return route.fulfill({ headers, json: { ok: true } })
  }
  if (url.pathname.startsWith('/v1/')) {
    refreshCalls++
    return route.fulfill({ json: { access_token: 'synthetic-session-token', user: { id: accountId, email: 'synthetic@example.invalid', name: 'Synthetic', plan: 'free', access_role: 'member' } } })
  }
  if (url.pathname.startsWith('/api/')) throw new Error('The session bridge must not mount dashboard data requests')
  return route.continue()
})
try {
  await page.goto(studioOrigin, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => window.results.some(result => result.requestId === 'initial-request' && result.ok === true))
  assert.equal(sessionCalls, 1)
  assert.equal(refreshCalls, 1)
  const frame = page.frames().find(frame => frame.url() === appOrigin + '/studio-session')
  assert.ok(frame)
  assert.equal(await frame.locator('#dashboard-shell, iframe, video').count(), 0, 'The bridge is authentication transport only')
  await page.getByRole('textbox', { name: 'Unsaved edit' }).fill('Unsaved work stays mounted')

  // A forged origin cannot trigger token refresh or a session exchange.
  await frame.evaluate(() => window.dispatchEvent(new MessageEvent('message', {
    source: window.parent, origin: 'https://untrusted.invalid',
    data: { type: 'sneepcut:renew-session', requestId: 'forged', userId: '00000000-0000-4000-8000-000000000001' }
  })))
  await page.evaluate(() => window.renew('second-request'))
  await page.waitForFunction(() => window.results.some(result => result.requestId === 'second-request' && result.ok === true))
  assert.equal(sessionCalls, 2)
  assert.equal(refreshCalls, 2)

  accountId = '00000000-0000-4000-8000-000000000002'
  await page.evaluate(() => window.renew('changed-account'))
  await page.waitForFunction(() => window.results.some(result => result.requestId === 'changed-account' && result.ok === false))
  assert.equal(sessionCalls, 2, 'Never replace the open editor session with another account')
  assert.equal(await page.getByRole('textbox', { name: 'Unsaved edit' }).inputValue(), 'Unsaved work stays mounted')
  accountId = userId
  await page.evaluate(() => window.renew('retry-request'))
  await page.waitForFunction(() => window.results.some(result => result.requestId === 'retry-request' && result.ok === true))
  assert.equal(sessionCalls, 3)
  const messages = await page.evaluate(() => window.results)
  assert.equal(messages.some(result => result.requestId === 'forged'), false)
  assert.doesNotMatch(JSON.stringify(messages), /synthetic-session-token|Bearer|access_token/)
  assert.deepEqual(errors, [])
  console.log('PASS: cross-origin Studio session renewal; exact origin validation; account binding; retry; no credentials in messages; no editor remount')
} catch (error) {
  console.error({ errors, consoleErrors, sessionCalls, refreshCalls, frames: page.frames().map(frame => frame.url()), messages: await page.evaluate(() => window.results).catch(() => null) })
  throw error
} finally {
  await browser.close()
  await new Promise((resolve, reject) => fixture.close(error => error ? reject(error) : resolve()))
}
