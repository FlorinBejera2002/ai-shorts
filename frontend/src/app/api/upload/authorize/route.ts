import { auth } from '@/lib/auth'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import { RequestBodyTooLargeError, readBoundedJson } from '@/lib/request-body'
import {
  getDirectUploadUrl,
  signUploadIntent,
  validateUploadIntent
} from '@/lib/upload-intent'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  const limit = await rateLimit({
    key: rateLimitKey(request, `authorize-upload:${session.user.id}`),
    limit: 24,
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
    payload = await readBoundedJson(request)
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
  const validation = validateUploadIntent(payload)
  if (!validation.success) {
    return Response.json({ error: validation.error }, { status: 400 })
  }

  let uploadUrl: string | null
  try {
    uploadUrl = getDirectUploadUrl()
  } catch {
    return Response.json(
      { error: 'Direct upload is misconfigured' },
      { status: 503 }
    )
  }
  if (!uploadUrl) {
    return Response.json(
      { uploadUrl: '/api/upload', token: null },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  const secret = process.env.UPLOAD_TOKEN_SECRET?.trim()
  if (!secret || secret.length < 32) {
    return Response.json(
      { error: 'Direct upload is temporarily unavailable' },
      { status: 503 }
    )
  }

  return Response.json(
    {
      uploadUrl,
      token: signUploadIntent({
        intent: validation.data,
        userId: session.user.id,
        secret
      })
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
