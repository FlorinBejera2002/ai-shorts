import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { readBoundedRequestText, validatePortalPayload } from '@/lib/billing'
import { createPrismaClient } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import { createBillingPortalSession } from '@/lib/stripe'

export const runtime = 'nodejs'

const MAX_BODY_BYTES = 256

function noStoreJson(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store' }
  })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return noStoreJson({ error: 'unauthorized' }, 401)
  }

  const limit = await rateLimit({
    key: rateLimitKey(request, `billing-portal:${session.user.id}`),
    limit: 20,
    windowMs: 60 * 60 * 1000
  })
  if (limit.limited) return rateLimitedResponse(limit.resetAt)

  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return noStoreJson({ error: 'content_type_required' }, 415)
  }

  const body = await readBoundedRequestText(request, MAX_BODY_BYTES)
  if (!body.ok) {
    return noStoreJson({ error: 'request_too_large' }, 413)
  }

  let payload: unknown
  try {
    payload = JSON.parse(body.text)
  } catch {
    return noStoreJson({ error: 'invalid_json' }, 400)
  }

  const parsed = validatePortalPayload(payload)
  if (!parsed.success) {
    return noStoreJson({ error: parsed.error }, 400)
  }

  const prisma = createPrismaClient()
  const [user, deletionRequest] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeCustomerId: true }
    }),
    prisma.accountDeletionRequest.findUnique({
      where: { userId: session.user.id },
      select: { userId: true }
    })
  ])
  if (!user) return noStoreJson({ error: 'account_not_found' }, 404)
  if (deletionRequest) {
    return noStoreJson({ error: 'account_deletion_in_progress' }, 409)
  }
  if (!user.stripeCustomerId) {
    return noStoreJson({ error: 'billing_profile_not_found' }, 409)
  }

  try {
    const portal = await createBillingPortalSession(
      user.stripeCustomerId,
      parsed.data.locale
    )
    return noStoreJson({ url: portal.url })
  } catch {
    return noStoreJson({ error: 'billing_provider_unavailable' }, 502)
  }
}
