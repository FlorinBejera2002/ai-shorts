import { backendFetch } from '@/lib/api'
import { auth } from '@/lib/auth'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = await rateLimit({
    key: rateLimitKey(request, `assistant:${session.user.id}`),
    limit: 40,
    windowMs: 60 * 60 * 1000
  })
  if (limit.limited) {
    return rateLimitedResponse(limit.resetAt)
  }

  const body = await request.text()
  const res = await backendFetch('/api/assistant/chat', {
    method: 'POST',
    body
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
