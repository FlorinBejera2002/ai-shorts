import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : 'playwright'
)
const origin = process.env.SNEEPCUT_UI_ORIGIN ?? 'http://localhost:3011'
const output = 'test-results/calendar-workspace'
await mkdir(output, { recursive: true })

const user = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Alex',
  email: 'calendar@example.invalid',
  credits: 100,
  plan: 'free',
  access_role: 'member'
}
const clip = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Product story cut',
  viralScore: 8.7,
  captionTiktok: 'A sharp opening hook.',
  captionInstagram: 'A sharp opening hook.',
  captionYoutube: 'A sharp opening hook.'
}
let posts = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    title: 'Product reveal — opening hook',
    caption: 'A first look at the new workflow.',
    notes: 'Approved by the creative lead.',
    platforms: ['instagram', 'tiktok'],
    status: 'scheduled',
    scheduledAt: '2026-09-11T11:35:00.000Z',
    clip,
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z'
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    title: 'Founder lesson carousel',
    caption: 'Three lessons from the build.',
    notes: null,
    platforms: ['linkedin'],
    status: 'draft',
    scheduledAt: '2026-09-14T07:00:00.000Z',
    clip: null,
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z'
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    title: 'Tutorial short',
    caption: 'The fastest way to create a reusable cut.',
    notes: null,
    platforms: ['youtube'],
    status: 'published',
    scheduledAt: '2026-09-18T15:00:00.000Z',
    clip: null,
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z'
  }
]

const browser = await chromium.launch({ headless: true })
try {
  for (const variant of [
    { locale: 'en', prefix: '', width: 1440, height: 1000 },
    { locale: 'ro', prefix: '/ro', width: 390, height: 844 }
  ]) {
    const messages = JSON.parse(
      await readFile(
        new URL(`../messages/${variant.locale}.json`, import.meta.url),
        'utf8'
      )
    )
    const context = await browser.newContext({
      viewport: { width: variant.width, height: variant.height },
      reducedMotion: 'reduce'
    })
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: variant.locale, url: origin }
    ])
    await context.addInitScript(() => localStorage.setItem('theme', 'light'))
    const errors = []
    const patchCalls = []
    await context.route(/\/(?:api|v1)\//, async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (path === '/v1/auth/refresh') {
        return route.fulfill({ json: { access_token: 'synthetic', user } })
      }
      if (path === '/api/calendar' && request.method() === 'GET') {
        return route.fulfill({
          json: { posts, clips: [clip], meta: { truncated: false } }
        })
      }
      if (path.startsWith('/api/calendar/') && request.method() === 'PATCH') {
        const id = path.split('/').at(-1)
        const payload = request.postDataJSON()
        patchCalls.push({ id, payload })
        const current = posts.find((post) => post.id === id)
        const post = {
          ...current,
          ...payload,
          updatedAt: new Date().toISOString()
        }
        posts = posts.map((item) => (item.id === id ? post : item))
        return route.fulfill({ json: { post } })
      }
      if (path === '/api/user/credits') {
        return route.fulfill({ json: { credits: 100, plan: 'free' } })
      }
      return route.fulfill({ json: {} })
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        /MISSING_MESSAGE|Hydration|hydrating/i.test(message.text())
      ) {
        errors.push(message.text())
      }
    })

    await page.goto(`${origin}${variant.prefix}/dashboard/calendar`, {
      waitUntil: 'networkidle'
    })
    await page
      .getByRole('heading', { name: messages.contentCalendar.title })
      .waitFor()
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true
    )
    assert.deepEqual(errors, [])
    await page.screenshot({
      path: `${output}/${variant.locale}-month.png`,
      fullPage: true
    })

    await page
      .getByRole('button', {
        name: messages.contentCalendar.views.week,
        exact: true
      })
      .click()
    await page
      .getByRole('grid', { name: messages.contentCalendar.timeline.label })
      .waitFor()
    await page.screenshot({
      path: `${output}/${variant.locale}-week.png`,
      fullPage: true
    })

    await page
      .getByRole('button', {
        name: messages.contentCalendar.views.day,
        exact: true
      })
      .click()
    assert.equal(
      await page
        .getByRole('grid', { name: messages.contentCalendar.timeline.label })
        .count(),
      1
    )

    await page
      .getByRole('button', {
        name: messages.contentCalendar.views.list,
        exact: true
      })
      .click()
    await page
      .getByRole('searchbox', {
        name: messages.contentCalendar.filters.searchLabel
      })
      .fill('founder')
    assert.equal(
      await page.getByText('Founder lesson carousel', { exact: true }).count(),
      1
    )
    assert.equal(
      await page.getByText('Tutorial short', { exact: true }).count(),
      0
    )
    await page.screenshot({
      path: `${output}/${variant.locale}-list-filtered.png`,
      fullPage: true
    })

    if (variant.locale === 'en') {
      await page
        .getByRole('region', {
          name: messages.contentCalendar.calendarSectionLabel
        })
        .getByRole('button', {
          name: messages.contentCalendar.actions.clearFilters,
          exact: true
        })
        .click()
      await page
        .getByRole('button', {
          name: messages.contentCalendar.views.month,
          exact: true
        })
        .click()
      const source = page.getByRole('button', { name: /Edit Product reveal/ })
      const target = page
        .locator('[data-calendar-day="2026-09-12"]')
        .locator('..')
      await source.dragTo(target)
      await page.waitForFunction(() =>
        document.body.innerText.includes('Post moved to its new time.')
      )
      assert.equal(patchCalls.length, 1)
      assert.match(patchCalls[0].payload.scheduledAt, /^2026-09-12T/)
    }

    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true
    )
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.info(
    'PASS calendar workspace: desktop/mobile layouts, views, filters, and drag rescheduling'
  )
} finally {
  await browser.close()
}
