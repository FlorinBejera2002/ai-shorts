import assert from 'node:assert/strict'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { restoreSourceTimes } from './source-probe-helpers.mjs'

// Start Vite separately. A stateful in-page fake of the projects/collections API backs every
// read and mutation, so moves, deletes and renames round-trip without any real database.
assert.ok(process.env.PLAYWRIGHT_MODULE, 'Set PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const origin = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5173'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname))
const output = new URL('../test-results/clips-layout/', import.meta.url)
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const runtimeErrors = [],
  unexpected = [],
  reports = []
let fastRefreshVerified = false
const identity = {
  id: '00000000-0000-4000-8000-000000002001',
  email: 'clips-layout@example.invalid',
  name: 'Alex Morgan',
  profile_pic: null,
  credits: 360,
  plan: 'pro',
  access_role: 'member'
}
const PROJECT = {
  podcast: '00000000-0000-4000-8000-000000002101',
  recipes: '00000000-0000-4000-8000-000000002102',
  interviews: '00000000-0000-4000-8000-000000002103'
}
const clipId = (index) => `00000000-0000-4000-8000-${String(2200 + index).padStart(12, '0')}`
// [title, seconds, project, aspect, subtitles]
const CLIPS = [
  ['How I grew to 10k followers', 38, 'podcast', '9:16', true],
  ['The mistake everyone makes first', 52, 'podcast', '9:16', true],
  ['Bread in three steps', 29, 'recipes', '9:16', true],
  ['What I would do differently today', 64, 'interviews', '9:16', false],
  ['The secret of a good hook', 41, 'podcast', '9:16', true],
  ['Creamy pasta without cream', 35, 'recipes', '1:1', true],
  ['My first investment', 58, 'interviews', '9:16', true],
  ['Three tools I use every day', 47, null, '9:16', false],
  ['From idea to clip in five minutes', 33, null, '16:9', true],
  ['The question that changes everything', 72, 'interviews', '9:16', true],
  ['Episode 12 in short', 44, 'podcast', '9:16', true],
  ['The guest who said no', 39, 'podcast', '9:16', true],
  ['Why I publish on Tuesdays', 31, 'podcast', '9:16', false],
  ['My two hundred lei microphone', 46, 'podcast', '1:1', true],
  ['What fifty episodes taught me', 57, 'podcast', '9:16', true],
  ['Soup for cold evenings', 27, 'recipes', '9:16', true],
  ['Five minute breakfast', 22, 'recipes', '9:16', false],
  ['A cake without an oven', 49, 'recipes', '1:1', true],
  ['Leaving a stable job', 61, 'interviews', '9:16', true],
  ['Building in public', 43, 'interviews', '16:9', true],
  ['Desk setup tour', 36, null, '9:16', true],
  ['Morning routine', 28, null, '9:16', false],
  ['Behind the scenes', 54, null, '9:16', true],
  ['Q and A highlights', 66, 'recipes', '9:16', true]
]
function thumbnail(index) {
  const hue = (index * 37) % 360
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"><rect width="360" height="640" fill="hsl(${hue} 35% 38%)"/><circle cx="180" cy="250" r="70" fill="hsl(${hue} 50% 70%)"/><rect x="40" y="420" width="280" height="140" rx="24" fill="hsl(${hue} 30% 22%)"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
function library({ empty = false } = {}) {
  const now = Date.now()
  return {
    collections: empty
      ? []
      : [
          { id: PROJECT.podcast, name: 'Podcast', createdAt: '2026-10-01T09:00:00Z' },
          { id: PROJECT.recipes, name: 'Recipes', createdAt: '2026-10-02T09:00:00Z' },
          { id: PROJECT.interviews, name: 'Interviews', createdAt: '2026-10-03T09:00:00Z' }
        ],
    clips: empty
      ? []
      : CLIPS.map(([title, duration, project, aspectRatio, hasSubtitles], index) => ({
          id: clipId(index),
          source: index % 3,
          folderId: project ? PROJECT[project] : null,
          title,
          duration,
          viralScore: 9,
          aspectRatio,
          thumbnailUrl: thumbnail(index),
          fileUrl: `https://media.example.invalid/${clipId(index)}.mp4`,
          hookText: null,
          resolution: '1080 × 1920',
          hasSubtitles,
          createdAt: new Date(now - (index + 1) * 3_600_000 * 7).toISOString()
        }))
  }
}
function payload(state) {
  return {
    projects: [0, 1, 2].map((source) => ({
      id: `00000000-0000-4000-8000-00000000230${source}`,
      name: `Source ${source}`,
      status: 'completed',
      source: '',
      brandKit: {},
      folders: [],
      updatedAt: '2026-11-01T09:00:00Z',
      clips: state.clips.filter((clip) => clip.source === source).map(({ source: _source, ...clip }) => clip)
    })),
    collections: state.collections
  }
}

async function fixture(options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 900 },
    timezoneId: 'Europe/Bucharest',
    colorScheme: options.dark ? 'dark' : 'light',
    reducedMotion: 'reduce',
    hasTouch: Boolean(options.touch)
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(60000)
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/^Failed to load resource:/.test(message.text())) runtimeErrors.push(message.text())
  })
  const state = library(options)
  const calls = { reads: 0, mutations: [] }
  let failRead = Boolean(options.failRead),
    releaseRead
  const gate = new Promise((resolve) => (releaseRead = resolve))
  let nextId = 2900
  await context.route('**/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path !== '/v1/auth/refresh') {
      unexpected.push(`${route.request().method()} ${path}`)
      return route.fulfill({ status: 405, json: {} })
    }
    return route.fulfill({ json: { access_token: 'synthetic-clips-token', user: identity } })
  })
  await context.route('**/api/**', async (route) => {
    const request = route.request(),
      method = request.method(),
      path = new URL(request.url()).pathname,
      body = request.postData() ? JSON.parse(request.postData()) : null
    if (method === 'GET' && path === '/api/projects') {
      calls.reads += 1
      if (options.holdRead && calls.reads === 1) await gate
      if (failRead) return route.fulfill({ status: 503, json: { detail: 'Synthetic failure' } })
      return route.fulfill({ json: payload(state) })
    }
    if (method !== 'GET') {
      calls.mutations.push(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ''}`)
      const taken = (name, except) =>
        state.collections.some((item) => item.id !== except && item.name.toLowerCase() === name.trim().toLowerCase())
      let match
      if (method === 'POST' && path === '/api/collections') {
        if (taken(body.name)) return route.fulfill({ status: 409, json: { detail: 'A folder with this name already exists' } })
        const created = { id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`, name: body.name.trim(), createdAt: new Date().toISOString() }
        state.collections.push(created)
        return route.fulfill({ status: 201, json: created })
      }
      if ((match = path.match(/^\/api\/collections\/([0-9a-f-]{36})$/))) {
        const collection = state.collections.find((item) => item.id === match[1])
        if (!collection) return route.fulfill({ status: 404, json: { detail: 'Project item not found' } })
        if (method === 'PATCH') {
          if (taken(body.name, collection.id)) return route.fulfill({ status: 409, json: { detail: 'A folder with this name already exists' } })
          collection.name = body.name.trim()
          return route.fulfill({ json: { updated: true } })
        }
        if (method === 'DELETE') {
          state.collections = state.collections.filter((item) => item !== collection)
          for (const clip of state.clips) if (clip.folderId === collection.id) clip.folderId = null
          return route.fulfill({ status: 204, body: '' })
        }
      }
      if (method === 'PUT' && (match = path.match(/^\/api\/clips\/([0-9a-f-]{36})\/collection$/))) {
        const clip = state.clips.find((item) => item.id === match[1])
        if (!clip || (body.collectionId && !state.collections.some((item) => item.id === body.collectionId)))
          return route.fulfill({ status: 404, json: { detail: 'Project item not found' } })
        clip.folderId = body.collectionId
        return route.fulfill({ json: { updated: true } })
      }
      if (method === 'DELETE' && (match = path.match(/^\/api\/clips\/([0-9a-f-]{36})$/))) {
        state.clips = state.clips.filter((item) => item.id !== match[1])
        return route.fulfill({ json: { deleted: true } })
      }
      unexpected.push(`${method} ${path}`)
      return route.fulfill({ status: 405, json: {} })
    }
    const responses = {
      '/api/user/profile': { profile: { ...identity, image: null, provider: 'credentials', createdAt: '2026-10-01T09:00:00Z' } },
      '/api/user/settings': { preferences: { locale: 'en', theme: 'system', timezone: 'UTC' }, sessions: [], mfa: { enabled: false }, securityEvents: [], exports: [] },
      '/api/dashboard': { metrics: { clipCount: 24, jobCount: 3, durationMinutes: 18, activity: [], statuses: {} }, recentClips: [] },
      '/api/workspace-agent/runs': { runs: [], has_more: false },
      '/api/workspace-agent/suggestions': { suggestions: [], capabilities: [] },
      '/api/stripe/billing': { account: { credits: 360, plan: 'pro', hasBillingProfile: true }, subscription: null, invoices: [], providerAvailable: true }
    }
    return route.fulfill({ json: responses[path] || {} })
  })
  return {
    page,
    calls,
    state,
    root: page.locator('[data-clips-workspace]'),
    release: () => releaseRead(),
    fail: (value) => (failRead = value),
    async open(search = '', wait = true) {
      await page.goto(`${origin}/${options.ro ? 'ro/' : ''}dashboard/clips${search}`, { waitUntil: options.holdRead ? 'domcontentloaded' : 'networkidle' })
      if (wait) await page.locator('[data-clips-workspace]').waitFor()
    },
    close: async () => {
      releaseRead()
      await context.close()
    }
  }
}

