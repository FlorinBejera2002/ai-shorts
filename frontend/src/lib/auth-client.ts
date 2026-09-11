export type AuthUser = {
  id: string
  email: string
  name: string | null
  profile_pic: string | null
  credits: number
  plan: string
  access_role: string
  deletion_pending?: boolean
}
export type AuthSnapshot = {
  status:
    | 'loading'
    | 'authenticated'
    | 'anonymous'
    | 'error'
    | 'signing-out'
    | 'logout-error'
  user: AuthUser | null
  error: string | null
}
type AuthResponse = { access_token: string; user: AuthUser }
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message)
  }
}
/** Access credentials stay in memory; refresh JWTs stay in HttpOnly cookies. */
export function createAuthClient(fetcher: typeof fetch, baseUrl = '') {
  let accessToken: string | null = null
  let epoch = 0
  let refreshFlight: Promise<string | null> | null = null
  let logoutFlight: Promise<void> | null = null
  let snapshot: AuthSnapshot = { status: 'loading', user: null, error: null }
  const serverSnapshot = snapshot
  const listeners = new Set<() => void>()
  function publish(next: AuthSnapshot) {
    snapshot = next
    for (const listener of listeners) listener()
  }
  function url(path: string) {
    if (!/^\/(?:api|v1)\//.test(path))
      throw new Error('API requests must use a local /api/ or /v1/ path')
    return `${baseUrl.replace(/\/$/, '')}${path}`
  }
  async function readAuth(response: Response): Promise<AuthResponse> {
    const data = await response.json().catch(() => null)
    if (!response.ok)
      throw new ApiError(
        response.status,
        data?.error ?? 'Authentication failed',
        typeof data?.code === 'string' ? data.code : undefined
      )
    if (typeof data?.access_token !== 'string' || !data?.user?.id)
      throw new ApiError(502, 'Invalid authentication response')
    return data
  }
  async function publicFetch(path: string, init: RequestInit = {}) {
    return fetcher(url(path), {
      ...init,
      credentials: 'include',
      cache: 'no-store'
    })
  }
  function refresh(): Promise<string | null> {
    if (logoutFlight || snapshot.status === 'logout-error')
      return Promise.resolve(null)
    if (refreshFlight) return refreshFlight
    const startedAt = epoch
    const flight = (async () => {
      try {
        const data = await readAuth(
          await publicFetch('/v1/auth/refresh', {
            method: 'POST',
            signal: AbortSignal.timeout(15000)
          })
        )
        if (epoch !== startedAt) return null
        accessToken = data.access_token
        publish({ status: 'authenticated', user: data.user, error: null })
        return accessToken
      } catch (error) {
        if (epoch !== startedAt) return null
        accessToken = null
        const unauthenticated =
          error instanceof ApiError && error.status === 401
        publish({
          status: unauthenticated ? 'anonymous' : 'error',
          user: null,
          error: unauthenticated ? null : 'Unable to connect. Please try again.'
        })
        if (!unauthenticated) throw error
        return null
      }
    })()
    refreshFlight = flight
    void flight
      .finally(() => {
        if (refreshFlight === flight) refreshFlight = null
      })
      .catch(() => undefined)
    return flight
  }
  async function login(email: string, password: string, secondFactor = '') {
    if (logoutFlight) await logoutFlight
    const startedAt = ++epoch
    const data = await readAuth(
      await publicFetch('/v1/auth/login', {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, secondFactor })
      })
    )
    if (epoch !== startedAt) throw new ApiError(401, 'Sign-in cancelled')
    accessToken = data.access_token
    publish({ status: 'authenticated', user: data.user, error: null })
    return data.user
  }
  function clearSession() {
    epoch += 1
    accessToken = null
    publish({ status: 'anonymous', user: null, error: null })
  }
  function logout(): Promise<void> {
    if (logoutFlight) return logoutFlight
    clearSession()
    publish({ status: 'signing-out', user: null, error: null })
    const pendingRefresh = refreshFlight
    // Finish a cookie-writing refresh before remotely revoking its result.
    const flight = (async () => {
      await pendingRefresh?.catch(() => null)
      try {
        const response = await publicFetch('/v1/auth/logout', {
          method: 'POST',
          signal: AbortSignal.timeout(15000)
        })
        if (!response.ok)
          throw new ApiError(
            response.status,
            'Unable to sign out. Please try again.'
          )
        publish({ status: 'anonymous', user: null, error: null })
      } catch (error) {
        publish({
          status: 'logout-error',
          user: null,
          error: 'Unable to sign out. Please try again.'
        })
        throw error
      }
    })()
    logoutFlight = flight
    void flight
      .finally(() => {
        if (logoutFlight === flight) logoutFlight = null
      })
      .catch(() => undefined)
    return flight
  }
  async function apiFetch(
    path: string,
    init: RequestInit = {}
  ): Promise<Response> {
    if (logoutFlight) throw new ApiError(401, 'Signed out')
    const startedAt = epoch
    let token = accessToken ?? (await refresh())
    if (startedAt !== epoch || !token)
      throw new ApiError(401, 'Sign in to continue')
    const request = (bearer: string) => {
      const headers = new Headers(init.headers)
      headers.set('Authorization', `Bearer ${bearer}`)
      return publicFetch(path, { ...init, headers })
    }
    const response = await request(token)
    if (response.status !== 401 || init.signal?.aborted) return response
    if (startedAt !== epoch) return response
    // A concurrent request may already have refreshed this expired token.
    token = accessToken && accessToken !== token ? accessToken : await refresh()
    if (!token || startedAt !== epoch) return response
    const retried = await request(token)
    if (retried.status === 401 && startedAt === epoch) clearSession()
    return retried
  }
  return {
    apiFetch,
    publicFetch,
    login,
    logout,
    refresh,
    clearSession,
    url,
    getAccessToken: () => accessToken,
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}
