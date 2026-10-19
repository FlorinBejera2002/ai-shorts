import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

if (!process.env.PLAYWRIGHT_MODULE)
  throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')

const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(60000)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'platforms@example.invalid', name: 'Platform Test', plan: 'pro',
  credits: 100, access_role: 'member'
}
const allowed = ['instagram', 'facebook', 'tiktok', 'youtube']
const names = {
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
  youtube: 'YouTube', linkedin: 'LinkedIn', x: 'X'
}
let script = {
  id: '00000000-0000-4000-8000-000000000002', title: 'Historical script',
  status: 'draft', topic: 'A saved brief', platform: 'linkedin', language: 'en',
  targetDurationSeconds: 30, tone: 'entertaining', style: 'talking_head',
  audience: '', revision: 1, archived: false,
  createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z',
  snapshot: {
    title: 'Historical script', hook: 'Saved hook', scenes: [],
    call_to_action: '', caption: '', hashtags: [], total_duration_seconds: 30,
    equipment_suggestions: [], filming_tips: []
  }
}
const updates = []
const newDrafts = []
await page.route('**/v1/**', route => route.fulfill({
  json: { access_token: 'synthetic-token', user }
}))
await page.route('**/api/**', route => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  if (path === '/api/publishing') return route.fulfill({ json: {
    // A stale API/cache must not reintroduce removed providers or accounts.
    providers: [...allowed, 'linkedin', 'x'].map(id => ({
      id, name: names[id], configured: true, supportsPublishing: true
    })),
    accounts: [{
      id: '00000000-0000-4000-8000-000000000099', provider: 'linkedin',
      name: 'Retired LinkedIn account', status: 'connected', scopes: ['video_publish']
    }], clips: [], posts: []
  } })
  if (path === '/api/calendar') return route.fulfill({ json: { posts: [], clips: [] } })
  if (path === '/api/user/profile') return route.fulfill({ json: { profile: {
    ...user, image: null, provider: 'password', canChangePassword: true,
    recentlyAuthenticated: true, emailVerified: '2026-10-01', createdAt: '2026-10-01'
  } } })
  if (path === '/api/scripts/items') {
    if (request.method() === 'POST') {
      const body = request.postDataJSON()
      newDrafts.push(body)
      return route.fulfill({ json: { script: {
        ...script, ...body, id: '00000000-0000-4000-8000-000000000003'
      } } })
    }
    return route.fulfill({ json: { scripts: [script] } })
  }
  if (path === `/api/scripts/items/${script.id}` && request.method() === 'PATCH') {
    const body = request.postDataJSON()
    updates.push(body)
    assert.ok(allowed.includes(body.platform), 'Only an explicitly supported platform is saved')
    script = { ...script, platform: body.platform, revision: script.revision + 1 }
    return route.fulfill({ json: { script } })
  }
  if (path === '/api/workspace-agent/runs')
    return route.fulfill({ json: { runs: [], has_more: false } })
  if (path === '/api/workspace-agent/suggestions')
    return route.fulfill({ json: { suggestions: [], capabilities: [] } })
  return route.fulfill({ json: {} })
})

async function noRetiredPlatforms() {
  assert.doesNotMatch(await page.locator('body').innerText(), /LinkedIn|Twitter/i)
  assert.equal(await page.locator('[data-platform-mark="linkedin"], [data-platform-mark="x"]').count(), 0)
}

