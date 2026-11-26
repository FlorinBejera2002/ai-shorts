import type { MetadataRoute } from 'next'
import { locales, localePath } from '@/lib/i18n'
import { absoluteUrl, isIndexable, siteUrl } from '@/lib/site'

export const dynamic = 'force-static'

/** App, API and auth routes are served by the web app and stay out of the index. */
const APP_PATHS = ['/dashboard', '/login', '/register', '/forgot-password', '/reset-password', '/activate']

const PRIVATE_PATHS = [
  '/api/',
  '/v1/',
  '/media/',
  '/studio-session',
  ...APP_PATHS,
  // Localized 404 pages are served with status 404 and should not be indexed.
  ...locales.flatMap((locale) => {
    if (locale === 'en') return []
    return [...APP_PATHS.map((path) => localePath(locale, path)), localePath(locale, '/404')]
  })
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: isIndexable()
      ? { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS }
      : { userAgent: '*', disallow: '/' },
    sitemap: absoluteUrl('/sitemap.xml'),
    host: siteUrl().origin
  }
}
