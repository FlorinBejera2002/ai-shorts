import { NextResponse } from 'next/server'

import { prisma } from '@/lib/db'
import { getStripe, PLAN_CREDITS, PRICE_TO_CREDIT_PACK, PRICE_TO_PLAN } from '@/lib/stripe'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 })
  }

  let event
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid webhook' },
      { status: 400 }
    )
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const userId = session.metadata?.userId
    const priceId = session.metadata?.priceId
    if (userId && priceId) {
      if (session.mode === 'subscription') {
        const plan = PRICE_TO_PLAN[priceId] ?? 'free'
        await prisma.user.update({
          where: { id: userId },
          data: {
            plan,
            credits: { increment: PLAN_CREDITS[plan] ?? 0 },
            stripeCustomerId: String(session.customer ?? ''),
            stripeSubscriptionId: String(session.subscription ?? '')
          }
        })
      } else {
        await prisma.user.update({
          where: { id: userId },
          data: {
            credits: { increment: PRICE_TO_CREDIT_PACK[priceId] ?? 0 },
            stripeCustomerId: String(session.customer ?? '')
          }
        })
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object
    await prisma.user.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: {
        plan: 'free',
        stripeSubscriptionId: null
      }
    })
  }

  if (event.type === 'customer.subscription.updated') {
    const subscription = event.data.object
    const priceId = subscription.items.data[0]?.price.id
    const plan = priceId ? PRICE_TO_PLAN[priceId] : undefined
    if (plan) {
      await prisma.user.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: { plan }
      })
    }
  }

  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object
    const invoiceWithSubscription = invoice as typeof invoice & {
      subscription?: string
      parent?: {
        subscription_details?: {
          subscription?: string
        }
      }
    }
    const subscriptionId =
      invoiceWithSubscription.subscription ??
      invoiceWithSubscription.parent?.subscription_details?.subscription
    if (subscriptionId) {
      const user = await prisma.user.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
        select: { id: true, plan: true }
      })
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { credits: { increment: PLAN_CREDITS[user.plan] ?? 0 } }
        })
      }
    }
  }

  return NextResponse.json({ received: true })
}
