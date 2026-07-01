import { proxyBackendResponse } from '@/lib/api'
import { auth } from '@/lib/auth'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  const limit = await rateLimit({
    key: rateLimitKey(request, `batch:${session.user.id}`),
    limit: 5,
    windowMs: 60 * 60 * 1000,
  })
  if (limit.limited) {
    return rateLimitedResponse(limit.resetAt)
  }

  return proxyBackendResponse('/api/jobs/batch', {
    method: 'POST',
    body: await request.text(),
  })
}
