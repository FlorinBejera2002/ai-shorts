import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

import { passwordPolicyIssues } from '@/lib/account-settings'
import { INITIAL_FREE_CREDITS } from '@/lib/billing'
import { createPrismaClient } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import { RequestBodyTooLargeError, readBoundedJson } from '@/lib/request-body'

export const runtime = 'nodejs'
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }

function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : null
}

export async function POST(request: Request) {
  const limit = await rateLimit({
    key: rateLimitKey(request, 'register'),
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
    payload = await readBoundedJson(request)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof RequestBodyTooLargeError
            ? 'Request body is too large'
            : 'Request body must be valid JSON'
      },
      {
        status: error instanceof RequestBodyTooLargeError ? 413 : 400,
        headers: NO_STORE_HEADERS
      }
    )
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json(
      { error: 'Request body must be an object' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }
  const fields = payload as Record<string, unknown>
  const email =
    typeof fields.email === 'string' ? fields.email.trim().toLowerCase() : ''
  const name = typeof fields.name === 'string' ? fields.name.trim() : ''
  const password = typeof fields.password === 'string' ? fields.password : ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: 'Please enter a valid email address' },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }
  if (email.length > 255 || name.length > 80) {
    return NextResponse.json(
      { error: 'Name or email is too long' },
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
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { error: 'Email already registered' },
      { status: 409, headers: NO_STORE_HEADERS }
    )
  }

  const passwordHash = await bcrypt.hash(password, 12)
  let user
  try {
    user = await prisma.user.create({
      data: {
        email,
        name: name || email.split('@')[0],
        provider: 'credentials',
        passwordHash,
        credits: INITIAL_FREE_CREDITS,
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
  } catch (error) {
    if (errorCode(error) === 'P2002') {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 409, headers: NO_STORE_HEADERS }
      )
    }
    return NextResponse.json(
      { error: 'Account could not be created' },
      { status: 503, headers: NO_STORE_HEADERS }
    )
  }

  return NextResponse.json({ user }, { status: 201, headers: NO_STORE_HEADERS })
}