try {
  await page.goto(`${origin}/dashboard/publish`, { waitUntil: 'networkidle', timeout: 180000 })
  const connections = page.locator('aside').filter({ hasText: 'Connected accounts' })
  await connections.getByText('YouTube', { exact: true }).waitFor()
  assert.deepEqual(await connections.locator('[data-platform-mark]').evaluateAll(
    nodes => nodes.map(node => node.dataset.platformMark)
  ), allowed)
  await noRetiredPlatforms()
  console.log('Calendar shows exactly four providers despite stale API data')

  const consent = connections.getByRole('switch')
  await consent.click()
  assert.equal(await consent.getAttribute('aria-checked'), 'true')
  await page.evaluate(() => {
    window.platformRefreshProbe = {
      connections: [...document.querySelectorAll('aside')].find(node => node.textContent.includes('Connected accounts')),
      main: document.querySelector('main')
    }
  })
  const sourcePath = new URL('../src/components/calendar/calendar-connections.tsx', import.meta.url)
  const anchor = 'as="aside"'
  const probe = `${anchor}\n      data-platform-refresh-probe="updated"`
  const source = await readFile(sourcePath, 'utf8')
  assert.equal(source.split(anchor).length, 2)
  try {
    await writeFile(sourcePath, source.replace(anchor, probe))
    await page.locator('[data-platform-refresh-probe="updated"]').waitFor()
    assert.equal(await consent.getAttribute('aria-checked'), 'true', 'Fast Refresh preserves consent state')
    assert.equal(await page.evaluate(() =>
      window.platformRefreshProbe?.connections === document.querySelector('[data-platform-refresh-probe]') &&
      window.platformRefreshProbe?.main === document.querySelector('main')
    ), true, 'Fast Refresh preserves the component and surrounding dashboard DOM')
  } finally {
    const current = await readFile(sourcePath, 'utf8')
    if (current.includes(probe)) await writeFile(sourcePath, current.replace(probe, anchor))
  }
  await page.locator('[data-platform-refresh-probe]').waitFor({ state: 'detached' })
  console.log('Component Fast Refresh preserves state and dashboard DOM')

  await page.goto(`${origin}/dashboard/settings`, { waitUntil: 'networkidle' })
  const settings = page.locator('section[aria-labelledby="connections-title"]')
  await settings.getByText('YouTube', { exact: true }).waitFor()
  assert.equal(await settings.locator('li').count(), 4)
  await noRetiredPlatforms()

  await page.goto(`${origin}/dashboard/script-generator`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Historical script/ }).click()
  const platform = page.locator('#script-platform')
  await platform.waitFor()
  assert.equal(await platform.inputValue(), '', 'A retired platform is not silently reassigned')
  assert.deepEqual((await platform.locator('option').evaluateAll(
    options => options.map(option => option.value).filter(Boolean)
  )).sort(), [...allowed].sort())
  assert.equal(updates.length, 0, 'Opening a legacy script does not mutate its saved platform')
  await noRetiredPlatforms()
  await page.getByRole('button', { name: 'All scripts', exact: true }).click()
  await page.getByRole('button', { name: 'New script', exact: true }).click()
  await platform.waitFor()
  assert.equal(await platform.inputValue(), 'tiktok')
  assert.equal(newDrafts.at(-1).platform, 'tiktok', 'A new draft cannot inherit a retired platform')
  assert.equal(updates.length, 0, 'Creating a new draft preserves the historical script')
  await page.getByRole('button', { name: 'All scripts', exact: true }).click()
  await page.getByRole('button', { name: /Historical script/ }).click()
  assert.equal(await platform.inputValue(), '')
  const saved = page.waitForResponse(response => response.request().method() === 'PATCH' &&
    new URL(response.url()).pathname === `/api/scripts/items/${script.id}`)
  await platform.selectOption('facebook')
  await saved
  assert.equal(updates.at(-1).platform, 'facebook')
  console.log('Legacy scripts require explicit choice from the four supported platforms')

  for (const route of ['/', '/ro', '/privacy', '/terms', '/data-deletion']) {
    await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' })
    await noRetiredPlatforms()
  }
  await page.goto(`${origin}/dashboard/publish`, { waitUntil: 'networkidle' })
  await page.getByText('Connected accounts', { exact: true }).waitFor()
  const screenshot = new URL('../test-results/supported-platforms.png', import.meta.url)
  await mkdir(new URL('../test-results/', import.meta.url), { recursive: true })
  await page.screenshot({ path: fileURLToPath(screenshot), fullPage: true })
  assert.deepEqual(errors, [], 'No browser runtime errors')
  console.log('Supported platform browser checks passed')
} finally {
  await browser.close()
}
