import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const limit = await rateLimit({
    key: rateLimitKey(request, 'reset-password'),
    limit: 10,
    windowMs: 60 * 60 * 1000,
  })
  if (limit.limited) {
    return rateLimitedResponse(limit.resetAt)
  }

  const { token, email, password } = await request.json()
  if (!token || !email || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (password.length < 12) {
    return NextResponse.json({ error: 'Password must be at least 12 characters' }, { status: 400 })
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return NextResponse.json({ error: 'Password must contain uppercase, lowercase, and a digit' }, { status: 400 })
  }

  const record = await prisma.verificationToken.findFirst({
    where: {
      identifier: `password-reset:${email.toLowerCase()}`,
      token,
      expires: { gt: new Date() },
    },
  })

  if (!record) {
    return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.update({
    where: { email: email.toLowerCase() },
    data: { passwordHash },
  })

  await prisma.verificationToken.delete({
    where: {
      identifier_token: {
        identifier: record.identifier,
        token: record.token,
      },
    },
  })

  return NextResponse.json({ reset: true })
}
