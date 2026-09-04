import { auth } from '@/lib/auth'
import { isProductionEnvironment } from '@/lib/environment'

function backendConfiguration() {
  const configured = process.env.BACKEND_URL?.trim()
  const rawUrl = configured || 'http://backend:8000'
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('BACKEND_URL must be a valid URL')
  }

  if (isProductionEnvironment()) {
    if (!configured || url.protocol !== 'https:') {
      throw new Error('Production BACKEND_URL must use a public HTTPS endpoint')
    }
    if (!process.env.INTERNAL_API_KEY?.trim()) {
      throw new Error('INTERNAL_API_KEY is required in production')
    }
  }

  return {
    url: url.toString().replace(/\/$/, ''),
    internalApiKey: process.env.INTERNAL_API_KEY?.trim()
  }
}

export async function backendFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const { url: backendUrl, internalApiKey } = backendConfiguration()
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
  if (internalApiKey) {
    headers.set('x-internal-api-key', internalApiKey)
  }

  return fetch(`${backendUrl}${path}`, {
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
