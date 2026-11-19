'use client'

import { useEffect, useState } from 'react'
import { fill } from '@/content/copy'
import type { Locale } from '@/lib/i18n'
import {
  formatPlanPrice,
  parsePlanCatalog,
  PLAN_CATALOG_PATH,
  type PaidPlanId,
  type PlanCatalog,
  type PlanPrice as Price
} from '@/lib/plan-catalog'

let catalogRequest: Promise<PlanCatalog | null> | undefined

/** One request per page load, shared by every price on the page. */
function requestCatalog(): Promise<PlanCatalog | null> {
  catalogRequest ??= fetch(PLAN_CATALOG_PATH, { headers: { Accept: 'application/json' } })
    .then((response) => (response.ok ? response.json() : null))
    .then(parsePlanCatalog)
    .catch(() => null)
  return catalogRequest
}

type PlanPriceProps = {
  plan: PaidPlanId
  locale: Locale
  /** Price baked in at build time, if the catalog was reachable then. */
  initial: Price | null
  template: string
  unavailable: string
}

export function PlanPrice({ plan, locale, initial, template, unavailable }: PlanPriceProps) {
  const [price, setPrice] = useState(initial)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    void requestCatalog().then((catalog) => {
      if (!active) return
      const live = catalog?.[plan]
      if (live) setPrice(live)
      else if (!initial) setFailed(true)
    })
    return () => {
      active = false
    }
  }, [plan, initial])

  if (price) return <>{fill(template, { price: formatPlanPrice(price, locale) })}</>
  if (failed) return <>{unavailable}</>
  return <span aria-busy="true">{fill(template, { price: '—' })}</span>
}