const cards = (f) => f.root.locator('[data-clip-card]')
const toast = (f) => f.page.locator('[data-clips-toast]')
const scopeLink = (f, name) => f.root.locator('[data-clips-scope]').filter({ hasText: name }).first()
async function capture(f, name) {
  await f.page.evaluate(() => window.scrollTo(0, 0))
  await noOverflow(f.page, name)
  await f.page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, output)), fullPage: false })
  reports.push(name)
}
async function noOverflow(page, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow`)
}
async function counts(f) {
  return f.root.locator('[data-clips-scope]').evaluateAll((links) =>
    Object.fromEntries(links.map((link) => [link.childNodes[1]?.textContent?.trim() || link.textContent.replace(/\d+$/, '').trim(), Number(link.lastElementChild.textContent)]))
  )
}
/** Polls until the locator's text matches, so assertions never race a re-render. */
async function textMatches(locator, pattern, message) {
  const deadline = Date.now() + 10000
  let text = ''
  while (Date.now() < deadline) {
    text = await locator.innerText().catch(() => '')
    if (pattern.test(text)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.match(text, pattern, message)
}
async function countIs(locator, expected, message) {
  const deadline = Date.now() + 10000
  while (Date.now() < deadline && (await locator.count()) !== expected) await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal(await locator.count(), expected, message)
}
async function expectToast(f, text) {
  await toast(f).filter({ hasText: text }).waitFor()
}
async function openClipMenu(f, index = 0, mobile = false) {
  const card = cards(f).nth(index)
  const title = await card.getAttribute('aria-label')
  await card.getByRole('button', { name: `Actions for ${title}` }).click()
  const menu = f.page.getByRole('menu', { name: mobile ? 'Clip actions' : `Actions for ${title}` })
  await menu.waitFor()
  return { menu, title, id: await card.getAttribute('data-clip-card') }
}
async function rememberShell(page) {
  await page.evaluate(() => {
    window.clipsShellProbe = {
      document,
      shell: document.querySelector('#dashboard-shell'),
      main: document.querySelector('#dashboard-main'),
      sidebar: document.querySelector('[data-slot="sidebar"]')
    }
  })
}
async function assertShell(page) {
  assert.equal(
    await page.evaluate(() => {
      const probe = window.clipsShellProbe
      return Boolean(
        probe &&
          probe.document === document &&
          probe.shell === document.querySelector('#dashboard-shell') &&
          probe.main === document.querySelector('#dashboard-main') &&
          probe.sidebar === document.querySelector('[data-slot="sidebar"]')
      )
    }),
    true,
    'Dashboard shell stays mounted'
  )
}

// ---------------------------------------------------------------- canvas reference states
async function references() {
  for (const dark of [false, true]) {
    const mode = dark ? 'dark' : 'light'
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const mobile = viewport.width < 1024
      const prefix = `${mobile ? 'mobile' : 'desktop'}-${mode}`
      const f = await fixture({ dark, viewport })
      try {
        await f.open()
        await cards(f).first().waitFor()
        assert.equal(await cards(f).count(), mobile ? 6 : 10, `${prefix}: first page size`)
        assert.equal(await f.root.getByText(/viral|score|★|brand kit/i).count(), 0, 'No viral score or project brand kit')
        const primary = f.root.getByRole('link', { name: 'New clip' }).first()
        assert.equal(
          await primary.evaluate((element) => getComputedStyle(element).backgroundColor),
          dark ? 'rgb(142, 155, 176)' : 'rgb(11, 11, 12)',
          `${prefix}: primary action is black / muted steel`
        )
        if (!mobile) {
          assert.deepEqual(await counts(f), { 'All clips': 24, 'No project': 5, Podcast: 8, Recipes: 6, Interviews: 5 })
          const columns = await cards(f).evaluateAll((items) => new Set(items.slice(0, 6).map((item) => Math.round(item.getBoundingClientRect().top))).size)
          assert.equal(columns, 2, 'Desktop grid: five columns over two rows')
          await textMatches(f.root.locator('[data-clips-pager]'), /1–10\s+of 24/)
        } else {
          assert.match(await f.root.locator('[data-clips-load-more]').innerText(), /6 of 24/)
          assert.equal(await f.root.locator('[data-clips-rail]').count(), 0, 'Phones use chips, not the rail')
        }
        await capture(f, `${prefix}-main`)
        await scopeLink(f, 'Podcast').click()
        await f.root.locator('[data-clips-project-head]').waitFor()
        await capture(f, `${prefix}-project`)
        if (mobile) {
          await f.root.getByRole('button', { name: 'Podcast project options' }).click()
          await f.page.getByRole('menuitem', { name: 'Rename' }).waitFor()
          await capture(f, `${prefix}-project-menu`)
          await f.page.keyboard.press('Escape')
        } else {
          await f.root.getByRole('button', { name: 'Podcast project options' }).click()
          await f.page.getByRole('menuitem', { name: 'Delete project' }).waitFor()
          await capture(f, `${prefix}-project-menu`)
          await f.page.keyboard.press('Escape')
        }
        await scopeLink(f, mobile ? 'All' : 'All clips').click()
        await cards(f).nth(1).waitFor()
        const { menu } = await openClipMenu(f, 1, mobile)
        await capture(f, `${prefix}-clip-menu`)
        await menu.getByRole('menuitem', { name: 'Move to project' }).click()
        await f.page.getByRole('menuitemradio', { name: 'Recipes' }).waitFor()
        await capture(f, `${prefix}-move`)
        await f.page.keyboard.press('Escape')
        if (await f.page.getByRole('menu').count()) await f.page.keyboard.press('Escape')
        await (await openClipMenu(f, 1, mobile)).menu.getByRole('menuitem', { name: 'Delete' }).click()
        const alert = f.page.getByRole('alertdialog')
        await alert.waitFor()
        assert.equal(await alert.locator('img').getAttribute('src'), '/illustrations/delete.webp', 'Delete uses the Ana/Radu illustration')
        await capture(f, `${prefix}-delete-clip`)
        await alert.getByRole('button', { name: 'Keep' }).click()
        await alert.waitFor({ state: 'detached' })
        await (mobile ? f.root.getByRole('button', { name: 'New project' }) : f.root.getByRole('button', { name: 'New project' })).click()
        await f.page.getByRole('dialog').getByLabel('Name').fill('Travel vlog')
        await capture(f, `${prefix}-new-project`)
        await f.page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
        if (mobile) {
          await f.root.getByRole('button', { name: 'Filters' }).click()
          await f.page.getByRole('dialog', { name: 'Filters' }).waitFor()
          await capture(f, `${prefix}-filters`)
          await f.page.keyboard.press('Escape')
        } else {
          await f.root.getByRole('button', { name: /^Format/ }).click()
          await f.page.getByRole('menuitemradio', { name: '1:1' }).waitFor()
          await capture(f, `${prefix}-format`)
          await f.page.keyboard.press('Escape')
        }
        await f.page.goto(`${origin}/dashboard/clips?aspect=1:1&subtitles=no`, { waitUntil: 'networkidle' })
        await f.root.locator('[data-clips-state="no-results"]').waitFor()
        await capture(f, `${prefix}-no-results`)
      } finally {
        await f.close()
      }
      for (const [state, options] of [
        ['empty', { empty: true }],
        ['error', { failRead: true }],
        ['loading', { holdRead: true }]
      ]) {
        const g = await fixture({ dark, viewport, ...options })
        try {
          await g.open('', true)
          await g.root.locator(`[data-clips-state="${state}"]`).waitFor()
          if (state === 'empty') assert.equal(await g.root.locator('[data-clips-rail]').count(), 0, 'Empty library has no rail')
          await capture(g, `${prefix}-${state}`)
        } finally {
          await g.close()
        }
      }
    }
  }
  console.log('Clips canvas states captured: main, project, menus, move, delete, new project, filters, no results, empty, error, loading (desktop/mobile, light/dark)')
}

// ---------------------------------------------------------------- desktop behaviour
async function desktop() {
  const f = await fixture()
  try {
    await f.open()
    await cards(f).first().waitFor()
    await rememberShell(f.page)

    // Paging
    await f.root.getByRole('link', { name: 'Page 2' }).click()
    await f.page.waitForURL(/page=2/)
    await textMatches(f.root.locator('[data-clips-pager]'), /11–20\s+of 24/)
    await f.root.getByRole('link', { name: 'Next' }).click()
    await f.page.waitForURL(/page=3/)
    await countIs(cards(f), 4)
    assert.equal(await f.root.getByRole('link', { name: 'Next' }).getAttribute('aria-disabled'), 'true')
    await f.root.getByRole('link', { name: 'Previous' }).click()
    await f.page.waitForURL(/page=2/)
    await assertShell(f.page)

    // Search, filters and sort live in the URL and reset paging
    await f.root.getByRole('searchbox', { name: 'Search clips' }).fill('bread')
    await f.page.waitForURL((url) => url.searchParams.get('search') === 'bread' && !url.searchParams.has('page'))
    await countIs(cards(f), 1)
    assert.equal(await cards(f).first().getAttribute('aria-label'), 'Bread in three steps')
    await f.root.getByRole('searchbox', { name: 'Search clips' }).fill('')
    await f.root.getByRole('button', { name: /^Format/ }).click()
    await f.page.getByRole('menuitemradio', { name: '1:1' }).click()
    await f.page.waitForURL((url) => url.searchParams.get('aspect') === '1:1')
    await countIs(cards(f), 3)
    assert.match(await f.root.getByRole('button', { name: /^Format/ }).innerText(), /1:1/)
    await f.root.getByRole('button', { name: 'Remove Format: 1:1' }).click()
    await f.page.waitForURL((url) => !url.searchParams.has('aspect'))
    await f.root.getByRole('button', { name: /^Subtitles/ }).click()
    await f.page.getByRole('menuitemradio', { name: 'Without' }).click()
    await f.page.waitForURL((url) => url.searchParams.get('subtitles') === 'no')
    await countIs(cards(f), CLIPS.filter((clip) => !clip[4]).length)
    await f.root.getByRole('button', { name: 'Clear filters' }).first().click()
    await f.page.waitForURL((url) => !url.searchParams.has('subtitles'))
    await f.root.getByRole('button', { name: /Sort by/ }).click()
    await f.page.getByRole('menuitemradio', { name: 'Duration' }).click()
    await f.page.waitForURL((url) => url.searchParams.get('sort') === 'duration')
    await textMatches(cards(f).first(), /The question that changes everything/)
    await f.root.getByRole('searchbox', { name: 'Search clips' }).fill('zzzz')
    await f.root.locator('[data-clips-state="no-results"]').waitFor()
    await f.root.locator('[data-clips-state="no-results"]').getByRole('button', { name: 'Clear filters' }).click()
    await cards(f).nth(9).waitFor()
    assert.equal(await f.root.getByRole('searchbox', { name: 'Search clips' }).inputValue(), '', 'Clearing filters also clears the search field')

    // Projects in the rail
    await f.page.goto(`${origin}/dashboard/clips`, { waitUntil: 'networkidle' })
    await rememberShell(f.page)
    await scopeLink(f, 'Podcast').click()
    await f.page.waitForURL((url) => url.searchParams.get('project') === PROJECT.podcast)
    await textMatches(f.root.locator('[data-clips-project-head]'), /Podcast\s+8 clips/)
    await countIs(cards(f), 8)
    assert.equal(await scopeLink(f, 'Podcast').getAttribute('aria-current'), 'page')
    await scopeLink(f, 'No project').click()
    await f.page.waitForURL((url) => url.searchParams.get('project') === 'none')
    await countIs(cards(f), 5)
    await scopeLink(f, 'All clips').click()
    await f.page.waitForURL((url) => !url.searchParams.has('project'))
    await countIs(cards(f), 10)
    await textMatches(cards(f).first(), /How I grew to 10k followers/)
    await assertShell(f.page)

    // Clip menu destinations
    let { menu, title, id } = await openClipMenu(f, 0)
    assert.deepEqual(await menu.getByRole('menuitem').allInnerTexts(), ['Open', 'Publish', 'Download', 'Move to project', 'Delete'])
    assert.equal(await menu.getByRole('menuitem', { name: 'Open' }).getAttribute('href'), `/dashboard/clips/${id}`)
    assert.equal(await menu.getByRole('menuitem', { name: 'Publish' }).getAttribute('href'), `/dashboard/publish/new?clip=${id}`)
    const download = menu.getByRole('menuitem', { name: 'Download' })
    assert.equal(await download.getAttribute('href'), `https://media.example.invalid/${id}.mp4`)
    assert.match(await download.getAttribute('download'), /\.mp4$/)
    await menu.getByRole('menuitem', { name: 'Open' }).click()
    await f.page.waitForURL((url) => url.pathname === `/dashboard/clips/${id}`)
    await assertShell(f.page)
    await f.page.goBack()
    await cards(f).first().waitFor()
    ;({ menu } = await openClipMenu(f, 0))
    await menu.getByRole('menuitem', { name: 'Publish' }).click()
    await f.page.waitForURL((url) => url.pathname === '/dashboard/publish/new' && url.searchParams.get('clip') === id)
    await assertShell(f.page)
    await f.page.goBack()
    await cards(f).first().waitFor()
    await f.root.getByRole('link', { name: 'New clip' }).click()
    await f.page.waitForURL((url) => url.pathname === '/dashboard/create')
    await assertShell(f.page)
    await f.page.goBack()
    await cards(f).first().waitFor()
    await cards(f).first().getByRole('link', { name: `Open ${title}` }).click()
    await f.page.waitForURL((url) => url.pathname === `/dashboard/clips/${id}`)
    await f.page.goBack()
    await cards(f).first().waitFor()

    // Move with the submenu
    ;({ menu, title, id } = await openClipMenu(f, 0))
    await menu.getByRole('menuitem', { name: 'Move to project' }).click()
    const move = f.page.getByRole('menu', { name: 'Move to project' })
    assert.equal(await move.getByRole('menuitemradio', { name: 'Podcast' }).getAttribute('aria-checked'), 'true')
    await move.getByRole('menuitemradio', { name: 'Recipes' }).click()
    await expectToast(f, 'Clip moved to Recipes.')
    assert.ok(f.calls.mutations.includes(`PUT /api/clips/${id}/collection {"collectionId":"${PROJECT.recipes}"}`))
    assert.equal((await counts(f)).Recipes, 7)
    assert.match(await cards(f).first().innerText(), /Recipes ·/)

    // New project straight from the submenu: created, then the clip moves into it
    ;({ menu, id } = await openClipMenu(f, 1))
    await menu.getByRole('menuitem', { name: 'Move to project' }).click()
    await f.page.getByRole('menu', { name: 'Move to project' }).getByRole('menuitem', { name: 'New project' }).click()
    let dialog = f.page.getByRole('dialog')
    await dialog.getByLabel('Name').fill('  Travel vlog ')
    await dialog.getByRole('button', { name: 'Create project' }).click()
    await expectToast(f, 'Clip moved to Travel vlog.')
    await dialog.waitFor({ state: 'detached' })
    assert.equal((await counts(f))['Travel vlog'], 1)
    assert.ok(f.calls.mutations.some((call) => call === 'POST /api/collections {"name":"Travel vlog"}'))

    // Duplicate names are refused with a clear message
    await f.root.getByRole('button', { name: 'New project' }).click()
    dialog = f.page.getByRole('dialog')
    assert.equal(await dialog.getByRole('button', { name: 'Create project' }).isDisabled(), true, 'Empty name cannot be submitted')
    await dialog.getByLabel('Name').fill('podcast')
    await dialog.getByLabel('Name').press('Enter')
    await dialog.getByRole('alert').filter({ hasText: 'A project with this name already exists.' }).waitFor()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'detached' })

    // Delete a clip
    ;({ menu, title, id } = await openClipMenu(f, 2))
    await menu.getByRole('menuitem', { name: 'Delete' }).click()
    const alert = f.page.getByRole('alertdialog')
    assert.match(await alert.innerText(), new RegExp(`“${title}” can’t be recovered`))
    await alert.getByRole('button', { name: 'Delete' }).click()
    await expectToast(f, 'Clip deleted.')
    await alert.waitFor({ state: 'detached' })
    assert.equal((await counts(f))['All clips'], 23)
    assert.equal(await f.root.locator(`[data-clip-card="${id}"]`).count(), 0)

    // Drag a clip onto a project in the rail
    const dragged = cards(f).nth(3)
    const draggedId = await dragged.getAttribute('data-clip-card')
    const from = await dragged.locator('a').first().boundingBox()
    const target = await scopeLink(f, 'Interviews').boundingBox()
    const before = (await counts(f)).Interviews
    const url = f.page.url()
    await f.page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await f.page.mouse.down()
    await f.page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 4 })
    await f.page.locator('[data-clips-drag-ghost]').waitFor()
    assert.ok((await f.root.locator('[data-clips-rail] [data-drop-zone]').count()) >= 4, 'Projects become drop zones')
    await f.page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 })
    await f.page.locator('[data-clips-drag-ghost]').filter({ hasText: 'Move to Interviews' }).waitFor()
    assert.equal(await f.root.locator('[data-drop-target]').innerText().then((text) => /Add here/.test(text)), true)
    await f.page.mouse.up()
    await expectToast(f, 'Clip moved to Interviews.')
    assert.equal(f.page.url(), url, 'Dropping does not open the clip')
    assert.equal((await counts(f)).Interviews, before + 1)
    assert.ok(f.calls.mutations.includes(`PUT /api/clips/${draggedId}/collection {"collectionId":"${PROJECT.interviews}"}`))
    assert.equal(await f.page.locator('[data-clips-drag-ghost]').count(), 0)

    // Rename and delete a project from its rail menu
    await scopeLink(f, 'Podcast').click()
    await f.root.getByRole('button', { name: 'Podcast project options' }).click()
    await f.page.getByRole('menuitem', { name: 'Rename' }).click()
    dialog = f.page.getByRole('dialog')
    assert.equal(await dialog.getByLabel('Name').inputValue(), 'Podcast')
    assert.equal(await dialog.getByRole('button', { name: 'Save' }).isDisabled(), true, 'Unchanged name cannot be saved')
    await dialog.getByLabel('Name').fill('Podcasts')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await dialog.waitFor({ state: 'detached' })
    await f.root.locator('[data-clips-project-head]').filter({ hasText: 'Podcasts' }).waitFor()
    const unassigned = (await counts(f))['No project'],
      podcastCount = (await counts(f)).Podcasts
    await f.root.getByRole('button', { name: 'Podcasts project options' }).click()
    await f.page.getByRole('menuitem', { name: 'Delete project' }).click()
    const confirm = f.page.getByRole('alertdialog')
    assert.match(await confirm.innerText(), /Delete “Podcasts”\?[\s\S]*Its clips stay in “No project”/)
    assert.equal(await confirm.locator('img').getAttribute('src'), '/illustrations/delete.webp')
    await confirm.getByRole('button', { name: 'Delete project' }).click()
    await expectToast(f, 'Project deleted.')
    await f.page.waitForURL((url) => !url.searchParams.has('project'))
    assert.equal((await counts(f))['No project'], unassigned + podcastCount)
    assert.equal((await counts(f)).Podcasts, undefined)

    // An empty project shows the drop area instead of the toolbar
    await f.root.getByRole('button', { name: 'New project' }).click()
    await f.page.getByRole('dialog').getByLabel('Name').fill('Empty')
    await f.page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()
    await scopeLink(f, 'Empty').click()
    await f.root.locator('[data-clips-state="empty-project"]').filter({ hasText: 'Drag clips here' }).waitFor()
    assert.equal(await f.root.locator('[data-clips-toolbar]').count(), 0)

    // A stale project link falls back to all clips
    await f.page.goto(`${origin}/dashboard/clips?project=00000000-0000-4000-8000-000000009999`, { waitUntil: 'networkidle' })
    await cards(f).nth(9).waitFor()
    assert.equal(await scopeLink(f, 'All clips').getAttribute('aria-current'), 'page')
  } finally {
    await f.close()
  }
  // Retry after a failed read
  const g = await fixture({ failRead: true })
  try {
    await g.open()
    await g.root.locator('[data-clips-state="error"]').waitFor()
    g.fail(false)
    await g.root.getByRole('button', { name: 'Try again' }).click()
    await cards(g).first().waitFor()
  } finally {
    await g.close()
  }
  console.log('Desktop: paging, search/filters/sort in the URL, rail scopes, menu destinations, move, new project, 409, delete, drag & drop, rename/delete project, empty project, stale link and retry passed')
}

