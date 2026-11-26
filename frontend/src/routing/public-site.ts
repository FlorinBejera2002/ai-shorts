import { PUBLIC_ROUTES } from '@/lib/site-config'

/**
 * Public marketing and legal pages are served by the separate static site in
 * `landing/` (see deploy/Caddyfile). The SPA must leave them with a full
 * document load instead of rendering its own copy client-side.
 */
const PUBLIC_SITE_PATHS = new Set<string>(
  PUBLIC_ROUTES.flatMap((route) => [route || '/', `/ro${route}`, `/es${route}`])
)

export function isPublicSitePath(href: string): boolean {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(href)) return false
  const { pathname } = new URL(href, 'https://sneepcut.local')
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return PUBLIC_SITE_PATHS.has(normalized)
}
