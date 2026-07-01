import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      provider: true,
      credits: true,
      plan: true,
      createdAt: true,
      updatedAt: true,
      jobs: {
        select: {
          id: true,
          sourceType: true,
          sourceUrl: true,
          status: true,
          numClipsRequested: true,
          creditsCharged: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      clips: {
        select: {
          id: true,
          title: true,
          hookText: true,
          viralScore: true,
          duration: true,
          aspectRatio: true,
          hasSubtitles: true,
          captionTiktok: true,
          captionInstagram: true,
          captionYoutube: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      brandKit: true,
    },
  })

  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    exported_at: new Date().toISOString(),
    format: 'GDPR Data Export',
    data: user,
  })
}

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Authentication required' }, { status: 401 })
  }

  await prisma.clip.deleteMany({ where: { userId: session.user.id } })
  await prisma.job.deleteMany({ where: { userId: session.user.id } })
  await prisma.brandKit.deleteMany({ where: { userId: session.user.id } })
  await prisma.account.deleteMany({ where: { userId: session.user.id } })
  await prisma.session.deleteMany({ where: { userId: session.user.id } })
  await prisma.user.delete({ where: { id: session.user.id } })

  return Response.json({ deleted: true })
}
