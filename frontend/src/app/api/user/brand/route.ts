import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { withFreshBrandLogo } from '@/lib/brand-logo'
import { createPrismaClient } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'
import { RequestBodyTooLargeError, readBoundedJson } from '@/lib/request-body'

export const runtime = 'nodejs'

const WHITE_LABEL_PLAN = 'agency'
const COLOR = /^#[0-9a-f]{6}$/i
const SUBTITLE_POSITIONS = new Set(['top', 'center', 'bottom'])
const WATERMARK_POSITIONS = new Set([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right'
])
const ALLOWED_FIELDS = new Set([
  'primaryColor',
  'secondaryColor',
  'fontFamily',
  'subtitleFont',
  'subtitleColor',
  'subtitleBgColor',
  'subtitleBgOpacity',
  'subtitlePosition',
  'watermarkPosition',
  'watermarkOpacity',
  'hidePlatformBadge'
])

function validText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength
  )
}

function validateBrandSettings(
  value: unknown
): Record<string, string | number | boolean> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (
    Object.keys(input).length === 0 ||
    Object.keys(input).some((key) => !ALLOWED_FIELDS.has(key))
  ) {
    return null
  }

  const output: Record<string, string | number | boolean> = {}
  for (const [key, field] of Object.entries(input)) {
    if (key.endsWith('Color')) {
      if (typeof field !== 'string' || !COLOR.test(field)) return null
      output[key] = field.toUpperCase()
    } else if (key === 'fontFamily' || key === 'subtitleFont') {
      if (!validText(field, 100) || !/^[A-Za-z0-9 -]+$/.test(field)) return null
      output[key] = field.trim()
    } else if (key === 'subtitlePosition') {
      if (typeof field !== 'string' || !SUBTITLE_POSITIONS.has(field))
        return null
      output[key] = field
    } else if (key === 'watermarkPosition') {
      if (typeof field !== 'string' || !WATERMARK_POSITIONS.has(field))
        return null
      output[key] = field
    } else if (key === 'subtitleBgOpacity' || key === 'watermarkOpacity') {
      if (
        typeof field !== 'number' ||
        !Number.isFinite(field) ||
        field < 0 ||
        field > 1
      ) {
        return null
      }
      output[key] = field
    } else if (key === 'hidePlatformBadge') {
      if (typeof field !== 'boolean') return null
      output[key] = field
    }
  }
  return output
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const prisma = createPrismaClient()
  const [brandKit, user] = await Promise.all([
    prisma.brandKit.findUnique({ where: { userId: session.user.id } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true }
    })
  ])

  return NextResponse.json(
    {
      brandKit: await withFreshBrandLogo(brandKit),
      plan: user?.plan ?? 'free'
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const limit = await rateLimit({
    key: rateLimitKey(request, `brand-settings:${session.user.id}`),
    limit: 60,
    windowMs: 60 * 60 * 1000
  })
  if (limit.limited) return rateLimitedResponse(limit.resetAt)

  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return NextResponse.json(
      { error: 'Content-Type must be application/json' },
      { status: 415 }
    )
  }

  const prisma = createPrismaClient()
  let rawPayload: unknown
  try {
    rawPayload = await readBoundedJson(request, 8 * 1024)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof RequestBodyTooLargeError
            ? 'Request body is too large'
            : 'Request body must be valid JSON'
      },
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 }
    )
  }
  const payload = validateBrandSettings(rawPayload)
  if (!payload) {
    return NextResponse.json(
      { error: 'Brand settings are invalid' },
      { status: 400 }
    )
  }

  if (payload.hidePlatformBadge) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true }
    })
    if (user?.plan !== WHITE_LABEL_PLAN) {
      return NextResponse.json(
        { error: 'Removing the platform badge requires an Agency plan' },
        { status: 403 }
      )
    }
  }

  const brandKit = await prisma.brandKit.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      ...payload
    },
    update: payload
  })

  return NextResponse.json(
    { brandKit: await withFreshBrandLogo(brandKit) },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
