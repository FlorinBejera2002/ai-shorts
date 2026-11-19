import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('links to public pages reload the document so the static site serves them', () => {
  const link = read('../src/i18n/navigation-link.tsx')
  assert.match(link, /reloadDocument=\{reloadDocument \?\? isPublicSitePath\(to\)\}/)
  const paths = read('../src/routing/public-site.ts')
  assert.match(paths, /PUBLIC_ROUTES\.flatMap/)
  assert.match(paths, /`\/ro\$\{route\}`/)
})

test('in-app navigation to a public page leaves the SPA', () => {
  const route = read('../src/routing/public-site-route.tsx')
  assert.match(route, /navigationType !== 'POP'/)
  assert.match(route, /window\.location\.replace/)
  const app = read('../src/App.tsx')
  for (const element of ['HomeRoute', 'PricingRoute', 'PrivacyRoute', 'TermsRoute', 'DataDeletionRoute', 'AdditionalLegalRoute page=\\{page\\}']) {
    assert.match(app, new RegExp(`<PublicSiteRoute><${element} /></PublicSiteRoute>`), element)
  }
})

test('the gateway sends app routes to the SPA and everything else to the static site', () => {
  const caddy = read('../../deploy/Caddyfile')
  const site = caddy.slice(caddy.indexOf('sneepcut.com, www.sneepcut.com {'), caddy.indexOf('api.sneepcut.com {'))
  assert.match(site, /@web_app path [^\n]*\/dashboard\*[^\n]*\/login\*[^\n]*\/register\*[^\n]*\/studio-session\*[^\n]*\/ro\/dashboard\*[^\n]*\/assets\/\*/)
  assert.match(site, /@landing_assets path \/_next\/\* \/landing\/\* \/robots\.txt \/sitemap\.xml/)
  const order = ['handle @application_api', 'handle @landing_assets', 'handle @web_app {', 'handle @web_app_files', 'handle {\n\t\treverse_proxy landing:8080']
  const positions = order.map((marker) => site.indexOf(marker))
  assert.ok(positions.every((position) => position >= 0), JSON.stringify(positions))
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)
  const compose = read('../../docker-compose.production.yml')
  assert.match(compose, /\n {2}landing:\r?\n {4}build:\r?\n {6}context: \.\/landing/)
})
