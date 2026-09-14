import assert from 'node:assert/strict'

const baseUrl = new URL(process.argv[2] ?? 'http://localhost:3000')
assert.ok(
  ['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname),
  'Smoke tests are restricted to a local test server'
)
assert.ok(['http:', 'https:'].includes(baseUrl.protocol))
assert.equal(baseUrl.username + baseUrl.password, '')

let passed = 0
async function check(path, verify, accessToken) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: 'manual',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    signal: AbortSignal.timeout(30_000)
  })
  const body = await response.text()
  verify(response, body)
  passed += 1
  console.info(`PASS ${path}`)
}

function verifyHtml(path, response, body) {
  assert.equal(response.status, 200, `${path} must render`)
  assert.match(response.headers.get('content-type') ?? '', /text\/html/)
  // Account pages hydrate from Go; their server response contains only a loading state.
  if (path.includes('/dashboard') || ['/login', '/reset-password', '/activate'].includes(path)) {
    assert.ok(/role="status"|<h1\b/.test(body), `${path} needs an accessible loading state`)
  } else assert.ok(/<h1\b/.test(body), `${path} needs a heading`)
  assert.match(body, /Sneepcut|sneepcut/)
  assert.doesNotMatch(body, /Application error: a server-side exception/)
  for (const script of body.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/g
  )) {
    if (!/\bsrc\s*=/.test(script[1])) {
      assert.doesNotMatch(
        script[2],
        /\b__name\s*\(/,
        `${path} must not leak bundler helpers into inline browser scripts`
      )
    }
  }
}

for (const path of [
  '/',
  '/ro',
  '/pricing',
  '/ro/pricing',
  '/privacy',
  '/ro/privacy',
  '/terms',
  '/ro/terms',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password'
]) {
  await check(path, (response, body) => {
    verifyHtml(path, response, body)
  })
}

for (const path of [
  '/dashboard/settings',
  '/dashboard/clips',
  '/dashboard/billing',
  '/dashboard/script-generator',
  '/ro/dashboard/settings'
]) {
  await check(path, (response, body) => {
    assert.equal(response.status, 200)
    assert.match(body, /role="status"/)
    assert.match(response.headers.get('x-robots-tag') ?? '', /noindex/)
  })
}

for (const path of [
  '/api/user/profile',
  '/api/user/data',
  '/api/user/credits',
  '/api/user/brand',
  '/api/stripe/billing'
]) {
  await check(path, (response) => {
    assert.equal(response.status, 401, `${path} must reject anonymous access`)
  })
}

await check('/sitemap.xml', (response, body) => {
  assert.equal(response.status, 200)
  assert.match(body, /<urlset/)
  assert.match(body, /\/ro\/pricing/)
  assert.doesNotMatch(body, /\/dashboard|\/api\/|\/login/)
})
await check('/robots.txt', (response, body) => {
  assert.equal(response.status, 200)
  // Development/preview environments intentionally disallow the entire site.
  if (!/^Disallow: \/$/m.test(body)) {
    assert.match(body, /Disallow: \/api/)
    assert.match(body, /Disallow: \/dashboard/)
  }
  assert.match(body, /Sitemap: /)
})

// Optional, read-only authenticated coverage. Use only a synthetic account on
// the disposable local test database; never paste a production token here.
const smokeAccessToken = process.env.SNEEPCUT_SMOKE_ACCESS_TOKEN
if (smokeAccessToken) {
  for (const path of [
    '/dashboard',
    '/dashboard/create',
    '/dashboard/clips',
    '/dashboard/clips?search=missing&score=high&page=999',
    '/dashboard/history',
    '/dashboard/review',
    '/dashboard/publish',
    '/dashboard/analytics',
    '/dashboard/brand',
    '/dashboard/script-generator',
    '/dashboard/settings',
    '/dashboard/billing',
    '/ro/dashboard/settings',
    '/ro/dashboard/clips',
    '/ro/dashboard/billing',
    '/ro/dashboard/script-generator',
    '/ro/dashboard/publish'
  ]) {
    await check(
      path,
      (response, body) => verifyHtml(path, response, body),
      smokeAccessToken
    )
  }

  for (const path of [
    '/api/user/profile',
    '/api/user/data',
    '/api/user/credits',
    '/api/user/brand',
    '/api/stripe/billing',
    '/api/calendar?start=2026-09-01T00%3A00%3A00.000Z&end=2026-10-01T00%3A00%3A00.000Z'
  ]) {
    await check(
      path,
      (response, body) => {
        assert.equal(response.status, 200, `${path} must load for a test user`)
        assert.match(
          response.headers.get('content-type') ?? '',
          /application\/json/
        )
        assert.ok(JSON.parse(body))
        assert.doesNotMatch(
          body,
          /"(?:passwordHash|sessionToken|access_token)"/
        )
      },
      smokeAccessToken
    )
  }
}

console.info(`\n${passed} local HTTP smoke checks passed.`)
