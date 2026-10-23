import { publicApiFetch } from '@/lib/auth'
import type { PlanCatalog } from '@/types/api'
import { useQuery } from '@tanstack/react-query'

async function fetchPlanCatalog(): Promise<PlanCatalog> {
  const response = await publicApiFetch('/api/stripe/plans')
  if (!response.ok) throw new Error('Billing plans are temporarily unavailable')
  return response.json() as Promise<PlanCatalog>
}

export function usePlanCatalog() {
  return useQuery({
    queryKey: ['public', 'stripe-plans'],
    queryFn: fetchPlanCatalog,
    staleTime: 5 * 60 * 1000
  }).data
}
