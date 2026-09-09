import { createAuthClient } from '@/lib/auth-client'
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { publishAuthState } from '../stores/auth-store'

const transport = axios.create({
  timeout: 15_000,
  withCredentials: true,
  validateStatus: () => true
})

transport.interceptors.request.use(
  (config) => {
    config.withCredentials = true
    config.headers.set('Accept', 'application/json')
    return config
  },
  undefined,
  { synchronous: true }
)

function responseBody(response: AxiosResponse): BodyInit | null {
  if ([204, 205, 304].includes(response.status) || response.data == null) {
    return null
  }
  if (
    typeof response.data === 'string' ||
    response.data instanceof Blob ||
    response.data instanceof ArrayBuffer
  ) {
    return response.data
  }
  return JSON.stringify(response.data)
}

async function axiosFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  const config: AxiosRequestConfig = {
    url,
    method: init.method ?? (input instanceof Request ? input.method : 'GET'),
    headers: Object.fromEntries(headers),
    data: init.body,
    signal: init.signal ?? undefined
  }
  const response = await transport.request(config)
  const responseHeaders = new Headers()
  for (const [key, value] of Object.entries(response.headers)) {
    if (value != null) responseHeaders.set(key, String(value))
  }
  if (
    response.data != null &&
    typeof response.data === 'object' &&
    !(response.data instanceof Blob) &&
    !(response.data instanceof ArrayBuffer) &&
    !responseHeaders.has('content-type')
  ) {
    responseHeaders.set('content-type', 'application/json')
  }
  return new Response(responseBody(response), {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  })
}

export const authClient = createAuthClient(
  axiosFetch as typeof fetch,
  import.meta.env.VITE_API_URL ?? ''
)

function syncAuthStore() {
  publishAuthState(authClient.getSnapshot(), authClient.getAccessToken())
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
