// Run against a local Next server. All account and clip data is synthetic.
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'

const playwrightPath =
  process.env.PLAYWRIGHT_MODULE ??
  fileURLToPath(
    new URL(
      '../../.cache/deploy-browser/node_modules/playwright/index.mjs',
      import.meta.url
    )
  )
const { chromium } = await import(pathToFileURL(playwrightPath).href)
const base = process.env.SNEEPCUT_UI_ORIGIN ?? 'http://localhost:3109'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))

const clipId = '11111111-1111-4111-8111-111111111111'
const clips = Array.from({ length: 8 }, (_, index) => ({
  id:
    index === 0
      ? clipId
      : `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
  title: `Synthetic clip ${index + 1}`,
  hookText: 'A clear hook for a synthetic browser fixture.',
  viralScore: 8.4,
  scoreReason: 'Clear opening',
  startTime: 0,
  endTime: 22,
  duration: 22,
  fileUrl: null,
  thumbnailUrl: null,
  fileSize: 1024,
  resolution: '1080p',
  aspectRatio: '9:16',
  hasSubtitles: true,
  transcriptText: 'Synthetic transcript',
  createdAt: '2026-09-11T10:00:00Z',
  captionTiktok: null,
  captionInstagram: null,
  captionYoutube: null,
  suggestedHashtags: null
}))
const user = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Synthetic',
  email: 'synthetic@example.invalid',
  credits: 100,
  plan: 'free',
  access_role: 'member'
}

const browser = await chromium.launch({ headless: true })
await mkdir('test-results/studio-clips-gallery', { recursive: true })
try {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 }
  ]) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: 'reduce'
    })
    await context.route(/\/(?:api|v1)\//, async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname === '/v1/auth/refresh') {
        return route.fulfill({ json: { access_token: 'synthetic', user } })
      }
      if (url.pathname === '/api/user/credits') {
        return route.fulfill({ json: { credits: 100, plan: 'free' } })
      }
      if (url.pathname === '/api/clips/library') {
        return route.fulfill({
          json: { clips, total: clips.length, currentPage: 1, totalPages: 1 }
        })
      }
      return route.fulfill({ json: {} })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${base}/dashboard/studio`, {
      waitUntil: 'networkidle',
      timeout: 120000
    })

    const cards = page.locator('main article')
    await cards.first().waitFor()
    assert.equal(await cards.count(), clips.length)
    assert.equal(await page.locator('iframe').count(), 0)
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true,
      `${viewport.name}: no horizontal overflow`
    )
    const columns = new Set(
      await cards.evaluateAll((nodes) =>
        nodes.map((node) => Math.round(node.getBoundingClientRect().left))
      )
    ).size
    assert.ok(
      viewport.name === 'desktop' ? columns >= 3 : columns === 1,
      `${viewport.name}: expected responsive gallery columns, got ${columns}`
    )
    const editLinks = cards.getByRole('link', { name: 'Open in editor' })
    assert.equal(await editLinks.count(), clips.length)
    assert.equal(
      await editLinks.first().getAttribute('href'),
      `/dashboard/clips/${clipId}/edit`
    )
    await page.screenshot({
      path: `test-results/studio-clips-gallery/${viewport.name}.png`,
      fullPage: true
    })
    assert.deepEqual(errors, [])

    if (viewport.name === 'desktop') {
      await editLinks.first().click()
      await page.waitForURL(`**/dashboard/clips/${clipId}/edit`)
    }
    await context.close()
  }
  console.info(
    'PASS studio clips gallery: full width, responsive and editor-linked'
  )
} finally {
  await browser.close()
}
