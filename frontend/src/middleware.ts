import createMiddleware from 'next-intl/middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { routing } from './i18n/navigation'

const intlMiddleware = createMiddleware(routing)

const AUTH_COOKIES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
  'next-auth.session-token',
  '__Secure-next-auth.session-token',
]

function stripLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (routing.locales.includes(segments[0] as any)) {
    return '/' + segments.slice(1).join('/')
  }
  return pathname
}

function extractLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean)
  if (routing.locales.includes(segments[0] as any)) {
    return segments[0]
  }
  return routing.defaultLocale
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const pathWithoutLocale = stripLocale(pathname)

  if (pathWithoutLocale.startsWith('/dashboard')) {
    const hasSession = AUTH_COOKIES.some((name) => request.cookies.has(name))
    if (!hasSession) {
      const locale = extractLocale(pathname)
      const prefix = locale === routing.defaultLocale ? '' : `/${locale}`
      const loginUrl = new URL(`${prefix}/login`, request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return intlMiddleware(request)
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|media|.*\\..*).*)'],
}
