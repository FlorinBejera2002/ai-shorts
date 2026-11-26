// Audits the static export in out/ (run `pnpm build` first).
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const out = new URL('../out/', import.meta.url)
const read = (path) => readFileSync(new URL(path, out), 'utf8')
const ORIGIN = 'https://sneepcut.com'

const LOCALES = ['en', 'ro', 'es']
const PREFIX = { en: '', ro: '/ro', es: '/es' }
const OG_LOCALE = { en: 'en_US', ro: 'ro_RO', es: 'es_ES' }
const LANGUAGE_TAG = { en: 'en-US', ro: 'ro-RO', es: 'es-ES' }

const LEGAL = ['legal-notice', 'privacy', 'terms', 'cookie-policy', 'acceptable-use', 'refund-policy', 'subprocessors', 'dpa', 'data-deletion']
const FEATURES = [
  'ai-video-clipper', 'long-video-to-shorts', 'auto-captions', 'youtube-to-shorts', 'schedule-social-posts',
  'for/podcasters', 'for/creators', 'for/agencies', 'for/churches-and-speakers',
  'alternatives/opus-clip', 'alternatives/vizard', 'alternatives/klap'
]
const PAGES = ['/', '/pricing', ...FEATURES.map((id) => `/${id}`), ...LEGAL.map((id) => `/${id}`)]
const localized = (locale, path) => (path === '/' ? PREFIX[locale] || '/' : `${PREFIX[locale]}${path}`)
const fileFor = (path) => (path === '/' ? 'index.html' : `${path.slice(1)}.html`)
const absolute = (path) => (path === '/' ? ORIGIN : `${ORIGIN}${path}`)
// Home and pricing pages of every locale, as files in out/.
const HOME_AND_PRICING_FILES = LOCALES.flatMap((locale) => [fileFor(localized(locale, '/')), fileFor(localized(locale, '/pricing'))])

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

test('static export contains every public page in every language', () => {
  for (const locale of LOCALES) {
    for (const path of PAGES) assert.ok(existsSync(new URL(fileFor(localized(locale, path)), out)), `${locale} ${path}`)
  }
  assert.ok(existsSync(new URL('404.html', out)))
  for (const locale of LOCALES.filter((value) => value !== 'en')) {
    assert.ok(existsSync(new URL(`${locale}/404.html`, out)), `${locale} 404`)
  }
})

for (const locale of LOCALES) {
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
      for (const alternate of LOCALES) {
        assert.equal(
          attribute(html, new RegExp(`<link rel="alternate" hrefLang="${alternate}" href="([^"]+)"`)),
          absolute(localized(alternate, path)),
          `hreflang ${alternate}`
        )
      }
      assert.equal(attribute(html, /<link rel="alternate" hrefLang="x-default" href="([^"]+)"/), absolute(localized('en', path)))
      assert.equal(attribute(html, /<meta property="og:locale" content="([^"]+)"/), OG_LOCALE[locale])
      const alternateLocales = [...html.matchAll(/<meta property="og:locale:alternate" content="([^"]+)"/g)].map((match) => match[1])
      assert.deepEqual(alternateLocales.sort(), LOCALES.filter((value) => value !== locale).map((value) => OG_LOCALE[value]).sort())
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
      const inLanguage = jsonLd(html).filter((data) => 'inLanguage' in data).map((data) => data.inLanguage)
      for (const value of inLanguage) assert.equal(value, LANGUAGE_TAG[locale], 'JSON-LD inLanguage')
      assert.doesNotMatch(visibleText(html), /\[PRE[ȚT]\]|undefined|NaN/)
    })
  }
}

