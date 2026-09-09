'use client'
import type { PaidBillingPlanId } from '@/lib/billing'
import { usePlanCatalog } from './use-plan-catalog'

export function PlanPrice({
  planId,
  locale,
  unavailable
}: { planId: PaidBillingPlanId; locale: string; unavailable: string }) {
  const price = usePlanCatalog()?.[planId]
  if (!price) return unavailable
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: price.currency,
    minimumFractionDigits: price.amount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(price.amount / 100)
}
