import { backendFetch, proxyBackendResponse } from '@/lib/api'
import { auth } from '@/lib/auth'
import { isUuid, validateClipEditPayload } from '@/lib/clips-library'
import { createPrismaClient } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import { RequestBodyTooLargeError, readBoundedJson } from '@/lib/request-body'
import { resolveMediaUrl } from '@/lib/signed-url'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const [{ id }, session] = await Promise.all([params, auth()])
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isUuid(id)) {
    return Response.json({ error: 'Invalid clip identifier' }, { status: 400 })
  }

  const response = await backendFetch(`/api/clips/${id}`)
  if (!response.ok) {
    return new Response(response.body, {
      status: response.status,
      headers: {
        'content-type':
          response.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'private, no-store'
      }
    })
  }

  const clip = (await response.json()) as Record<string, unknown>
  const localMedia = (value: unknown) =>
    typeof value === 'string' ? value : null
  clip.file_url = resolveMediaUrl(
    localMedia(clip.file_storage_key) ?? localMedia(clip.file_path),
    localMedia(clip.file_url)
  )
  clip.thumbnail_url = resolveMediaUrl(
    localMedia(clip.thumbnail_storage_key) ?? localMedia(clip.thumbnail_path),
    localMedia(clip.thumbnail_url)
  )
  clip.source_video_url = resolveMediaUrl(
    localMedia(clip.source_storage_key),
    localMedia(clip.source_video_url)
  )

  return Response.json(clip, {
    headers: { 'Cache-Control': 'private, no-store' }
  })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const [{ id }, session] = await Promise.all([params, auth()])
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isUuid(id)) {
    return Response.json({ error: 'Invalid clip identifier' }, { status: 400 })
  }
  const limit = await rateLimit({
    key: rateLimitKey(request, `delete-clip:${session.user.id}`),
    limit: 30,
    windowMs: 60 * 60 * 1000
  })
  if (limit.limited) return rateLimitedResponse(limit.resetAt)

  return proxyBackendResponse(`/api/clips/${id}`, {
    method: 'DELETE'
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const [{ id }, session] = await Promise.all([params, auth()])
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isUuid(id)) {
    return Response.json({ error: 'Invalid clip identifier' }, { status: 400 })
  }
  const limit = await rateLimit({
    key: rateLimitKey(request, `update-clip:${session.user.id}`),
    limit: 60,
    windowMs: 60 * 60 * 1000
  })
  if (limit.limited) return rateLimitedResponse(limit.resetAt)

  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    return Response.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 }
    )
  }

  let payload: unknown
  try {
    payload = await readBoundedJson(request, 8 * 1024)
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return Response.json(
        { error: 'Request body is too large' },
        { status: 413 }
      )
    }
    return Response.json(
      { error: 'Request body must be valid JSON' },
      { status: 400 }
    )
  }
  const validation = validateClipEditPayload(payload)
  if (!validation.success) {
    return Response.json({ error: validation.error }, { status: 400 })
  }

  const prisma = createPrismaClient()
  const clip = await prisma.clip.updateMany({
    where: { id, userId: session.user.id },
    data: validation.data
  })

  if (clip.count === 0) {
    return Response.json({ error: 'Clip not found' }, { status: 404 })
  }

  return Response.json({ ok: true })
}
