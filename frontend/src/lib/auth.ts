import { createAuthClient } from '@/lib/auth-client'
import { publishAuthState } from '../stores/auth-store'
import { queryClient } from '../query/query-client'

// Preserve Fetch semantics for binary downloads, request bodies and long uploads.
export const authClient = createAuthClient(
  (...args) => fetch(...args),
  import.meta.env.VITE_API_URL ?? ''
)

let cachedUserId: string | null = null
function syncAuthStore() {
  const snapshot = authClient.getSnapshot()
  const userId = snapshot.user?.id ?? null
  if (userId !== cachedUserId) {
    queryClient.clear()
    cachedUserId = userId
  }
  publishAuthState(snapshot, authClient.getAccessToken())
}

authClient.subscribe(syncAuthStore)
syncAuthStore()

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
  ) {
    return fallback
  }
  return value
}

export function googleSignIn(returnTo: string, locale: string) {
  const query = new URLSearchParams({
    returnTo: safeReturnPath(returnTo),
    locale
  })
  window.location.assign(authClient.url(`/v1/auth/google?${query}`))
}
