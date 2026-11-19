// Audits the static export in out/ (run `pnpm build` first).
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const out = new URL('../out/', import.meta.url)
const read = (path) => readFileSync(new URL(path, out), 'utf8')
const ORIGIN = 'https://sneepcut.com'

const LEGAL = ['legal-notice', 'privacy', 'terms', 'cookie-policy', 'acceptable-use', 'refund-policy', 'subprocessors', 'dpa', 'data-deletion']
const PAGES = ['/', '/pricing', ...LEGAL.map((id) => `/${id}`)]
const localized = (locale, path) => (locale === 'en' ? path : path === '/' ? '/ro' : `/ro${path}`)
const fileFor = (path) => (path === '/' ? 'index.html' : `${path.slice(1)}.html`)
const absolute = (path) => (path === '/' ? ORIGIN : `${ORIGIN}${path}`)

function attribute(html, pattern) {
  const match = html.match(pattern)
  return match ? match[1] : undefined
}

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((match) => {
    const value = JSON.parse(match[1])
    return Array.isArray(value) ? value : [value]
  })
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
}

test('static export contains every public page in both languages', () => {
  for (const locale of ['en', 'ro']) {
    for (const path of PAGES) assert.ok(existsSync(new URL(fileFor(localized(locale, path)), out)), `${locale} ${path}`)
  }
  assert.ok(existsSync(new URL('404.html', out)))
  assert.ok(existsSync(new URL('ro/404.html', out)))
})

for (const locale of ['en', 'ro']) {
  for (const path of PAGES) {
    const url = localized(locale, path)
    test(`${url} has complete metadata, one h1 and valid structured data`, () => {
      const html = read(fileFor(url))
      assert.equal(attribute(html, /<html lang="([^"]+)"/), locale)
      const title = attribute(html, /<title>([^<]+)<\/title>/)
      assert.ok(title && title.length >= 10 && title.length <= 70, `title length: ${title}`)
      const description = attribute(html, /<meta name="description" content="([^"]+)"/)
      assert.ok(description && description.length >= 50 && description.length <= 170, `description: ${description}`)
      assert.equal(attribute(html, /<link rel="canonical" href="([^"]+)"/), absolute(url))
      assert.equal(attribute(html, /<link rel="alternate" hrefLang="en" href="([^"]+)"/), absolute(localized('en', path)))
      assert.equal(attribute(html, /<link rel="alternate" hrefLang="ro" href="([^"]+)"/), absolute(localized('ro', path)))
      assert.equal(attribute(html, /<link rel="alternate" hrefLang="x-default" href="([^"]+)"/), absolute(localized('en', path)))
      assert.match(html, /<meta name="robots" content="index, follow"\/>/)
      assert.equal(attribute(html, /<meta property="og:url" content="([^"]+)"/), absolute(url))
      assert.match(html, /<meta property="og:image" content="https:\/\/sneepcut\.com\/landing\/brand\/og\.png"\/>/)
      assert.match(html, /<meta name="twitter:card" content="summary_large_image"\/>/)
      assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, 'exactly one h1')
      for (const image of html.matchAll(/<img\b[^>]*>/g)) {
        assert.match(image[0], /\balt="/, `img without alt: ${image[0].slice(0, 80)}`)
        assert.match(image[0], /\bwidth="\d+"/, `img without width: ${image[0].slice(0, 80)}`)
      }
      for (const data of jsonLd(html)) assert.equal(data['@context'], 'https://schema.org')
      assert.doesNotMatch(visibleText(html), /\[PRE[ȚT]\]|undefined|NaN/)
    })
  }
}

