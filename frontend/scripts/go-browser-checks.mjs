import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// This suite intercepts all Go traffic. It never reads or mutates a database.
const base = process.env.SNEEPCUT_BROWSER_URL ?? 'http://localhost:3101'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
const playwrightPath = process.env.PLAYWRIGHT_MODULE
const { chromium } = await import(playwrightPath ? pathToFileURL(playwrightPath).href : 'playwright')
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const clipId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'
const user = { id: '33333333-3333-4333-8333-333333333333', name: 'Migration Fixture', email: 'go-migration@example.test', credits: 100, plan: 'free', access_role: 'member' }
const profile = { ...user, image: null, provider: 'credentials', canChangePassword: true, recentlyAuthenticated: true, emailVerified: null, createdAt: '2026-09-01T12:00:00Z' }
const brandSettings = { primaryColor: '#6366F1', secondaryColor: '#8B5CF6', fontFamily: 'Inter', subtitleFont: 'Inter Bold', subtitleColor: '#FFFFFF', subtitleBgColor: '#000000', subtitleBgOpacity: 0.7, subtitlePosition: 'bottom', watermarkPosition: 'bottom-right', watermarkOpacity: 0.8, hidePlatformBadge: false }
const brandKit = { ...brandSettings, id: '44444444-4444-4444-8444-444444444444', userId: user.id, logoPath: 'brand/synthetic.png', logoUrl: null, createdAt: profile.createdAt, updatedAt: profile.createdAt }
const clip = { id: clipId, jobId, title: 'Migration sample clip', hookText: 'A useful hook', viralScore: 8.5, scoreReason: 'Clear example', startTime: 0, endTime: 30, duration: 30, filePath: '', fileUrl: null, thumbnailUrl: null, fileSize: 1024, resolution: '1080p', aspectRatio: '9:16', hasSubtitles: true, transcriptText: 'Synthetic transcript.', createdAt: '2026-09-06T12:00:00Z', captionTiktok: null, captionInstagram: null, captionYoutube: null, suggestedHashtags: null }
const job = { id: jobId, status: 'completed', progress: 100, sourceType: 'upload', sourceUrl: null, sourceFilePath: 'fixture.mp4', numClipsRequested: 1, aspectRatio: '9:16', createdAt: clip.createdAt, _count: { clips: 1 } }
const snakeJob = Object.fromEntries(Object.entries(job).map(([key, value]) => [key.replace(/[A-Z]/g, character => `_${character.toLowerCase()}`), value]))
const snakeClip = Object.fromEntries(Object.entries(clip).map(([key, value]) => [key.replace(/[A-Z]/g, character => `_${character.toLowerCase()}`), value]))
const routes = ['/dashboard', '/dashboard/analytics', '/dashboard/clips', `/dashboard/clips/${clipId}`, `/dashboard/clips/${clipId}/edit`, '/dashboard/history', '/dashboard/review', '/dashboard/settings', '/dashboard/billing', '/dashboard/calendar', '/dashboard/brand', '/dashboard/create', '/dashboard/script-generator', `/dashboard/jobs/${jobId}`, '/dashboard/publish', '/pricing', '/login', '/register', '/forgot-password', '/reset-password?token=synthetic-reset', '/activate?token=synthetic-activation']
const consolidatedRoutes = {
  '/dashboard/analytics': '/dashboard/history?tab=analytics',
  '/dashboard/review': '/dashboard/clips?tab=review',
  '/dashboard/billing': '/dashboard/settings?tab=billing',
  '/dashboard/brand': '/dashboard/settings?tab=brand',
  '/dashboard/publish': '/dashboard/calendar'
}
const video = execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x223b70:s=320x180:r=24', '-t', '2', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'], { maxBuffer: 8 * 1024 * 1024 })
const report = []
const output = 'test-results/go-migration'
await mkdir(output, { recursive: true })
async function mock(context, state = { authenticated: true, deletionPending: false }) {
  const calls = []
  await context.route('**/media/synthetic-go.mp4', route => route.fulfill({ status: 200, contentType: 'video/mp4', body: video }))
  await context.route(/\/(?:api|v1)\//, async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    calls.push({ path, method: request.method() })
    const json = (body, status = 200) => route.fulfill({ status, json: body })
    if (path === '/v1/auth/logout') { state.authenticated = false; return route.fulfill({ status: 204 }) }
    if (path === '/v1/auth/login') { state.authenticated = true; return json({ access_token: 'synthetic-access', user }) }
    if (path === '/v1/auth/refresh') return state.authenticated ? json({ access_token: 'synthetic-access', user: { ...user, deletion_pending: state.deletionPending } }) : json({ error: 'unauthorized' }, 401)
    if (path.startsWith('/v1/auth/')) return json({ user, verificationRequired: path.endsWith('/register'), verificationSent: true })
    if (path === '/api/stripe/plans') return json({ creator: { amount: 1900, currency: 'USD' }, pro: { amount: 4900, currency: 'USD' }, agency: { amount: 9900, currency: 'USD' } })
    assert.equal(request.headers().authorization, 'Bearer synthetic-access', `${path} must send access JWT`)
    if (path === '/api/dashboard') return json({ metrics: { activity: [{ date: '2026-09-06', clips: 1, projects: 1 }], statuses: { completed: 1, active: 0, failed: 0, cancelled: 0, other: 0 }, jobCount: 1, clipCount: 1, durationMinutes: 1, credits: 100, plan: 'free' }, recentClips: [clip] })
    if (path === '/api/dashboard/analytics') return json({ jobs: [job], clips: [clip] })
    if (path === '/api/dashboard/history') return json({ jobs: [job] })
    if (path === '/api/dashboard/review') return json({ clips: [{ ...clip, job }] })
    if (path === '/api/clips/library') return json({ clips: [clip], total: 1, currentPage: 1, totalPages: 1 })
    if (path === `/api/clips/${clipId}`) return json({ ...snakeClip, segments: null, source_video_url: '/media/synthetic-go.mp4' })
    if (path === '/api/user/profile') return json({ profile: { ...profile, deletionPending: state.deletionPending } })
    if (path === '/api/user/credits') return json({ credits: 100, plan: 'free' })
    if (path === '/api/user/brand') {
      if (request.method() === 'PUT') assert.deepEqual(request.postDataJSON(), brandSettings, 'Brand saves must send editable settings only, excluding stored resource identifiers')
      return json({ brandKit, plan: 'free' })
    }
    if (path === '/api/stripe/billing') return json({ account: { credits: 100, plan: 'free', hasBillingProfile: false }, subscription: null, invoices: [], providerAvailable: true, checkoutVerification: null })
    if (path === '/api/jobs') return json({ jobs: [{ ...snakeJob, status: 'analyzing', progress: 42, progress_message: 'Inspecting synthetic transcript' }] })
    if (path === `/api/jobs/${jobId}`) return json({ job: snakeJob })
    if (path === '/api/calendar') return json({ posts: [], clips: [], meta: { truncated: false } })
    if (path === '/api/assistant/history') return json({ messages: [] })
    throw new Error(`Unexpected API request ${request.method()} ${path}`)
  })
  return calls
}
try {
  for (const variant of [{ locale: '', viewport: { width: 1440, height: 1000 }, theme: 'light' }, { locale: '/ro', viewport: { width: 390, height: 844 }, theme: 'dark' }]) {
    const context = await browser.newContext({ viewport: variant.viewport, reducedMotion: 'reduce' })
    await context.addInitScript(theme => localStorage.setItem('theme', theme), variant.theme)
    await context.addCookies([{ name: 'NEXT_LOCALE', value: variant.locale ? 'ro' : 'en', url: base }])
    const calls = await mock(context)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    for (const path of routes) {
      const response = await page.goto(`${base}${variant.locale}${path}`, { waitUntil: 'networkidle' })
      assert.equal(response.status(), 200, path)
      await page.locator('h1').first().waitFor({ timeout: 10000 })
      const destination = new URL(`${base}${variant.locale}${consolidatedRoutes[path] ?? path}`)
      assert.equal(new URL(page.url()).pathname, destination.pathname)
      if (consolidatedRoutes[path]) assert.equal(new URL(page.url()).search, destination.search)
      assert.deepEqual(errors, [], `Browser errors on ${path}`)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
      assert.equal(overflow, false, `Horizontal overflow on ${variant.locale}${path}`)
      report.push({ path: `${variant.locale}${path}`, runtimeErrors: 0, overflow: false })
      console.log(`PASS ${variant.locale}${path}`)
    }
    await page.goto(`${base}${variant.locale}/dashboard`)
    await page.locator('[data-testid="studio-dashboard"]').waitFor()
    await page.getByText('fixture.mp4', { exact: true }).waitFor()
    assert.equal(await page.getByRole('progressbar', { name: 'Inspecting synthetic transcript' }).getAttribute('aria-valuenow'), '42')
    await page.screenshot({ path: `${output}/${variant.locale ? 'ro-mobile-dark' : 'en-desktop-light'}.png`, fullPage: true })
    await page.goto(`${base}${variant.locale}/dashboard/brand`)
    await page.getByRole('button', { name: variant.locale ? 'Salvează' : 'Save', exact: true }).click()
    await page.getByRole('button', { name: variant.locale ? 'Salvat' : 'Saved', exact: true }).waitFor()
    assert.ok(calls.some(call => call.path === '/api/user/brand' && call.method === 'PUT'))
    assert.ok(calls.some(call => call.path === '/v1/auth/refresh'))
    await context.close()
  }
  // Exercise the redirect/login and logout behavior through actual browser forms.
  const context = await browser.newContext()
  const state = { authenticated: false, deletionPending: false }
  await mock(context, state)
  const page = await context.newPage()
  await page.goto(`${base}/dashboard/settings`)
  await page.waitForURL('**/login?callbackUrl=*')
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.locator('#password').fill('Synthetic!12345')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.waitForURL('**/dashboard/settings')
  await page.locator('h1').waitFor()
  await page.getByRole('button', { name: 'Preferences', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await page.waitForURL('**/login?callbackUrl=*')
  assert.equal(state.authenticated, false)
  state.authenticated = true
  state.deletionPending = true
  await page.goto(`${base}/dashboard`)
  await page.waitForURL('**/dashboard/settings')
  await page.getByRole('alert').filter({ hasText: 'Account deletion has not finished' }).waitFor()
  await context.close()
  console.log('PASS sign-in redirect, sign-out, and pending-deletion recovery')
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
} finally { await browser.close() }