// ---------------------------------------------------------------- phone behaviour
async function phone() {
  const f = await fixture({ viewport: { width: 390, height: 844 }, ro: false })
  try {
    await f.open()
    await cards(f).first().waitFor()
    assert.match(await f.root.locator('[class*="listHead"]').innerText(), /24 clips/)
    await f.root.getByRole('button', { name: 'Show more' }).click()
    await countIs(cards(f), 12)
    await textMatches(f.root.locator('[data-clips-load-more]'), /12 of 24/)

    // Filters sheet: drafted, applied together, counted on the button
    await f.root.getByRole('button', { name: 'Filters' }).click()
    let sheet = f.page.getByRole('dialog', { name: 'Filters' })
    await sheet.getByRole('button', { name: '1:1' }).click()
    await sheet.getByRole('button', { name: 'With', exact: true }).click()
    assert.equal(new URL(f.page.url()).searchParams.has('aspect'), false, 'Nothing applies before Apply')
    await sheet.getByRole('button', { name: 'Apply' }).click()
    await f.page.waitForURL((url) => url.searchParams.get('aspect') === '1:1' && url.searchParams.get('subtitles') === 'yes')
    await f.root.getByRole('button', { name: 'Filters, 2 active' }).waitFor()
    assert.equal(await f.root.locator('[data-clips-active-filters] [class*="filterChip"]').count(), 2)
    await countIs(cards(f), 3)
    await f.root.getByRole('button', { name: 'Filters, 2 active' }).click()
    sheet = f.page.getByRole('dialog', { name: 'Filters' })
    assert.equal(await sheet.getByRole('button', { name: '1:1' }).getAttribute('aria-pressed'), 'true')
    await sheet.getByRole('button', { name: 'Clear filters' }).click()
    await f.page.waitForURL((url) => !url.searchParams.has('aspect') && !url.searchParams.has('subtitles'))

    // Sort from the list header
    await f.root.getByRole('button', { name: 'Sort by: Newest' }).click()
    await f.page.getByRole('menuitemradio', { name: 'Oldest' }).click()
    await f.page.waitForURL((url) => url.searchParams.get('sort') === 'oldest')
    await textMatches(cards(f).first(), /Q and A highlights/)

    // Chips switch projects; the project header carries the project sheet
    await scopeLink(f, 'Recipes').click()
    await f.page.waitForURL((url) => url.searchParams.get('project') === PROJECT.recipes)
    await countIs(cards(f), 6)
    await f.root.locator('[data-clips-project-head]').filter({ hasText: 'Recipes' }).waitFor()
    await f.root.getByRole('button', { name: 'Recipes project options' }).click()
    sheet = f.page.getByRole('dialog')
    assert.deepEqual(await sheet.getByRole('menuitem').allInnerTexts(), ['Rename', 'Delete project'])
    await sheet.getByRole('menuitem', { name: 'Rename' }).click()
    const rename = f.page.getByRole('dialog')
    await rename.getByLabel('Name').fill('Kitchen')
    await rename.getByRole('button', { name: 'Save' }).click()
    await f.root.locator('[data-clips-project-head]').filter({ hasText: 'Kitchen' }).waitFor()

    // Clip sheet: actions, then the "Move to project" step with Back
    const first = cards(f).first()
    const id = await first.getAttribute('data-clip-card')
    await first.getByRole('button', { name: /^Actions for/ }).click()
    sheet = f.page.getByRole('menu', { name: 'Clip actions' })
    assert.deepEqual(await sheet.getByRole('menuitem').allInnerTexts(), ['Open', 'Publish', 'Download', 'Move to project', 'Delete'])
    assert.equal(await sheet.getByRole('menuitem', { name: 'Publish' }).getAttribute('href'), `/dashboard/publish/new?clip=${id}`)
    await sheet.getByRole('menuitem', { name: 'Move to project' }).click()
    sheet = f.page.getByRole('dialog', { name: 'Move to project' })
    assert.equal(await sheet.getByRole('menuitemradio', { name: 'Kitchen' }).getAttribute('aria-checked'), 'true')
    await sheet.getByRole('button', { name: 'Back' }).click()
    await f.page.getByRole('menu', { name: 'Clip actions' }).getByRole('menuitem', { name: 'Move to project' }).click()
    await f.page.getByRole('dialog', { name: 'Move to project' }).getByRole('menuitemradio', { name: 'No project' }).click()
    await expectToast(f, 'Clip moved to “No project”.')
    await countIs(cards(f), 5)

    // Delete from the sheet: bottom-sheet confirmation with the illustration
    await cards(f).first().getByRole('button', { name: /^Actions for/ }).click()
    await f.page.getByRole('menu', { name: 'Clip actions' }).getByRole('menuitem', { name: 'Delete' }).click()
    const alert = f.page.getByRole('alertdialog')
    assert.equal(await alert.locator('img').getAttribute('src'), '/illustrations/delete.webp')
    await alert.getByRole('button', { name: 'Delete' }).click()
    await expectToast(f, 'Clip deleted.')
    await countIs(cards(f), 4)

    // Long-press drag onto a project chip (touch pointer events)
    await scopeLink(f, 'All').click()
    await countIs(cards(f), 6)
    const dragged = cards(f).filter({ hasNotText: 'Podcast ·' }).first()
    const dragId = await dragged.getAttribute('data-clip-card')
    // Only the visible part of the chip row can be a target.
    const chip = await scopeLink(f, 'Podcast').boundingBox()
    const before = (await counts(f)).Podcast
    await f.page.evaluate(
      async ({ dragId, x, y }) => {
        const card = document.querySelector(`[data-clip-card="${dragId}"] a`)
        const box = card.getBoundingClientRect()
        const at = (type, cx, cy, target = card) =>
          target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', isPrimary: true, button: 0, clientX: cx, clientY: cy }))
        at('pointerdown', box.x + 20, box.y + 20)
        await new Promise((resolve) => setTimeout(resolve, 450))
        for (let step = 1; step <= 8; step++) at('pointermove', box.x + 20 + ((x - box.x - 20) * step) / 8, box.y + 20 + ((y - box.y - 20) * step) / 8, window)
        await new Promise((resolve) => setTimeout(resolve, 80))
        at('pointerup', x, y, window)
      },
      { dragId, x: Math.min(chip.x + chip.width / 2, 370), y: chip.y + chip.height / 2 }
    )
    await expectToast(f, 'Clip moved to Podcast.')
    assert.equal((await counts(f)).Podcast, before + 1)

    // New project from the "+" chip opens a bottom sheet
    await f.root.getByRole('button', { name: 'New project' }).click()
    const naming = f.page.getByRole('dialog')
    await naming.getByLabel('Name').fill('Shorts')
    await naming.getByRole('button', { name: 'Create project' }).click()
    await scopeLink(f, 'Shorts').waitFor()
    await scopeLink(f, 'Shorts').click()
    await f.root.locator('[data-clips-state="empty-project"]').filter({ hasText: 'Move clips here from a clip’s menu' }).waitFor()
  } finally {
    await f.close()
  }
  for (const width of [320, 390, 768, 1024, 1152, 1280, 1440, 1920]) {
    const g = await fixture({ viewport: { width, height: 900 } })
    try {
      await g.open()
      await cards(g).first().waitFor()
      await noOverflow(g.page, `${width}px`)
    } finally {
      await g.close()
    }
  }
  console.log('Phone: list header, show more, filter sheet + badge, sort, chips, project sheet rename, clip sheet with move step, delete sheet, long-press drag, new project; no overflow at 320–1280px passed')
}

