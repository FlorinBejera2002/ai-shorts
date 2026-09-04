import { canWriteContent } from '@/lib/content-permissions'
import { NextResponse } from 'next/server'

import { backendFetch } from '@/lib/api'
import { auth } from '@/lib/auth'
import { withFreshBrandLogo } from '@/lib/brand-logo'
import { createPrismaClient } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canWriteContent(session)) {
    return Response.json(
      { error: 'This role cannot modify content' },
      { status: 403 }
    )
  }

  const limit = await rateLimit({
    key: rateLimitKey(request, `brand-logo:${session.user.id}`),
    limit: 10,
    windowMs: 60 * 60 * 1000
  })
  if (limit.limited) {
    return rateLimitedResponse(limit.resetAt)
  }

  const formData = await request.formData()
  const response = await backendFetch('/api/brand/logo', {
    method: 'POST',
    body: formData
  })

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: 'Upload failed' }))
    return NextResponse.json(error, { status: response.status })
  }

  const payload: unknown = await response.json()
  const logoPath =
    payload &&
    typeof payload === 'object' &&
    'logo_path' in payload &&
    typeof payload.logo_path === 'string'
      ? payload.logo_path
      : null
  const keyParts = logoPath?.split('/') ?? []
  if (
    keyParts.length !== 3 ||
    keyParts[0] !== 'brand' ||
    keyParts[1] !== session.user.id ||
    !/^logo-[a-z0-9._-]+\.(?:png|jpe?g|webp)$/i.test(keyParts[2] ?? '')
  ) {
    return NextResponse.json(
      { error: 'Upload returned an invalid storage key' },
      { status: 502 }
    )
  }

  const prisma = createPrismaClient()
  const storedBrandKit = await prisma.brandKit.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, logoPath, logoUrl: null },
    update: { logoPath, logoUrl: null }
  })
  const brandKit = await withFreshBrandLogo(storedBrandKit)

  return NextResponse.json(
    { brandKit },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!canWriteContent(session)) {
    return Response.json(
      { error: 'This role cannot modify content' },
      { status: 403 }
    )
  }

  const prisma = createPrismaClient()
  const existing = await prisma.brandKit.findUnique({
    where: { userId: session.user.id }
  })
  if (existing?.logoPath) {
    const response = await backendFetch(
      `/api/brand/logo?logo_path=${encodeURIComponent(existing.logoPath)}`,
      { method: 'DELETE' }
    )
    if (!response.ok && response.status !== 404) {
      const error = await response
        .json()
        .catch(() => ({ error: 'Delete failed' }))
      return NextResponse.json(error, { status: response.status })
    }
  }

  const brandKit = await prisma.brandKit.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, logoPath: null, logoUrl: null },
    update: { logoPath: null, logoUrl: null }
  })

  return NextResponse.json(
    { brandKit },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
