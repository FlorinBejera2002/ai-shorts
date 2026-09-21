import type { Plugin } from 'vite'
import { buildRobotsPolicy, buildSitemapEntries } from './src/lib/site-config'

const escapeXml = (value: string) => value.replace(/[<>&"']/g, (character) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
})[character]!)

export function siteAssets(siteUrl: URL): Plugin {
  const policy = buildRobotsPolicy(siteUrl)
  const rules = policy.rules
  const disallow = Array.isArray(rules.disallow) ? rules.disallow : [rules.disallow]
  const robots = [
    `User-agent: ${rules.userAgent}`,
    ...('allow' in rules && rules.allow ? [`Allow: ${rules.allow}`] : []),
    ...disallow.map((path) => `Disallow: ${path}`),
    `Sitemap: ${policy.sitemap}`,
    `Host: ${policy.host}`, ''
  ].join('\n')
  const urls = buildSitemapEntries(siteUrl).map((entry) => {
    const alternates = Object.entries(entry.alternates.languages).map(([language, url]) =>
      `<xhtml:link rel="alternate" hreflang="${escapeXml(language)}" href="${escapeXml(url)}"/>`
    ).join('')
    return `<url><loc>${escapeXml(entry.url)}</loc>${alternates}</url>`
  }).join('')
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`
  const assets = { '/robots.txt': robots, '/sitemap.xml': sitemap }
  return {
    name: 'sneepcut-site-assets',
    generateBundle() {
      for (const [path, source] of Object.entries(assets)) {
        this.emitFile({ type: 'asset', fileName: path.slice(1), source })
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0]
        if (path !== '/robots.txt' && path !== '/sitemap.xml') return next()
        response.setHeader('Content-Type', path.endsWith('.xml') ? 'application/xml' : 'text/plain; charset=utf-8')
        response.end(assets[path])
      })
    }
  }
}
