import { createHash } from 'node:crypto'

import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

import { passwordPolicyIssues } from '@/lib/account-settings'
import { createPrismaClient } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import { RequestBodyTooLargeError, readBoundedJson } from '@/lib/request-body'

export const runtime = 'nodejs'
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }
class InvalidResetTokenError extends Error {}

function invalidResetResponse() {
  return NextResponse.json(
    { error: 'Invalid or expired reset link' },
    { status: 400, headers: NO_STORE_HEADERS }
  )
}

export async function POST(request: Request) {
  const limit = await rateLimit({
    key: rateLimitKey(request, 'reset-password'),
    limit: 10,
    windowMs: 60 * 60 * 1000
  })
  if (limit.limited) {
    return rateLimitedResponse(limit.resetAt)
  }

  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415, headers: NO_STORE_HEADERS }
    )
  }
  let payload: unknown
  try {
    payload = await readBoundedJson(request, 4 * 1024)
  } catch (error) {
    return NextResponse.json(
      { error: 'Request body is invalid' },
      {
        status: error instanceof RequestBodyTooLargeError ? 413 : 400,
        headers: NO_STORE_HEADERS
      }
    )
  }
  const fields =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {}
  const token = typeof fields.token === 'string' ? fields.token : ''
  const email =
    typeof fields.email === 'string' ? fields.email.trim().toLowerCase() : ''
  const password = typeof fields.password === 'string' ? fields.password : ''
  if (
    !/^[0-9a-f]{64}$/i.test(token) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 255 ||
    !password
  ) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  const passwordIssues = passwordPolicyIssues(password)
  if (passwordIssues.length > 0) {
    return NextResponse.json(
      { error: passwordIssues[0]?.message ?? 'Password is invalid' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  const prisma = createPrismaClient()
  const tokenDigest = createHash('sha256').update(token).digest('hex')
  const record = await prisma.verificationToken.findFirst({
    where: {
      identifier: `password-reset:${email}`,
      token: tokenDigest,
      expires: { gt: new Date() }
    }
  })

  if (!record) {
    return invalidResetResponse()
  }

  const passwordHash = await bcrypt.hash(password, 12)
  try {
    await prisma.$transaction(async (tx) => {
      // Consume first inside the same transaction as the password update. A
      // concurrent request can no longer reuse a token both requests observed.
      const consumed = await tx.verificationToken.deleteMany({
        where: {
          identifier: record.identifier,
          token: tokenDigest,
          expires: { gt: new Date() }
        }
      })
      if (consumed.count !== 1) throw new InvalidResetTokenError()

      const user = await tx.user.update({
        where: { email },
        data: {
          passwordHash,
          sessionVersion: { increment: 1 }
        },
        select: { id: true }
      })
      await tx.session.deleteMany({ where: { userId: user.id } })
    })
  } catch (error) {
    if (error instanceof InvalidResetTokenError) return invalidResetResponse()
    return NextResponse.json(
      { error: 'Password could not be reset' },
      { status: 503, headers: NO_STORE_HEADERS }
    )
  }

  return NextResponse.json({ reset: true }, { headers: NO_STORE_HEADERS })
}