test('home and pricing publish Organization, SoftwareApplication and FAQPage data', () => {
  for (const file of ['index.html', 'ro.html', 'pricing.html', 'ro/pricing.html']) {
    const types = jsonLd(read(file)).map((data) => data['@type'])
    assert.ok(types.includes('SoftwareApplication'), file)
    assert.ok(types.includes('FAQPage'), file)
  }
  const home = jsonLd(read('index.html'))
  const organization = home.find((data) => data['@type'] === 'Organization')
  assert.equal(organization.legalName, 'GENESIS PROCUREMENT S.R.L.')
  const faq = home.find((data) => data['@type'] === 'FAQPage')
  assert.ok(faq.mainEntity.length >= 5)
  for (const question of faq.mainEntity) assert.ok(question.acceptedAnswer.text.length > 20)
})

test('paid offers in JSON-LD only carry prices from the plan catalog', () => {
  const app = jsonLd(read('pricing.html')).find((data) => data['@type'] === 'SoftwareApplication')
  for (const offer of app.offers ?? []) {
    assert.match(offer.price, /^\d+(?:\.\d{2})?$/)
    assert.match(offer.priceCurrency, /^[A-Z]{3}$/)
    if (offer.price !== '0') assert.equal(offer.priceSpecification.billingDuration, 'P1M')
  }
})

test('usage is never described in credits and there is no viral score', () => {
  for (const file of ['index.html', 'ro.html', 'pricing.html', 'ro/pricing.html']) {
    const text = visibleText(read(file))
    assert.doesNotMatch(text, /\bcredit/i, file)
    assert.doesNotMatch(text, /viral/i, file)
  }
})

test('platforms are always listed Instagram, Facebook, TikTok, YouTube', () => {
  for (const file of ['index.html', 'ro.html']) {
    const html = read(file)
    const strip = html.slice(html.indexOf('id="platforms-title"'))
    const positions = ['instagram', 'facebook', 'tiktok', 'youtube'].map((name) => strip.indexOf(`/landing/platforms/${name}.svg`))
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, file)
    assert.ok(positions.every((position) => position >= 0))
  }
})

test('calls to action point at the web app routes', () => {
  const home = read('index.html')
  assert.match(home, /href="\/dashboard\/create"/)
  assert.match(home, /href="\/register"/)
  assert.match(home, /href="\/login"/)
  const roHome = read('ro.html')
  assert.match(roHome, /href="\/ro\/dashboard\/create"/)
  assert.match(roHome, /href="\/ro\/register"/)
  assert.match(roHome, /href="\/ro\/login"/)
})

test('legal pages keep the operator identity', () => {
  const notice = visibleText(read('legal-notice.html') + read('ro/legal-notice.html'))
  for (const value of ['GENESIS PROCUREMENT S.R.L.', '54235600', 'J2026016652004', '+40 748 398 317', 'admin@sneepcut.com']) {
    assert.ok(notice.includes(value), value)
  }
})

test('404 pages are noindex and localized', () => {
  const english = read('404.html')
  assert.match(english, /<html lang="en"/)
  assert.match(english, /<meta name="robots" content="noindex/)
  assert.equal((english.match(/<h1[\s>]/g) ?? []).length, 1)
  const romanian = read('ro/404.html')
  assert.match(romanian, /<html lang="ro"/)
  assert.match(romanian, /<meta name="robots" content="noindex/)
  assert.match(romanian, /Pagina nu există/)
})

test('sitemap lists every page with hreflang alternates and robots points at it', () => {
  const sitemap = read('sitemap.xml')
  for (const locale of ['en', 'ro']) {
    for (const path of PAGES) {
      const url = path === '/' && locale === 'en' ? `${ORIGIN}/` : absolute(localized(locale, path))
      assert.ok(sitemap.includes(`<loc>${url}</loc>`), url)
    }
  }
  assert.doesNotMatch(sitemap, /\/ro\/404|\/login|\/dashboard/)
  assert.equal((sitemap.match(/hreflang="x-default"/g) ?? []).length, PAGES.length * 2)
  const robots = read('robots.txt')
  assert.match(robots, /Sitemap: https:\/\/sneepcut\.com\/sitemap\.xml/)
  assert.match(robots, /Disallow: \/dashboard/)
  assert.match(robots, /Disallow: \/api\//)
})
