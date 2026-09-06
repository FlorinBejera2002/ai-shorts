'use client'
import { publicApiFetch } from '@/lib/auth'
import type { PaidBillingPlanId } from '@/lib/billing'
import type { PlanCatalog } from '@/types/api'
import { useEffect, useState } from 'react'
let catalogRequest: Promise<PlanCatalog | null> | null = null
export function usePlanCatalog() {
  const [catalog, setCatalog] = useState<PlanCatalog | null>(null)
  useEffect(() => {
    let mounted = true
    catalogRequest ??= publicApiFetch('/api/stripe/plans')
      .then(async (response) =>
        response.ok ? (response.json() as Promise<PlanCatalog>) : null
      )
      .catch(() => null)
    void catalogRequest.then((value) => {
      if (mounted) setCatalog(value)
      if (!value) catalogRequest = null
    })
    return () => {
      mounted = false
    }
  }, [])
  return catalog
}
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
