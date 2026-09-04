import { backendFetch } from '@/lib/api'
import { auth } from '@/lib/auth'
import { isUuid } from '@/lib/clips-library'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import { RequestBodyTooLargeError, readBoundedJson } from '@/lib/request-body'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!isUuid(id)) {
    return NextResponse.json(
      { error: 'Invalid clip identifier' },
      { status: 400 }
    )
  }
  const limit = await rateLimit({
    key: rateLimitKey(request, `recut-clip:${session.user.id}`),
    limit: 30,
    windowMs: 60 * 60 * 1000
  })
  if (limit.limited) return rateLimitedResponse(limit.resetAt)
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 }
    )
  }
  let body: unknown
  try {
    body = await readBoundedJson(request, 16 * 1024)
  } catch (error) {
    return NextResponse.json(
      { error: 'Request body is invalid' },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 }
    )
  }

  const res = await backendFetch(`/api/clips/${id}/recut`, {
    method: 'POST',
    body: JSON.stringify(body)
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
