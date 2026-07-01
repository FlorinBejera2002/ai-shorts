import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

const WHITE_LABEL_PLAN = 'agency'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [brandKit, user] = await Promise.all([
    prisma.brandKit.findUnique({ where: { userId: session.user.id } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true }
    })
  ])

  return NextResponse.json({ brandKit, plan: user?.plan ?? 'free' })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await request.json()

  if (payload.hidePlatformBadge) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true }
    })
    if (user?.plan !== WHITE_LABEL_PLAN) {
      payload.hidePlatformBadge = false
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

  return NextResponse.json({ brandKit })
}
