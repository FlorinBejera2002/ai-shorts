import createMiddleware from 'next-intl/middleware'
import { type NextRequest } from 'next/server'
import { routing } from './i18n/navigation'

const intlMiddleware = createMiddleware(routing)

const NOINDEX_ROUTES = [
  '/dashboard',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/activate'
]

function stripLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if ((routing.locales as readonly string[]).includes(segments[0] ?? '')) {
    return '/' + segments.slice(1).join('/')
  }
  return pathname
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const pathWithoutLocale = stripLocale(pathname)

  const response = intlMiddleware(request)
  if (
    NOINDEX_ROUTES.some(
      (route) =>
        pathWithoutLocale === route || pathWithoutLocale.startsWith(`${route}/`)
    )
  ) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
  }

  return response
}

export const config = {
  matcher: ['/((?!api|v1|_next|_vercel|media|.*\\..*).*)']
}
