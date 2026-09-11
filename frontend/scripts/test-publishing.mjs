// Isolated browser verification: all API and external requests are synthetic.
import assert from 'node:assert/strict'
import { mkdir, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
)
const base = process.env.SNEEPCUT_UI_ORIGIN ?? 'http://localhost:3010'
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname))
await mkdir('test-results/publishing', { recursive: true })
const browser = await chromium.launch({ headless: true })
try {
  for (const locale of (process.env.SNEEPCUT_UI_LOCALES ?? 'en,ro').split(
    ','
  )) {
    const m = JSON.parse(
      await readFile(`messages/${locale}.json`, 'utf8')
    ).publishing
    const context = await browser.newContext({
      viewport: { width: locale === 'en' ? 1440 : 390, height: 1000 }
    })
    await context.addCookies([
      { name: 'NEXT_LOCALE', value: locale, url: base }
    ])
    const user = {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Alex',
      email: 'publishing@example.invalid',
      credits: 100,
      plan: 'pro',
      access_role: 'member'
    }
    const providers = ['instagram', 'facebook', 'tiktok'].map((id) => ({
      id,
      name: id === 'tiktok' ? 'TikTok' : id[0].toUpperCase() + id.slice(1),
      configured: false
    }))
    const accounts = providers.map((p, i) => ({
      id: `account-${i}`,
      provider: p.id,
      name: `Alex ${p.name}`,
      username: `alex_${p.id}`,
      status: 'connected'
    }))
    let connected = false,
      posts = [],
      submitCalls = [],
      optionCalls = 0
    const unexpected = []
    await context.route(/\/(?:api|v1)\//, async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname
      let body
      if (path === '/v1/auth/refresh')
        body = { access_token: 'synthetic', user }
      else if (path === '/api/publishing')
        body = {
          providers: providers.map((p) => ({ ...p, configured: connected })),
          accounts: connected ? accounts : [],
          clips: [
            {
              id: 'clip-1',
              title: 'A moment worth sharing',
              duration: 30,
              tiktokEligible: true
            }
          ],
          posts
        }
      else if (path === '/api/publishing/connect/instagram') {
        assert.equal(req.postDataJSON().locale, locale)
        body = {
          url:
            base +
            (locale === 'ro' ? '/ro' : '') +
            '/dashboard/publish?connected=instagram'
        }
      } else if (path.endsWith('/options')) {
        optionCalls++
        body = {
          privacyLevels: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'],
          commentDisabled: false,
          duetDisabled: true,
          stitchDisabled: false,
          maxDuration: 180,
          nickname: 'Alex TikTok'
        }
      } else if (path === '/api/publishing/posts') {
        submitCalls.push(req.postDataJSON())
        if (submitCalls.length === 1)
          return route.fulfill({
            status: 503,
            json: { error: 'Temporary synthetic failure' }
          })
        posts = submitCalls
          .at(-1)
          .accountIds.map((accountId, i) => ({
            id: `post-${i}`,
            accountId,
            clipId: 'clip-1',
            provider: accounts.find((a) => a.id === accountId).provider,
            status: i === 0 ? 'unknown' : 'published',
            createdAt: '2026-09-07T12:00:00Z'
          }))
        body = { posts }
      } else if (
        req.method() === 'DELETE' &&
        path.startsWith('/api/publishing/accounts/')
      ) {
        accounts.splice(
          accounts.findIndex((a) => path.endsWith(a.id)),
          1
        )
        body = { ok: true }
      } else {
        unexpected.push(path)
        return route.abort()
      }
      await route.fulfill({ json: body })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(60000)
    page.setDefaultNavigationTimeout(120000)
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    const url = `${base}${locale === 'ro' ? '/ro' : ''}/dashboard/publish`
    console.log('Publishing unavailable', locale)
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: m.accounts, exact: true }).waitFor()
    assert.equal(
      await page.getByText(m.unavailable, { exact: true }).count(),
      3
    )
    assert.equal(
      await page.getByRole('button', { name: m.connect, exact: true }).count(),
      0
    )
    assert.equal(
      await page
        .getByRole('button', { name: m.review, exact: true })
        .isDisabled(),
      true
    )
    await page.screenshot({
      path: `test-results/publishing/${locale}-unavailable.png`,
      fullPage: true
    })
    connected = true
    await page.getByRole('button', { name: m.refresh, exact: true }).click()
    await page
      .getByRole('button', { name: m.connectAnother, exact: true })
      .first()
      .waitFor()
    assert.equal(await page.locator('[data-platform-mark]').count(), 9)
    assert.equal(
      await page
        .getByRole('button', { name: m.connectAnother, exact: true })
        .count(),
      3
    )
    await page.getByLabel(m.clip, { exact: true }).selectOption('clip-1')
    await page.getByRole('checkbox', { name: /Alex Instagram/ }).check()
    await page.getByRole('checkbox', { name: /Alex TikTok/ }).check()
    await page.getByLabel(m.privacy, { exact: true }).waitFor()
    assert.equal(optionCalls, 1)
    assert.equal(
      await page.getByLabel(m.privacy, { exact: true }).inputValue(),
      ''
    )
    assert.equal(
      await page
        .getByRole('checkbox', { name: m.comments, exact: true })
        .isChecked(),
      false
    )
    assert.equal(
      await page
        .getByRole('checkbox', { name: m.duet, exact: true })
        .isDisabled(),
      true
    )
    assert.equal(
      await page
        .getByRole('button', { name: m.review, exact: true })
        .isDisabled(),
      true
    )
    await page.getByLabel(m.privacy, { exact: true }).selectOption('SELF_ONLY')
    await page
      .getByRole('checkbox', { name: m.commercial, exact: true })
      .check()
    await page.getByRole('checkbox', { name: m.paidBrand, exact: true }).check()
    await page.getByText(m.brandPrivacy, { exact: true }).waitFor()
    await page
      .getByLabel(m.privacy, { exact: true })
      .selectOption('PUBLIC_TO_EVERYONE')
    await page.getByRole('checkbox', { name: new RegExp(m.consent) }).check()
    await page
      .getByLabel(m.caption, { exact: true })
      .fill('A useful idea for your next project.')
    await page.getByRole('button', { name: m.review, exact: true }).click()
    assert.equal(submitCalls.length, 0, 'Review must not publish')
    await page.screenshot({
      path: `test-results/publishing/${locale}-review.png`,
      fullPage: true
    })
    await page.getByRole('button', { name: m.publishNow, exact: true }).click()
    await page
      .getByRole('alert')
      .filter({ hasText: 'Temporary synthetic failure' })
      .waitFor()
    await page.getByRole('button', { name: m.publishNow, exact: true }).click()
    await page.getByText(m.submitted, { exact: true }).waitFor()
    assert.equal(submitCalls.length, 2)
    assert.equal(submitCalls[0].idempotencyKey, submitCalls[1].idempotencyKey)
    assert.equal(submitCalls[1].confirmed, true)
    assert.equal(submitCalls[1].tiktok.disableDuet, true)
    assert.equal(submitCalls[1].tiktok.musicUsageConfirmed, true)
    await page.getByText(m.unknownHint, { exact: true }).waitFor()
    page.once('dialog', (dialog) => dialog.accept())
    await page
      .getByRole('button', { name: m.disconnect, exact: true })
      .first()
      .click()
    await page.waitForFunction(
      () => !document.body.innerText.includes('@alex_instagram')
    )
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true
    )
    await page
      .getByRole('button', { name: m.connect, exact: true })
      .first()
      .click()
    await page.getByText(m.connected, { exact: true }).waitFor()
    assert.deepEqual(errors, [])
    assert.deepEqual(unexpected, [])
    console.log(
      `PASS ${locale}: unavailable, multi-account, fresh creator settings, privacy, interactions, commercial disclosure, review, idempotent retry, status, disconnect, responsive`
    )
    await context.close()
  }
} finally {
  await browser.close()
}
