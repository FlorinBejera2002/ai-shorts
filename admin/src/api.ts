export type AdminUser = {
  id: string
  email: string
  name: string | null
  plan: string
  credits: number
  accessRole: 'member' | 'viewer' | 'admin'
  accountStatus: 'active' | 'suspended'
  createdAt: string
  lastSeenAt: string | null
  jobsCount: number
  clipsCount: number
}

export type SessionUser = {
  id: string
  email: string
  name: string | null
  access_role: string
}

type AuthResponse = { access_token: string; user: SessionUser }
const apiOrigin = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

class AdminApi {
  private token: string | null = null

  private async parse<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new ApiError(response.status, body?.error ?? 'Operațiunea a eșuat')
    return body as T
  }

  private publicRequest(path: string, init: RequestInit = {}) {
    return fetch(`${apiOrigin}${path}`, { ...init, credentials: 'include', cache: 'no-store' })
  }

  async restore() {
    const response = await this.publicRequest('/v1/auth/refresh', { method: 'POST' })
    if (response.status === 401) return null
    const auth = await this.parse<AuthResponse>(response)
    this.assertAdmin(auth.user)
    this.token = auth.access_token
    return auth.user
  }

  async login(email: string, password: string, secondFactor: string) {
    const auth = await this.parse<AuthResponse>(
      await this.publicRequest('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, secondFactor })
      })
    )
    this.assertAdmin(auth.user)
    this.token = auth.access_token
    return auth.user
  }

  googleSignIn() {
    const query = new URLSearchParams({
      locale: 'ro',
      returnOrigin: window.location.origin,
      returnTo: '/dashboard'
    })
    window.location.assign(`${apiOrigin}/v1/auth/google?${query}`)
  }

  async logout() {
    this.token = null
    await this.publicRequest('/v1/auth/logout', { method: 'POST' })
  }

  private assertAdmin(user: SessionUser) {
    if (user.access_role !== 'admin') {
      void this.publicRequest('/v1/auth/logout', { method: 'POST' })
      throw new ApiError(403, 'Contul nu are acces la consola administrativă')
    }
  }

  async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    if (!this.token) {
      const user = await this.restore()
      if (!user) throw new ApiError(401, 'Sesiunea a expirat')
    }
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${this.token}`)
    const response = await this.publicRequest(path, { ...init, headers })
    if (response.status === 401 && retry) {
      this.token = null
      const user = await this.restore()
      if (user) return this.request<T>(path, init, false)
    }
    return this.parse<T>(response)
  }
}

export const api = new AdminApi()
