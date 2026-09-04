import type { PrismaClient } from '@prisma/client'
import { NextResponse } from 'next/server'

import { validateProfilePayload } from '@/lib/account-settings'
import { auth } from '@/lib/auth'
import { createPrismaClient } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import { RequestBodyTooLargeError, readBoundedJson } from '@/lib/request-body'

export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }

async function currentProfile(prisma: PrismaClient, userId: string) {
  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      provider: true,
      passwordHash: true,
      accounts: {
        select: { provider: true },
        take: 1
      },
      emailVerified: true,
      createdAt: true
    }
  })
  if (!profile) return null

  const { accounts, passwordHash, ...safeProfile } = profile
  return {
    ...safeProfile,
    provider: passwordHash
      ? 'credentials'
      : (accounts[0]?.provider ?? safeProfile.provider),
    canChangePassword: Boolean(passwordHash)
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401, headers: NO_STORE_HEADERS }
    )
  }

  const prisma = createPrismaClient()
  const profile = await currentProfile(prisma, session.user.id)
  if (!profile) {
    return NextResponse.json(
      { error: 'Account not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    )
  }

  return NextResponse.json({ profile }, { headers: NO_STORE_HEADERS })
}

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401, headers: NO_STORE_HEADERS }
    )
  }

  const limit = await rateLimit({
    key: rateLimitKey(request, `profile:${session.user.id}`),
    limit: 20,
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

  const result = validateProfilePayload(payload)
  if (!result.success) {
    return NextResponse.json(
      { error: 'Profile is invalid', issues: result.issues },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  const prisma = createPrismaClient()
  const updated = await prisma.user.updateMany({
    where: { id: session.user.id },
    data: { name: result.data.name }
  })
  if (updated.count === 0) {
    return NextResponse.json(
      { error: 'Account not found' },
      { status: 404, headers: NO_STORE_HEADERS }
    )
  }

  const profile = await currentProfile(prisma, session.user.id)
  return NextResponse.json({ profile }, { headers: NO_STORE_HEADERS })
}
