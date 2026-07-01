import { NextResponse } from 'next/server'

import { auth } from '@/lib/auth'
import { createCheckoutSession } from '@/lib/stripe'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await request.json()
  const checkout = await createCheckoutSession({
    userId: session.user.id,
    email: session.user.email,
    priceId: String(payload.priceId),
    mode: payload.mode === 'payment' ? 'payment' : 'subscription'
  })

  return NextResponse.json({ url: checkout.url })
}