test('home and pricing publish Organization, SoftwareApplication and FAQPage data', () => {
  for (const file of HOME_AND_PRICING_FILES) {
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

test('feature pages are long-form, linked and carry FAQ and breadcrumb data', () => {
  for (const locale of LOCALES) {
    for (const id of FEATURES) {
      const file = fileFor(localized(locale, `/${id}`))
      const html = read(file)
      const types = jsonLd(html).map((data) => data['@type'])
      for (const type of ['SoftwareApplication', 'FAQPage', 'BreadcrumbList']) assert.ok(types.includes(type), `${file} ${type}`)
      const text = visibleText(html)
      const words = text.split(/\s+/).filter(Boolean).length
      assert.ok(words >= 700, `${file} has ${words} words`)
      assert.doesNotMatch(text, /viral/i, file)
      // Comparison pages may name a competitor's credits; our own pages never describe usage in credits.
      if (!id.startsWith('alternatives/')) assert.doesNotMatch(text, /\bcredit/i, file)
      for (const other of FEATURES.filter((value) => value !== id)) {
        assert.ok(html.includes(`href="${localized(locale, `/${other}`)}"`), `${file} links ${other}`)
      }
    }
  }
  const titles = FEATURES.map((id) => read(fileFor(`/${id}`)).match(/<title>([^<]+)<\/title>/)[1])
  assert.equal(new Set(titles).size, FEATURES.length, 'unique titles')
})

test('paid offers in JSON-LD only carry prices from the plan catalog', () => {
  for (const file of HOME_AND_PRICING_FILES) {
    const app = jsonLd(read(file)).find((data) => data['@type'] === 'SoftwareApplication')
    for (const offer of app?.offers ?? []) {
      assert.match(offer.price, /^\d+(?:\.\d{2})?$/)
      assert.match(offer.priceCurrency, /^[A-Z]{3}$/)
      if (offer.price !== '0') assert.equal(offer.priceSpecification.billingDuration, 'P1M')
    }
  }
})

test('usage is never described in credits and there is no viral score', () => {
  for (const file of HOME_AND_PRICING_FILES) {
    const text = visibleText(read(file))
    assert.doesNotMatch(text, /\bcredit/i, file)
    assert.doesNotMatch(text, /viral/i, file)
  }
})

test('platforms are always listed Instagram, Facebook, TikTok, YouTube', () => {
  for (const locale of LOCALES) {
    const file = fileFor(localized(locale, '/'))
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
  for (const locale of ['ro', 'es']) {
    const localHome = read(fileFor(localized(locale, '/')))
    assert.match(localHome, new RegExp(`href="${PREFIX[locale]}/dashboard/create"`), `${locale} create`)
    assert.match(localHome, new RegExp(`href="${PREFIX[locale]}/register"`), `${locale} register`)
    assert.match(localHome, new RegExp(`href="${PREFIX[locale]}/login"`), `${locale} login`)
  }
})

test('legal pages keep the operator identity', () => {
  const notice = visibleText(LOCALES.map((locale) => read(fileFor(localized(locale, '/legal-notice')))).join(''))
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
  const spanish = read('es/404.html')
  assert.match(spanish, /<html lang="es"/)
  assert.match(spanish, /<meta name="robots" content="noindex/)
  assert.match(spanish, /Página no encontrada/)
})

test('sitemap lists every page in every language with hreflang alternates and robots points at it', () => {
  const sitemap = read('sitemap.xml')
  for (const locale of LOCALES) {
    for (const path of PAGES) {
      const url = path === '/' && locale === 'en' ? `${ORIGIN}/` : absolute(localized(locale, path))
      assert.ok(sitemap.includes(`<loc>${url}</loc>`), url)
    }
  }
  assert.doesNotMatch(sitemap, /\/(ro|es)\/404|\/login|\/dashboard/)
  // One x-default alternate per URL: every page is listed once per locale.
  assert.equal((sitemap.match(/hreflang="x-default"/g) ?? []).length, PAGES.length * LOCALES.length)
  assert.equal((sitemap.match(/hreflang="es"/g) ?? []).length, PAGES.length * LOCALES.length)
  const robots = read('robots.txt')
  assert.match(robots, /Sitemap: https:\/\/sneepcut\.com\/sitemap\.xml/)
  assert.match(robots, /Disallow: \/dashboard/)
  assert.match(robots, /Disallow: \/api\//)
  assert.match(robots, /Disallow: \/es\/dashboard/)
})
