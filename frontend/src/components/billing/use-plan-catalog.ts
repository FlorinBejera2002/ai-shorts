'use client'

import { publicApiFetch } from '@/lib/auth'
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
