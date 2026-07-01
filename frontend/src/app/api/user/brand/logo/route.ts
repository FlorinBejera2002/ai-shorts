import { NextResponse } from 'next/server'

import { backendFetch } from '@/lib/api'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { rateLimit, rateLimitKey, rateLimitedResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  const { logo_path, logo_url } = await response.json()

  const brandKit = await prisma.brandKit.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, logoPath: logo_path, logoUrl: logo_url },
    update: { logoPath: logo_path, logoUrl: logo_url }
  })

  return NextResponse.json({ brandKit })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  return NextResponse.json({ brandKit })
}
