import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

import { validatePasswordPayload } from '@/lib/account-settings'
import { auth } from '@/lib/auth'
import { createPrismaClient } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import { RequestBodyTooLargeError, readBoundedJson } from '@/lib/request-body'

export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401, headers: NO_STORE_HEADERS }
    )
  }

  const limit = await rateLimit({
    key: rateLimitKey(request, `password:${session.user.id}`),
    limit: 8,
    windowMs: 60 * 60 * 1000
  })
  if (limit.limited) return rateLimitedResponse(limit.resetAt)

  if (
    !request.headers
      .get('content-type')
      ?.toLowerCase()
      .startsWith('application/json')
  ) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415, headers: NO_STORE_HEADERS }
    )
  }

  let payload: unknown
  try {
    payload = await readBoundedJson(request)
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: 'Request body is too large' },
        { status: 413, headers: NO_STORE_HEADERS }
      )
    }
    return NextResponse.json(
      { error: 'Request body must be valid JSON' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  const result = validatePasswordPayload(payload)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Password change is invalid', issues: result.issues },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  const prisma = createPrismaClient()
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true }
  })
  if (!user) {
    return NextResponse.json(
      { error: 'Account not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    )
  }
  if (!user.passwordHash) {
    return NextResponse.json(
      { error: 'Password changes are managed by your sign-in provider' },
      { status: 409, headers: NO_STORE_HEADERS }
    )
  }

  const currentPasswordMatches = await bcrypt.compare(
    result.data.currentPassword,
    user.passwordHash
  )
  if (!currentPasswordMatches) {
    return NextResponse.json(
      {
        error: 'Current password is incorrect',
        issues: [
          { field: 'currentPassword', message: 'Current password is incorrect' }
        ]
      },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  const passwordHash = await bcrypt.hash(result.data.newPassword, 12)
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: session.user.id },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 }
      }
    })
    await tx.session.deleteMany({ where: { userId: session.user.id } })
  })

  return NextResponse.json(
    { changed: true, signInRequired: true },
    { headers: NO_STORE_HEADERS }
  )
}
