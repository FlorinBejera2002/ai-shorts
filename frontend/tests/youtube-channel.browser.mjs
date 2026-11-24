import assert from 'node:assert/strict'
import { mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Browser flows for the YouTube path of Create against an in-page fake API (no backend, no Google).
// The only source is the connected channel's list: multi-select, the selection request, the
// consent return and the import progress card. Run from frontend/ with PLAYWRIGHT_MODULE, TEST_ORIGIN.

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to the installed Playwright entry point')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5173'
const scratch = resolve('.cache/tmp/youtube-channel')
const output = resolve('frontend/test-results/youtube-channel')
const report = []

const user = {
  id: '00000000-0000-4000-8000-000000000081',
  email: 'youtube-channel@example.invalid',
  name: 'Channel fixture',
  credits: 1000,
  plan: 'free',
  access_role: 'member'
}

const CONSENT_URL = 'https://accounts.google.com/o/oauth2/v2/auth?scope=portability&state=synthetic'

const ALL_VIDEOS = [
  { id: 'maraep13aaa', title: 'Interviu cu Mara, episodul 13', duration_seconds: 2892, published_at: '2026-11-12T10:00:00Z', visibility: 'public', thumbnail_url: 'https://img.youtube.com/vi/maraep13aaa/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=maraep13aaa' },
  { id: 'vlogstudio1', title: 'Vlog: o zi la studio', duration_seconds: 1120, published_at: '2026-11-04T10:00:00Z', visibility: 'public', thumbnail_url: null, url: 'https://www.youtube.com/watch?v=vlogstudio1' },
  { id: 'maraep12aaa', title: 'Interviu cu Mara, episodul 12', duration_seconds: 3125, published_at: '2026-10-29T10:00:00Z', visibility: 'unlisted', thumbnail_url: 'https://img.youtube.com/vi/maraep12aaa/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=maraep12aaa' },
  { id: 'tutorial0aaa', title: 'Cum îmi editez clipurile', duration_seconds: 1351, published_at: '2026-10-21T10:00:00Z', visibility: 'private', thumbnail_url: null, url: 'https://www.youtube.com/watch?v=tutorial0aaa' }
]
const MANY_VIDEOS = Array.from({ length: 12 }, (_, index) => ({
  id: `many${String(index).padStart(2, '0')}aaa`,
  title: `Episod ${index + 1} din seria lunară`,
  duration_seconds: 900 + index,
  published_at: '2026-11-01T10:00:00Z',
  visibility: 'public',
  thumbnail_url: null,
  url: `https://www.youtube.com/watch?v=many${String(index).padStart(2, '0')}aaa`
}))
const DEFAULT_PAGE_SIZE = 10
const SMALL_THUMB = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="#5b3a1e"/></svg>'

function filterVideos(videos, query, visibility) {
  return videos.filter((video) => {
    if (visibility !== 'all' && video.visibility !== visibility) return false
    if (query && !video.title.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })
}

function progressItem(videoId, title, status, jobId = null, thumbnail = '') {
  return { video_id: videoId, title, thumbnail_url: thumbnail, status, job_id: jobId, error: '' }
}

/**
 * Fake API. `selection` is the response queue for POST /api/youtube/imports/selection (the last
 * entry repeats). `imports` is the queue for GET /api/youtube/imports (the last entry repeats).
 */
async function fixtures(page, overrides = {}, theme = 'light') {
  const state = {
    enabled: true,
    connected: true,
    videos: ALL_VIDEOS,
    videoListFails: false,
    pageSize: DEFAULT_PAGE_SIZE,
    selection: [{ status: 200, body: { import_id: 'import-1', url: CONSENT_URL } }],
    imports: [{ imports: [] }],
    ...overrides
  }
  const calls = { connects: [], disconnects: [], videoQueries: [], selections: [], importReads: 0, jobs: [] }
  const errors = []
  let selectionIndex = 0
  let importIndex = 0
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript((value) => localStorage.setItem('theme', value), theme)
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return route.continue()
    if (url.hostname === 'accounts.google.com') return route.fulfill({ contentType: 'text/html', body: '<p>Synthetic Google page</p>' })
    if (url.hostname === 'img.youtube.com') return route.fulfill({ contentType: 'image/svg+xml', body: SMALL_THUMB })
    return route.abort('blockedbyclient')
  })
  await page.route('**/v1/**', (route) => route.fulfill({ json: { access_token: 'synthetic-token', user } }))
  await page.route('**/api/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const method = request.method()
    const reply = (json, status = 200) => route.fulfill({ json, status })
    if (path === '/api/user/credits') return reply({ credits: user.credits })
    if (path === '/api/user/brand') return reply({ brandKit: null })
    if (path === '/api/media-capabilities') return reply({ audio_cleanup: { available: true } })
    if (path === '/api/workspace-agent/runs') return reply({ runs: [], has_more: false })
    if (path === '/api/workspace-agent/suggestions') return reply({ suggestions: [], capabilities: [] })
    if (path === '/api/youtube/channel' && method === 'GET') {
      return reply({
        enabled: state.enabled,
        connected: state.connected,
        account: state.connected ? { channel_id: 'UCfixture', title: 'Ana Creator', avatar_url: null } : null
      })
    }
    if (path === '/api/youtube/channel' && method === 'DELETE') {
      calls.disconnects.push(true)
      state.connected = false
      return route.fulfill({ status: 204 })
    }
    if (path === '/api/youtube/channel/connect') {
      calls.connects.push(request.postDataJSON())
      return reply({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=synthetic' })
    }
    if (path === '/api/youtube/channel/videos') {
      const query = url.searchParams.get('q') ?? ''
      const visibility = url.searchParams.get('visibility') ?? 'all'
      const pageToken = url.searchParams.get('page_token')
      calls.videoQueries.push({ q: query, visibility, page_token: pageToken })
      if (state.videoListFails) return reply({ error: 'Synthetic outage' }, 503)
      if (!state.connected) return reply({ error: 'not_connected' }, 409)
      const matching = filterVideos(state.videos, query, visibility)
      const start = pageToken ? Number(pageToken) : 0
      const pageVideos = matching.slice(start, start + state.pageSize)
      const next = start + state.pageSize < matching.length ? String(start + state.pageSize) : null
      return reply({ videos: pageVideos, next_page_token: next })
    }
    if (path === '/api/youtube/imports/selection' && method === 'POST') {
      calls.selections.push(request.postDataJSON())
      const entry = state.selection[Math.min(selectionIndex, state.selection.length - 1)]
      selectionIndex += 1
      return reply(entry.body, entry.status)
    }
    if (path === '/api/youtube/imports' && method === 'GET') {
      calls.importReads += 1
      const entry = state.imports[Math.min(importIndex, state.imports.length - 1)]
      importIndex += 1
      return reply(entry)
    }
    return reply({})
  })
  return { state, calls, errors }
}

async function openYouTube(page, suffix = '', locale = '') {
  await page.goto(`${origin}${locale}/dashboard/create?mode=youtube${suffix}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.getByTestId('creation-source-media').or(page.getByTestId('youtube-import-progress')).first().waitFor()
}

async function openLibrary(page, suffix = '', locale = '') {
  await openYouTube(page, suffix, locale)
  await page.locator('.yt-library-row').first().waitFor()
}

function row(page, title) {
  return page.getByRole('checkbox', { name: new RegExp(title) })
}

/** Generate stays disabled until the Google export disclosure is ticked, so every flow ticks it first. */
async function agreeToImport(page) {
  await page.getByRole('checkbox', { name: /chosen videos are exported/ }).check({ force: true })
}

async function assertNoOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal page overflow')
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
await mkdir(output, { recursive: true })
await mkdir(scratch, { recursive: true })

try {
  // 1. Connect gate: consent gates the connect action, then the Google redirect is requested with consent.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const fixture = await fixtures(page, { connected: false })
    try {
      await page.goto(`${origin}/dashboard/create?mode=youtube`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.getByRole('heading', { name: 'Connect your YouTube account', exact: true }).waitFor()
      const connect = page.getByRole('button', { name: 'Connect YouTube', exact: true })
      const consent = page.getByRole('checkbox', { name: /I agree to the/ })
      assert.equal(await consent.isChecked(), true, 'The canvas ships with the privacy consent ticked')
      await consent.uncheck()
      assert.equal(await connect.isDisabled(), true, 'Connect is disabled until the privacy consent is given')
      assert.equal(await page.getByRole('link', { name: 'Privacy policy', exact: true }).getAttribute('href'), '/privacy')
      await consent.check()
      await page.screenshot({ path: resolve(output, 'connect-gate-desktop.png'), fullPage: true })
      await connect.click()
      await page.waitForURL('https://accounts.google.com/**')
      assert.deepEqual(fixture.calls.connects, [{ locale: 'en', consent: true }])
      assert.deepEqual(fixture.errors, [])
      report.push({ connectGate: 'consent gates connect; redirect carries locale and consent' })
    } finally {
      await page.close()
    }
  }

  // 1b. While disconnected the connect gate is the whole card: no source list, no library request.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const fixture = await fixtures(page, { connected: false })
    try {
      await page.goto(`${origin}/dashboard/create?mode=youtube&source=library`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.getByRole('heading', { name: 'Connect your YouTube account', exact: true }).waitFor()
      assert.equal(await page.getByRole('region', { name: 'Source video', exact: true }).count(), 0, 'No source list while disconnected')
      assert.equal(fixture.calls.videoQueries.length, 0, 'No library request is made while disconnected')
      fixture.state.connected = true
      await page.goto(`${origin}/dashboard/create?mode=youtube&youtubeChannel=success`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await row(page, 'Interviu cu Mara, episodul 13').waitFor()
      assert.deepEqual(fixture.errors, [])
      report.push({ disconnectedGate: 'connect gate replaces the list while disconnected; the callback opens the list' })
    } finally {
      await page.close()
    }
  }

  // 2. Callback: success and error toasts, the parameter is stripped and other query state survives.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await fixtures(page)
    try {
      await openYouTube(page, '&youtubeChannel=success&preserved=yes')
      await page.getByText('YouTube account connected.', { exact: true }).waitFor()
      const search = new URL(page.url()).searchParams
      assert.equal(search.has('youtubeChannel'), false, 'The callback result is consumed')
      assert.equal(search.get('preserved'), 'yes', 'Other query state is preserved')
    } finally {
      await page.close()
    }
    const failed = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await fixtures(failed)
    try {
      await openYouTube(failed, '&youtubeChannel=error')
      await failed.getByText("We couldn't connect your YouTube account. Try again.", { exact: true }).waitFor()
      assert.equal(new URL(failed.url()).searchParams.has('youtubeChannel'), false)
      report.push({ callbackToasts: 'success and error toasts; param stripped; other params kept' })
    } finally {
      await failed.close()
    }
  }

  // 3. Multi-select: up to ten videos, private videos disabled, search and filters keep the choice.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const fixture = await fixtures(page, { videos: MANY_VIDEOS, pageSize: 20 })
    try {
      await openLibrary(page)
      await Promise.all([
        page.waitForResponse((response) => response.url().includes('q=Episod+1') || response.url().includes('q=Episod%201')),
        page.getByRole('searchbox', { name: 'Search your videos', exact: true }).fill('Episod 1 ')
      ])
      await row(page, 'Episod 1 din seria').waitFor()
      assert.ok(fixture.calls.videoQueries.some((call) => call.q === 'Episod 1'), 'Search sends q')
      await page.getByRole('searchbox', { name: 'Search your videos', exact: true }).fill('')
      await row(page, 'Episod 1 din seria').click()
      await row(page, 'Episod 2 din seria').click()
      assert.equal(await row(page, 'Episod 1 din seria').getAttribute('aria-checked'), 'true')
      await agreeToImport(page)
      assert.equal(await page.getByRole('button', { name: 'Process 2 videos', exact: true }).isEnabled(), true)
      for (let index = 3; index <= 10; index += 1) await row(page, `Episod ${index} din seria`).click()
      assert.equal(await page.getByRole('button', { name: 'Process 10 videos', exact: true }).isEnabled(), true)
      await row(page, 'Episod 11 din seria').waitFor()
      assert.equal(await row(page, 'Episod 11 din seria').isDisabled(), true, 'The eleventh video is disabled at the cap')
      await page.screenshot({ path: resolve(output, 'library-cap-desktop.png'), fullPage: true })
      await row(page, 'Episod 2 din seria').click()
      assert.equal(await row(page, 'Episod 11 din seria').isDisabled(), false, 'Removing one re-opens the cap')
      report.push({ multiSelect: 'choose up to ten; the eleventh is disabled until one is removed' })
    } finally {
      await page.close()
    }
  }

  // 4. Private videos are disabled rows and never selectable; the visibility filter maps to the query.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const fixture = await fixtures(page, { pageSize: 2 })
    try {
      await openLibrary(page)
      await page.getByRole('radiogroup', { name: 'Visibility', exact: true }).getByRole('radio', { name: 'Private', exact: true }).click()
      await row(page, 'Cum îmi editez clipurile').waitFor()
      assert.equal(await row(page, 'Cum îmi editez clipurile').isDisabled(), true, 'Private videos are disabled')
      assert.ok(fixture.calls.videoQueries.some((call) => call.visibility === 'private'), 'Visibility filter maps to private')
      await page.getByRole('radiogroup', { name: 'Visibility', exact: true }).getByRole('radio', { name: 'All', exact: true }).click()
      await row(page, 'Interviu cu Mara, episodul 13').waitFor()
      await page.getByRole('button', { name: 'Load more', exact: true }).click()
      await row(page, 'Interviu cu Mara, episodul 12').waitFor()
      assert.ok(fixture.calls.videoQueries.some((call) => call.page_token === '2'), 'Load more requests the next page token')
      report.push({ privateDisabled: 'private rows disabled; filters and paging keep the query contract' })
    } finally {
      await page.close()
    }
  }

  // 5. Generate sends the chosen ids with the job options, then leaves for Google's consent page.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const fixture = await fixtures(page)
    try {
      await openLibrary(page)
      await row(page, 'Interviu cu Mara, episodul 12').click()
      await row(page, 'Vlog: o zi la studio').click()
      await agreeToImport(page)
      await page.getByRole('button', { name: 'Process 2 videos', exact: true }).click()
      await page.waitForURL('https://accounts.google.com/**')
      assert.equal(fixture.calls.selections.length, 1)
      const body = fixture.calls.selections[0]
      assert.deepEqual(body.video_ids, ['maraep12aaa', 'vlogstudio1'])
      assert.equal(body.consent, true)
      assert.equal(body.locale, 'en')
      assert.equal(body.job.num_clips_requested, 0, 'Auto is the default clip count')
      assert.equal(body.job.aspect_ratio, '9:16')
      assert.equal(body.job.subtitle_style, 'bold', 'Canvas default subtitle style is Bold')
      assert.equal(body.job.burn_subtitles, true)
      assert.equal('source_type' in body.job, false, 'The job options carry no source fields')
      assert.equal('source_url' in body.job, false)
      assert.deepEqual(fixture.errors, [])
      report.push({ generate: 'POST selection with ids, consent, locale and job options; redirect to consent' })
    } finally {
      await page.close()
    }
  }

  // 6. Refusals: 422 disables the named rows with a toast, 402 shows the limit state, 409/429/503 toast.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const fixture = await fixtures(page, {
      selection: [{ status: 422, body: { error: 'Some selected videos are private or not on your connected channel.', video_ids: ['maraep12aaa'] } }]
    })
    try {
      await openLibrary(page)
      await row(page, 'Interviu cu Mara, episodul 12').click()
      await row(page, 'Vlog: o zi la studio').click()
      await agreeToImport(page)
      await page.getByRole('button', { name: 'Process 2 videos', exact: true }).click()
      await page.getByText('Some videos are private or no longer on your channel. They can\'t be chosen.', { exact: true }).waitFor()
      assert.equal(await row(page, 'Interviu cu Mara, episodul 12').isDisabled(), true, 'The refused row is disabled')
      assert.equal(await row(page, 'Vlog: o zi la studio').getAttribute('aria-checked'), 'true', 'Other choices stay selected')
      assert.equal(fixture.calls.selections.length, 1)
      report.push({ refused422: 'named rows disabled with a toast; other choices kept' })
    } finally {
      await page.close()
    }
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await fixtures(page, { selection: [{ status: 402, body: { error: 'Insufficient credits' } }] })
    try {
      await openLibrary(page)
      await row(page, 'Vlog: o zi la studio').click()
      await agreeToImport(page)
      await page.getByRole('button', { name: 'Generate clips', exact: true }).click()
      const limit = page.getByRole('alert').filter({ hasText: "You've reached your monthly limit" })
      await limit.waitFor()
      assert.equal(await page.getByRole('link', { name: 'View plans', exact: true }).getAttribute('href'), '/dashboard/billing')
      assert.equal(await page.getByRole('button', { name: 'Generate clips', exact: true }).count(), 0, 'Generate is replaced by the limit state')
      await page.screenshot({ path: resolve(output, 'limit-desktop.png'), fullPage: true })
      await page.setViewportSize({ width: 390, height: 844 })
      await assertNoOverflow(page)
      report.push({ limit: '402 replaces generate with the limit state' })
    } finally {
      await page.close()
    }
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const fixture = await fixtures(page, { selection: [{ status: 409, body: { error: 'Connect your YouTube channel before choosing videos.' } }] })
    try {
      await openLibrary(page)
      await row(page, 'Vlog: o zi la studio').click()
      fixture.state.connected = false
      await agreeToImport(page)
      await page.getByRole('button', { name: 'Generate clips', exact: true }).click()
      await page.getByRole('heading', { name: 'Connect your YouTube account', exact: true }).waitFor()
      report.push({ connectRefusal: '409 connect shows the connect gate' })
    } finally {
      await page.close()
    }
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const fixture = await fixtures(page, {
      selection: [{ status: 409, body: { error: 'A YouTube import is already in progress.' } }],
      imports: [{ imports: [{ id: 'import-0', selection: { items: [progressItem('vlogstudio1', 'Vlog: o zi la studio', 'importing')] } }] }]
    })
    try {
      await openLibrary(page)
      await row(page, 'Vlog: o zi la studio').click()
      await agreeToImport(page)
      await page.getByRole('button', { name: 'Generate clips', exact: true }).click()
      await page.getByText('A YouTube import is already in progress.', { exact: true }).waitFor()
      await page.getByTestId('youtube-import-progress').waitFor()
      assert.ok(fixture.calls.importReads > 0)
      report.push({ activeRefusal: '409 active shows the toast and the progress card' })
    } finally {
      await page.close()
    }
  }

  for (const [status, body, message] of [
    [429, { error: 'Import budget exceeded' }, 'You started too many imports. Try again later.'],
    [502, { error: 'Channel lookup failed' }, 'YouTube import is unavailable right now.'],
    [503, { error: 'Disabled' }, 'YouTube import is unavailable right now.']
  ]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await fixtures(page, { selection: [{ status, body }] })
    try {
      await openLibrary(page)
      await row(page, 'Vlog: o zi la studio').click()
      await agreeToImport(page)
      await page.getByRole('button', { name: 'Generate clips', exact: true }).click()
      await page.getByText(message, { exact: true }).waitFor()
      report.push({ [`refusal${status}`]: message })
    } finally {
      await page.close()
    }
  }

  // 7. Return from Google with success: progress card, polling until settled, job link, then back to the list.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const importing = {
      id: 'import-1',
      status: 'importing',
      error: '',
      selection: {
        items: [
          progressItem('maraep12aaa', 'Interviu cu Mara, episodul 12', 'importing'),
          progressItem('vlogstudio1', 'Vlog: o zi la studio', 'waiting')
        ]
      }
    }
    const settled = {
      id: 'import-1',
      status: 'ready',
      error: '',
      selection: {
        items: [
          progressItem('maraep12aaa', 'Interviu cu Mara, episodul 12', 'processing', '00000000-0000-4000-8000-000000000090'),
          progressItem('vlogstudio1', 'Vlog: o zi la studio', 'missing')
        ]
      }
    }
    // The card reads the moving list for the first responses, then the settled one.
    const fixture = await fixtures(page, { imports: [{ imports: [importing] }, { imports: [importing] }, { imports: [importing] }, { imports: [settled] }] })
    try {
      await openYouTube(page, '&youtubeImport=success')
      await page.getByTestId('youtube-import-progress').waitFor()
      await page.getByRole('heading', { name: 'Importing your videos', exact: true }).waitFor()
      assert.equal(await page.getByRole('button', { name: 'Choose other videos', exact: true }).count(), 0, 'No way back while items move')
      await page.screenshot({ path: resolve(output, 'progress-mixed-desktop.png'), fullPage: true })
      // One item is missing, so the settled card reads as partial rather than as a clean success.
      await page.getByRole('heading', { name: "Some videos couldn't be imported", exact: true }).waitFor({ timeout: 40000 })
      const processing = page.getByRole('link', { name: /Interviu cu Mara, episodul 12/ })
      assert.equal(await processing.getAttribute('href'), '/dashboard/jobs/00000000-0000-4000-8000-000000000090')
      assert.ok(fixture.calls.importReads >= 2, 'The card polls until every item settles')
      await page.getByRole('button', { name: 'Choose other videos', exact: true }).click()
      await row(page, 'Interviu cu Mara, episodul 13').waitFor()
      assert.equal(new URL(page.url()).searchParams.has('youtubeImport'), false, 'The return parameter is stripped')
      await page.setViewportSize({ width: 390, height: 844 })
      await assertNoOverflow(page)
      report.push({ successReturn: 'progress card with mixed states polls to settled, job link and way back' })
    } finally {
      await page.close()
    }
  }

  // 8. Failed and unavailable returns: a toast and the form, with the parameter removed.
  for (const [result, message] of [
    ['failed', "The import couldn't start. Try again."],
    ['unavailable', 'YouTube import is unavailable right now.']
  ]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await fixtures(page)
    try {
      await openYouTube(page, `&youtubeImport=${result}`)
      await page.getByText(message, { exact: true }).waitFor()
      await row(page, 'Interviu cu Mara, episodul 13').waitFor()
      assert.equal(new URL(page.url()).searchParams.has('youtubeImport'), false)
      report.push({ [`return_${result}`]: 'toast and the form; parameter stripped' })
    } finally {
      await page.close()
    }
  }

  // 9. Romanian copy and dark-mode colours: the selected mark uses the steel token with a dark label.
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await fixtures(page, {}, 'dark')
    try {
      await openLibrary(page, '', '/ro')
      await page.getByRole('button', { name: 'Generează clipuri', exact: true }).waitFor()
      await page.locator('.yt-library-row').first().click()
      const mark = page.locator('.yt-library-row[data-selected] .yt-check-mark').first()
      await mark.waitFor()
      const selectedMark = await mark.evaluate((node) => getComputedStyle(node).backgroundColor)
      assert.equal(selectedMark, 'rgb(142, 155, 176)', 'Dark selected mark is the steel token')
      report.push({ romanianDark: 'Romanian primary label; dark selected mark is steel' })
    } finally {
      await page.close()
    }
  }

  // 10. Mobile 390px: the form and the progress card have no horizontal overflow.
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    await fixtures(page, {
      imports: [{ imports: [{ id: 'import-1', selection: { items: [progressItem('vlogstudio1', 'Vlog: o zi la studio', 'processing', '00000000-0000-4000-8000-000000000091')] } }] }]
    })
    try {
      await openYouTube(page)
      await page.getByRole('button', { name: 'Generate clips', exact: true }).waitFor()
      await assertNoOverflow(page)
      await page.goto(`${origin}/dashboard/create?mode=youtube&youtubeImport=success`, { waitUntil: 'domcontentloaded', timeout: 180000 })
      await page.getByTestId('youtube-import-progress').waitFor()
      await assertNoOverflow(page)
      report.push({ mobile: 'form and progress card have no horizontal overflow at 390px' })
    } finally {
      await page.close()
    }
  }

  console.log(JSON.stringify({ suite: 'youtube-channel', status: 'passed', checks: report }, null, 2))
} finally {
  await browser.close()
  await rm(scratch, { recursive: true, force: true })
}
