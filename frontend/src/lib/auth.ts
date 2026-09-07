'use client'
import { createAuthClient } from './auth-client'
export const authClient = createAuthClient(
  (...args) => fetch(...args),
  process.env.NEXT_PUBLIC_API_URL ?? ''
)
export const apiFetch = authClient.apiFetch
export const publicApiFetch = authClient.publicFetch
export function safeReturnPath(
  value: string | null | undefined,
  fallback = '/dashboard'
) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  )
    return fallback
  return value
}
export function googleSignIn(returnTo: string, locale: string) {
  const query = new URLSearchParams({
    returnTo: safeReturnPath(returnTo),
    locale
  })
  window.location.assign(authClient.url(`/v1/auth/google?${query}`))
}
