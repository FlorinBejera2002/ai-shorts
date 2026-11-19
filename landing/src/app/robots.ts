import type { MetadataRoute } from 'next'
import { absoluteUrl, isIndexable, siteUrl } from '@/lib/site'

export const dynamic = 'force-static'

/** App, API and auth routes are served by the web app and stay out of the index. */
const PRIVATE_PATHS = [
  '/api/',
  '/v1/',
  '/media/',
  '/dashboard',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/activate',
  '/studio-session',
  '/ro/dashboard',
  '/ro/login',
  '/ro/register',
  '/ro/forgot-password',
  '/ro/reset-password',
  '/ro/activate',
  '/ro/404'
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
