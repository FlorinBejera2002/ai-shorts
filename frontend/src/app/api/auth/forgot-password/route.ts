import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'

import { createPrismaClient } from '@/lib/db'
import {
  passwordResetDelivery,
  sendPasswordResetEmail
} from '@/lib/password-reset-email'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import { RequestBodyTooLargeError, readBoundedJson } from '@/lib/request-body'

export const runtime = 'nodejs'
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }

export async function POST(request: Request) {
  const limit = await rateLimit({
    key: rateLimitKey(request, 'forgot-password'),
    limit: 5,
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
    payload = await readBoundedJson(request, 1024)
  } catch (error) {
    return NextResponse.json(
      { error: 'Request body is invalid' },
      {
        status: error instanceof RequestBodyTooLargeError ? 413 : 400,
        headers: NO_STORE_HEADERS
      }
    )
  }
  const email =
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    typeof (payload as Record<string, unknown>).email === 'string'
      ? String((payload as Record<string, unknown>).email)
          .trim()
          .toLowerCase()
      : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return NextResponse.json(
      { error: 'Email is invalid' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }

  const delivery = passwordResetDelivery()
  const developmentDelivery = ['development', 'test'].includes(
    process.env.APP_ENV ?? ''
  )
  if (!delivery && !developmentDelivery) {
    return NextResponse.json(
      { error: 'Password recovery is temporarily unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    )
  }

  const prisma = createPrismaClient()
  try {
    const user = await prisma.user.findUnique({
      where: { email }
    })

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ sent: true }, { headers: NO_STORE_HEADERS })
    }

    const token = randomBytes(32).toString('hex')
    const tokenDigest = createHash('sha256').update(token).digest('hex')
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    const identifier = `password-reset:${user.email}`
    await prisma.$transaction([
      prisma.verificationToken.deleteMany({ where: { identifier } }),
      prisma.verificationToken.create({
        data: { identifier, token: tokenDigest, expires }
      })
    ])

    if (delivery) {
      try {
        await sendPasswordResetEmail(delivery, user.email, token, tokenDigest)
      } catch {
        // Revoke only this token; a concurrent request may have issued a new one.
        await prisma.verificationToken.deleteMany({
          where: { identifier, token: tokenDigest }
        })
        // Keep the public response identical to an unknown account. Record the
        // provider failure without disclosing the recipient, token or credentials.
        console.error('Password reset email delivery failed')
      }
    } else if (developmentDelivery) {
      // biome-ignore lint/suspicious/noConsoleLog: Explicit local development reset delivery.
      console.log(
        `[DEV] Password reset link: /reset-password?token=${token}&email=${user.email}`
      )
    }

    return NextResponse.json({ sent: true }, { headers: NO_STORE_HEADERS })
  } finally {
    await prisma.$disconnect()
  }
}
