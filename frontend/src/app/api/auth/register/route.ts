import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const limit = await rateLimit({
    key: rateLimitKey(request, 'register'),
    limit: 10,
    windowMs: 60 * 60 * 1000,
  })
  if (limit.limited) {
    return rateLimitedResponse(limit.resetAt)
  }

  const payload = await request.json()
  const email = String(payload.email ?? '').toLowerCase()
  const name = String(payload.name ?? '').trim()
  const password = String(payload.password ?? '')

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
  }

  if (!password || password.length < 12) {
    return NextResponse.json({ error: 'Password must be at least 12 characters' }, { status: 400 })
  }
  if (!/[A-Z]/.test(password)) {
    return NextResponse.json({ error: 'Password must contain an uppercase letter' }, { status: 400 })
  }
  if (!/[a-z]/.test(password)) {
    return NextResponse.json({ error: 'Password must contain a lowercase letter' }, { status: 400 })
  }
  if (!/\d/.test(password)) {
    return NextResponse.json({ error: 'Password must contain a digit' }, { status: 400 })
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return NextResponse.json({ error: 'Password must contain a special character' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: {
      email,
      name: name || email.split('@')[0],
      provider: 'credentials',
      passwordHash,
      credits: Number(process.env.DEFAULT_FREE_CREDITS ?? 100),
      plan: 'free'
    },
    select: {
      id: true,
      email: true,
      name: true,
      credits: true,
      plan: true
    }
  })

  return NextResponse.json({ user }, { status: 201 })
}
