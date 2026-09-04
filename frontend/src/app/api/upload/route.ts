import { backendFetch } from '@/lib/api'
import { auth } from '@/lib/auth'
import { isProductionEnvironment } from '@/lib/environment'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (isProductionEnvironment()) {
    return Response.json(
      {
        error:
          'Production uploads must use the authorized direct-upload endpoint'
      },
      { status: 503 }
    )
  }

  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  const limit = await rateLimit({
    key: rateLimitKey(request, `upload:${session.user.id}`),
    limit: 12,
    windowMs: 60 * 60 * 1000
  })
  if (limit.limited) {
    return rateLimitedResponse(limit.resetAt)
  }

  const formData = await request.formData()
  const response = await backendFetch('/api/upload', {
    method: 'POST',
    body: formData
  })

  return new Response(response.body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'application/json'
    }
  })
}