// ---------------------------------------------------------------- Romanian copy
async function romanian() {
  const f = await fixture({ ro: true })
  try {
    await f.open()
    await cards(f).first().waitFor()
    for (const text of ['Toate clipurile', 'Fără proiect', 'Proiecte', 'Proiect nou', 'Clip nou', 'Format', 'Subtitrări', 'Cele mai noi'])
      assert.ok((await f.root.getByText(text, { exact: true }).count()) > 0, `Romanian: ${text}`)
    await textMatches(f.root.locator('[data-clips-pager]'), /1–10\s+din 24/)
    await capture(f, 'desktop-romanian')
  } finally {
    await f.close()
  }
  console.log('Romanian copy passed')
}

// ---------------------------------------------------------------- Fast Refresh
async function fastRefresh() {
  if (process.env.RUN_FAST_REFRESH !== '1') {
    console.log('SKIPPED source Fast Refresh probe (set RUN_FAST_REFRESH=1)')
    return
  }
  const f = await fixture()
  try {
    await f.open()
    await cards(f).first().waitFor()
    await rememberShell(f.page)
    await f.root.getByRole('searchbox', { name: 'Search clips' }).fill('the')
    const sourcePath = new URL('../src/components/clips/clips-projects.tsx', import.meta.url)
    const metadata = await stat(sourcePath, { bigint: true }),
      source = await readFile(sourcePath)
    const text = source.toString('utf8'),
      anchor = 'data-clips-rail=""'
    assert.equal(text.split(anchor).length, 2, 'Fast Refresh anchor is unique')
    const reads = f.calls.reads
    try {
      await writeFile(sourcePath, text.replace(anchor, `data-clips-refresh-probe="updated" ${anchor}`))
      await f.page.locator('[data-clips-refresh-probe="updated"]').waitFor({ state: 'attached' })
      await assertShell(f.page)
      assert.equal(await f.root.getByRole('searchbox', { name: 'Search clips' }).inputValue(), 'the', 'Search draft survives')
      assert.equal(f.calls.reads, reads, 'Library is not refetched')
    } finally {
      try {
        await writeFile(sourcePath, source)
        await f.page.locator('[data-clips-refresh-probe]').waitFor({ state: 'detached' })
        assert.deepEqual(await readFile(sourcePath), source)
      } finally {
        await restoreSourceTimes(sourcePath, metadata)
      }
    }
    fastRefreshVerified = true
  } finally {
    await f.close()
  }
  console.log('Fast Refresh updated the rail component in place with shell, search draft and data preserved')
}

try {
  await mkdir(output, { recursive: true })
  const group = process.env.CLIPS_GROUP || 'all',
    runs = (name) => group === 'all' || group.split(',').includes(name)
  if (runs('references')) await references()
  if (runs('desktop')) await desktop()
  if (runs('phone')) await phone()
  if (runs('romanian')) await romanian()
  if (runs('refresh')) await fastRefresh()
  assert.deepEqual(runtimeErrors, [])
  assert.deepEqual(unexpected, [])
  await writeFile(
    new URL(`summary-${group.replaceAll(',', '-')}.json`, output),
    JSON.stringify({ groups: group, screenshots: reports, available: (await readdir(output)).filter((name) => name.endsWith('.png')).sort(), fastRefreshVerified, fixtureOnly: true }, null, 2)
  )
  console.log(`All synthetic Clips checks passed; ${reports.length} captures; Fast Refresh=${fastRefreshVerified}`)
} finally {
  await browser.close()
}
