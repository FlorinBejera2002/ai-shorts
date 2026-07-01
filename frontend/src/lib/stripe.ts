import Stripe from 'stripe'

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }
  return new Stripe(secretKey, {
    apiVersion: '2026-06-24.dahlia'
  })
}

export const PLAN_CREDITS: Record<string, number> = {
  free: 30,
  creator: 300,
  pro: 1000,
  agency: 999999
}

export const PRICE_TO_PLAN: Record<string, string> = {
  [process.env.STRIPE_PRICE_CREATOR ?? '']: 'creator',
  [process.env.STRIPE_PRICE_PRO ?? '']: 'pro',
  [process.env.STRIPE_PRICE_AGENCY ?? '']: 'agency'
}

export const PRICE_TO_CREDIT_PACK: Record<string, number> = {
  [process.env.STRIPE_PRICE_CREDITS_100 ?? '']: 100,
  [process.env.STRIPE_PRICE_CREDITS_500 ?? '']: 500,
  [process.env.STRIPE_PRICE_CREDITS_1000 ?? '']: 1000
}

export async function createCheckoutSession({
  userId,
  email,
  priceId,
  mode
}: {
  userId: string
  email: string
  priceId: string
  mode: 'payment' | 'subscription'
}) {
  return getStripe().checkout.sessions.create({
    mode,
    customer_email: email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/dashboard/billing?success=true`,
    cancel_url: `${process.env.NEXTAUTH_URL}/dashboard/billing?canceled=true`,
    metadata: {
      userId,
      priceId
    },
    subscription_data:
      mode === 'subscription'
        ? {
            metadata: {
              userId,
              priceId
            }
          }
        : undefined
  })
}

export async function createBillingPortalSession(customerId: string) {
  return getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXTAUTH_URL}/dashboard/billing`
  })
}
