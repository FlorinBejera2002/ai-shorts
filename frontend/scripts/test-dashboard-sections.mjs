// Run against a local Next preview. Every API response is synthetic; no database is used.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright')
const base = process.env.SNEEPCUT_UI_ORIGIN ?? 'http://localhost:3010'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
const output = process.env.SNEEPCUT_LAYOUT_ONLY === '1'
  ? 'test-results/dashboard-layout' : 'test-results/dashboard-sections'
// 30 seconds of generated solid graphite video; no real footage or account data.
const videoFixture = await readFile(new URL('./fixtures/studio.mp4', import.meta.url))
await mkdir(output, { recursive: true })
const user = { id: '33333333-3333-4333-8333-333333333333', name: 'Alex', email: 'sections@example.invalid', credits: 100, plan: 'free', access_role: 'member' }
const profile = { ...user, image: null, provider: 'credentials', canChangePassword: true, recentlyAuthenticated: true, emailVerified: null, createdAt: '2026-09-01T12:00:00Z' }
const clip = { id: '11111111-1111-4111-8111-111111111111', title: 'A useful creative moment', hookText: 'A useful hook', viralScore: 8.5, scoreReason: 'Clear example', startTime: 0, endTime: 30, duration: 30, fileUrl: null, thumbnailUrl: null, fileSize: 1024, resolution: '1080p', aspectRatio: '9:16', hasSubtitles: true, transcriptText: 'Synthetic transcript.', createdAt: '2026-09-06T12:00:00Z', captionTiktok: null, captionInstagram: null, captionYoutube: null, suggestedHashtags: null }
const job = { id: '22222222-2222-4222-8222-222222222222', status: 'completed', progress: 100, sourceType: 'upload', sourceUrl: null, sourceFilePath: 'fixture.mp4', numClipsRequested: 1, aspectRatio: '9:16', createdAt: clip.createdAt, _count: { clips: 1 } }
const browser = await chromium.launch({ headless: true })
try {
  for (const locale of (process.env.SNEEPCUT_UI_LOCALES ?? 'en,ro').split(',')) {
    assert.ok(['en', 'ro'].includes(locale))
    const prefix = locale === 'en' ? '' : '/ro'
    const messages = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8'))
    const context = await browser.newContext({ viewport: { width: locale === 'en' ? 1440 : 390, height: 1000 }, reducedMotion: 'reduce' })
    await context.route('**/__fixtures__/studio.mp4', route => route.fulfill({ contentType: 'video/mp4', body: videoFixture }))
    await context.addInitScript(() => localStorage.setItem('theme', 'light'))
    await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: base }])
    let pendingDeletion = false
    const calls = []
    const unexpected = []
    await context.route(/\/(?:api|v1)\//, async route => {
      const url = new URL(route.request().url())
      const path = url.pathname
      calls.push(path + url.search)
      let data
      if (path === '/v1/auth/refresh') data = { access_token: 'synthetic', user: { ...user, deletion_pending: pendingDeletion } }
      else if (path === '/api/dashboard') data = { metrics: { activity: [{ date: '2026-09-06', clips: 1, projects: 1 }], statuses: { completed: 1, active: 0, failed: 0, cancelled: 0, other: 0 }, jobCount: 1, clipCount: 1, durationMinutes: 1, credits: 100, plan: 'free' }, recentClips: [clip] }
      else if (path === '/api/dashboard/history') data = { jobs: [job] }
      else if (path === '/api/dashboard/analytics') data = { jobs: [job], clips: [clip] }
      else if (path === '/api/dashboard/review') data = { clips: [{ ...clip, job }] }
      else if (path === '/api/clips/library') data = { clips: [clip], total: 1, currentPage: 1, totalPages: 1 }
      else if (path === `/api/clips/${clip.id}`) data = { id: clip.id, title: clip.title, hook_text: null, viral_score: 8, score_reason: null, duration: 30, resolution: '1080x1920', aspect_ratio: '9:16', has_subtitles: false, transcript_text: 'Synthetic transcript', file_url: null, created_at: clip.createdAt, start_time: 0, end_time: 30, segments: [{ start: 0, end: 30 }], source_video_url: `${base}/__fixtures__/studio.mp4`, caption_tiktok: null, caption_instagram: null, caption_youtube: null, suggested_hashtags: null }
      else if (path === `/api/jobs/${job.id}`) data = { job: { id: job.id, status: 'rendering', progress: 68, progress_message: 'Rendering synthetic clip', error_message: null }, celery_state: null, celery_meta: null }
      else if (path === '/api/user/profile') data = { profile: { ...profile, deletionPending: pendingDeletion } }
      else if (path === '/api/user/brand') data = { brandKit: null, plan: 'free' }
      else if (path === '/api/user/credits') data = { credits: 100, plan: 'free' }
      else if (path === '/api/stripe/plans') data = { creator: { amount: 1900, currency: 'USD' }, pro: { amount: 4900, currency: 'USD' }, agency: { amount: 9900, currency: 'USD' } }
      else if (path === '/api/stripe/billing') data = { account: { credits: 100, plan: 'free', hasBillingProfile: false }, subscription: null, invoices: [], providerAvailable: false, checkoutVerification: null }
      else if (path === '/api/jobs') data = { jobs: [] }
      else if (path === '/api/calendar') data = { posts: [], clips: [], meta: { truncated: false } }
      else if (path === '/api/publishing') data = { providers: [], accounts: [], clips: [], posts: [] }
      else if (path === '/api/assistant/history') data = { messages: [] }
      else { unexpected.push(path); return route.abort() }
      await route.fulfill({ json: data })
    })
    const page = await context.newPage()
    page.setDefaultNavigationTimeout(120000)
    page.setDefaultTimeout(60000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    async function capturePage(name) {
      const layout = await page.evaluate(() => {
        const main = document.querySelector('#dashboard-main').getBoundingClientRect()
        const shell = document.querySelector('.studio-page').getBoundingClientRect()
        const nav = document.querySelector('.studio-section-tabs')
        const topbar = document.querySelector('.studio-topbar').getBoundingClientRect()
        return {
          fillsWidth: Math.abs(main.width - shell.width) < 1,
          navInTopbar: !nav || !!nav.closest('.studio-topbar'),
          tabsFit: !nav || nav.scrollWidth <= nav.clientWidth + 1,
          navCentered: !nav || Math.abs(
            nav.getBoundingClientRect().x + nav.getBoundingClientRect().width / 2 - topbar.x - topbar.width / 2
          ) < 1,
          topbarHeight: topbar.height,
          noContentTabs: !document.querySelector('#dashboard-main .studio-section-tabs')
        }
      })
      assert.equal(layout.fillsWidth, true, `${name}: content uses available width`)
      assert.equal(layout.navInTopbar, true, `${name}: tabs share the top bar`)
      assert.equal(layout.tabsFit, true, `${name}: every tab fits without horizontal scrolling`)
      assert.equal(layout.navCentered, true, `${name}: tabs are centered`)
      assert.equal(layout.noContentTabs, true, `${name}: no separate tab row`)
      assert.ok(layout.topbarHeight <= 64, `${name}: top bar stays compact`)
      await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
      await page.screenshot({ path: `${output}/${locale}-${name}-light.png`, fullPage: true })
      await page.evaluate(() => document.documentElement.classList.add('dark'))
      await page.waitForFunction(() => [...document.images].filter(image => image.getClientRects().length).every(image => image.complete))
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.screenshot({ path: `${output}/${locale}-${name}-dark.png`, fullPage: true })
      await page.evaluate(() => document.documentElement.classList.remove('dark'))
    }
    async function go(path) {
      console.log(`Checking ${locale}: ${path}`)
      await page.goto(`${base}${prefix}${path}`, { waitUntil: 'networkidle' })
      await page.locator('main h1').waitFor().catch(async error => {
        console.log({ url: page.url(), body: await page.locator('body').innerText(), errors, calls: calls.slice(-8) })
        await page.screenshot({ path: `${output}/failure.png`, fullPage: true })
        throw error
      })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, path)
      assert.deepEqual(errors, [], path)
      await capturePage(path.replace('/dashboard', 'workspace').replaceAll(/[^a-z0-9-]/gi, '-'))
    }
    if (process.env.SNEEPCUT_LAYOUT_ONLY === '1') {
      await page.setViewportSize({ width: locale === 'en' ? 1920 : 390, height: 1000 })
      for (const route of ['/dashboard/clips', '/dashboard/settings', '/dashboard/script-generator']) {
        await go(route)
      }
      assert.deepEqual(unexpected, [])
      console.log(`PASS ${locale}: full width layout, compact topbar navigation, no content tab row`)
      await context.close()
      continue
    }
    await go('/dashboard')
    if (locale === 'ro') await page.getByRole('button', { name: messages.nav.openMenu, exact: true }).click()
    assert.equal(await page.locator('#dashboard-navigation a').count(), 7)
    assert.deepEqual(await page.locator('#dashboard-navigation a').allTextContents(),
      ['home', 'clips', 'history', 'calendar', 'publish', 'scripts', 'settings'].map(key => messages.nav[key]))
    if (locale === 'ro') await page.keyboard.press('Escape')

    for (const [route, key, title] of [['publish', 'publish', messages.publishing.title], ['script-generator', 'scripts', messages.scriptGenerator.title]]) {
      if (locale === 'ro') await page.getByRole('button', { name: messages.nav.openMenu, exact: true }).click()
      await page.locator('#dashboard-navigation').getByRole('link', { name: messages.nav[key], exact: true }).click()
      await page.waitForURL(`**${prefix}/dashboard/${route}`)
      await page.getByRole('heading', { name: title, exact: true }).waitFor()
      assert.equal(new URL(page.url()).pathname, `${prefix}/dashboard/${route}`)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.screenshot({ path: `${output}/${locale}-${route}.png`, fullPage: true })
      await capturePage(route)
    }
    if (process.env.SNEEPCUT_FOCUS_STANDALONE === '1') {
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpected, [])
      console.log(`PASS ${locale}: separate Publish and Scripts pages, sidebar links, no overflow or runtime errors`)
      await context.close()
      continue
    }
    await go('/dashboard/clips?search=creative')
    const clipNav = page.getByRole('navigation', { name: messages.dashboardSections.clips, exact: true })
    await clipNav.getByRole('link', { name: messages.dashboardSections.review, exact: true }).click()
    await page.waitForURL(`**${prefix}/dashboard/clips?tab=review`)
    await page.getByRole('heading', { name: messages.review.title, exact: true }).waitFor()
    const reviewHeroAction = page.locator('.studio-workbench-header .clips-create-action')
    assert.equal(await reviewHeroAction.getAttribute('href'), `${prefix}/dashboard/create`)
    assert.equal(await reviewHeroAction.locator('svg').count(), 1)
    assert.equal(await reviewHeroAction.evaluate(element => getComputedStyle(element).height), '44px')
    assert.equal(await clipNav.getByRole('link', { name: messages.dashboardSections.review, exact: true }).getAttribute('aria-current'), 'page')
    const reviewControls = page.locator('.media-controls')
    await reviewControls.getByRole('button', { name: messages.review.readyToPost, exact: true }).click()
    const readyCount = await page.locator(`main a[href$="/clips/${clip.id}"]`).count()
    await reviewControls.getByRole('button', { name: messages.review.needsReview, exact: true }).click()
    assert.equal(readyCount + await page.locator(`main a[href$="/clips/${clip.id}"]`).count(), 1)
    await reviewControls.getByRole('button', { name: messages.review.totalClips, exact: true }).click()
    await page.goBack({ waitUntil: 'networkidle' })
    assert.equal(new URL(page.url()).searchParams.get('search'), 'creative')
    await page.getByRole('heading', { name: messages.clips.title, exact: true }).waitFor()

    for (const [old, destination, section, tab] of [
      ['review', '/dashboard/clips?tab=review', 'clips', 'review'],
      ['analytics', '/dashboard/history?tab=analytics', 'projects', 'analytics'],
      ['brand', '/dashboard/settings?tab=brand', 'settings', 'brand'],
      ['billing?success=true&session_id=cs_synthetic', '/dashboard/settings?success=true&session_id=cs_synthetic&tab=billing', 'settings', 'billing']
    ]) {
      await go(`/dashboard/${old}`)
      const expected = new URL(`${base}${prefix}${destination}`)
      const actual = new URL(page.url())
      assert.equal(actual.pathname, expected.pathname)
      assert.deepEqual([...actual.searchParams], [...expected.searchParams])
      if (section) {
        const nav = page.getByRole('navigation', { name: messages.dashboardSections[section], exact: true })
        assert.equal(await nav.getByRole('link', { name: messages.dashboardSections[tab], exact: true }).getAttribute('aria-current'), 'page')
      }
      console.log(`PASS ${locale}: ${old} -> ${actual.pathname}${actual.search}`)
    }
    assert.ok(calls.some(url => url.includes('/api/stripe/billing?') && url.includes('session_id=cs_synthetic')))
    assert.ok(calls.filter(url => url.startsWith('/api/stripe/billing?')).every(url => !new URL(url, base).searchParams.has('tab')))
    await go('/dashboard/settings?tab=invalid')
    const settingsNav = page.getByRole('navigation', { name: messages.dashboardSections.settings, exact: true })
    assert.equal(await settingsNav.getByRole('link', { name: messages.dashboardSections.account, exact: true }).getAttribute('aria-current'), 'page')
    await settingsNav.getByRole('link', { name: messages.dashboardSections.brand, exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.waitForURL('**/dashboard/settings?tab=brand')
    await page.getByRole('heading', { name: messages.brand.title, exact: true }).waitFor()
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0) })
    await page.screenshot({ path: `${output}/${locale}-settings.png`, fullPage: true })

    await go('/dashboard/create')
    for (const mode of ['youtube', 'batch', 'upload']) {
      const sourceTab = page.getByRole('tab', { name: messages.create[mode], exact: true })
      await sourceTab.click()
      assert.equal(await sourceTab.getAttribute('aria-selected'), 'true')
      assert.equal(await page.getByRole('tabpanel').count(), 1)
    }
    await page.getByRole('link', { name: messages.dashboardSections.writeScript, exact: true }).click()
    await page.waitForURL('**/dashboard/script-generator')
    await page.getByRole('link', { name: messages.dashboardSections.backToCreate, exact: true }).click()
    await page.waitForURL('**/dashboard/create')
    await go('/dashboard/clips')
    await page.screenshot({ path: `${output}/${locale}-clips.png`, fullPage: true })
    await go('/dashboard/publish')
    await go('/dashboard/history')
    const projectSearch = page.getByRole('searchbox', { name: locale === 'ro' ? 'Caută proiecte' : 'Search projects' })
    await projectSearch.fill('no-such-source')
    assert.equal(await page.getByText('fixture.mp4', { exact: true }).count(), 0)
    await projectSearch.fill('')
    await page.locator('.media-controls').getByRole('button', { name: messages.dashboard.studio.failed, exact: true }).click()
    assert.equal(await page.getByText('fixture.mp4', { exact: true }).count(), 0)
    await page.locator('.media-controls').getByRole('button', { name: messages.dashboard.studio.completed, exact: true }).click()
    assert.equal(await page.getByText('fixture.mp4', { exact: true }).count(), 1)
    await go(`/dashboard/jobs/${job.id}`)
    await go(`/dashboard/clips/${clip.id}`)
    await page.goto(`${base}${prefix}/dashboard/clips/${clip.id}/edit`, { waitUntil: 'networkidle' })
    await page.locator('[data-export-trigger]').waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'editor overflow')
    await capturePage('clip-editor')

    pendingDeletion = true
    await go('/dashboard/settings?tab=billing')
    await page.waitForURL(`${base}${prefix}/dashboard/settings`)
    assert.equal(await page.getByRole('navigation', { name: messages.dashboardSections.settings, exact: true }).getByRole('link').count(), 1)
    assert.deepEqual(errors, [])
    assert.deepEqual(unexpected, [])
    console.log(`PASS ${locale}: seven destinations, contextual links, tab keyboard/back navigation, checkout query preservation, deletion-pending guard, no overflow or runtime errors`)
    await context.close()
  }
} finally { await browser.close() }
