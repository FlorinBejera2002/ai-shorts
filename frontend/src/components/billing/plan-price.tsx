import type { PaidBillingPlanId } from '@/lib/billing'
import { usePlanCatalog } from './use-plan-catalog'
import { formatPlanPrice } from '../../lib/format-plan-price'

export function PlanPrice({
  planId,
  locale,
  unavailable
}: {
  planId: PaidBillingPlanId
  locale: string
  unavailable: string
}) {
  const price = usePlanCatalog()?.[planId]
  if (!price) return unavailable
  return formatPlanPrice(price, locale)
}
