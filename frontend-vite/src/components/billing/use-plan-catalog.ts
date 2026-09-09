import { publicApiFetch } from '@/lib/auth'
import type { PlanCatalog } from '@/types/api'
import { useQuery } from '@tanstack/react-query'

async function fetchPlanCatalog(): Promise<PlanCatalog | null> {
  const response = await publicApiFetch('/api/stripe/plans')
  return response.ok ? (response.json() as Promise<PlanCatalog>) : null
}

export function usePlanCatalog() {
  return useQuery({
    queryKey: ['public', 'stripe-plans'],
    queryFn: fetchPlanCatalog,
    staleTime: Number.POSITIVE_INFINITY
  }).data
}
