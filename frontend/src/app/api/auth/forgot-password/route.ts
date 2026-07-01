import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const limit = await rateLimit({
    key: rateLimitKey(request, 'forgot-password'),
    limit: 5,
    windowMs: 60 * 60 * 1000,
  })
  if (limit.limited) {
    return rateLimitedResponse(limit.resetAt)
  }

  const { email } = await request.json()
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  })

  // Always return success to prevent email enumeration
  if (!user) {
    return NextResponse.json({ sent: true })
  }

  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

  await prisma.verificationToken.create({
    data: {
      identifier: `password-reset:${user.email}`,
      token,
      expires,
    },
  })

  // TODO: Send email with reset link using a transactional email service
  // For now, log to console in development
  if (process.env.APP_ENV !== 'production') {
    console.log(`[DEV] Password reset link: /reset-password?token=${token}&email=${user.email}`)
  }

  return NextResponse.json({ sent: true })
}
