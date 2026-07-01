import { auth } from '@/lib/auth'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://backend:8000'
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY

export async function backendFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const session = await auth()
  const headers = new Headers(init.headers)
  if (!headers.has('content-type') && !(init.body instanceof FormData)) {
    headers.set('content-type', 'application/json')
  }

  if (session?.user?.id) {
    headers.set('x-user-id', session.user.id)
  }
  if (session?.user?.email) {
    headers.set('x-user-email', session.user.email)
  }
  if (INTERNAL_API_KEY) {
    headers.set('x-internal-api-key', INTERNAL_API_KEY)
  }

  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store'
  })
}

export async function proxyBackendResponse(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const response = await backendFetch(path, init)
  return new Response(response.body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json'
    }
  })
}
