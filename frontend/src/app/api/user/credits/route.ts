import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { createPrismaClient } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const prisma = createPrismaClient()
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      credits: true,
      plan: true
    }
  })

  return NextResponse.json({
    credits: user?.credits ?? 0,
    plan: user?.plan ?? 'free'
  })
}
