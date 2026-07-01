import { NextResponse, type NextRequest } from 'next/server'

const AUTH_COOKIES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
  'next-auth.session-token',
  '__Secure-next-auth.session-token'
]

export function middleware(request: NextRequest) {
  const hasSession = AUTH_COOKIES.some((name) => request.cookies.has(name))

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*']
}
