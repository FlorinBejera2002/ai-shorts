'use client'

import { useSyncExternalStore } from 'react'
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

/**
 * Live plan catalog shared by every price on the page: requested once, when the
 * first price subscribes, from the same-origin backend endpoint.
 */
type CatalogSnapshot = { status: 'pending' | 'ready' | 'failed'; catalog: PlanCatalog | null }

const pendingSnapshot: CatalogSnapshot = { status: 'pending', catalog: null }
let snapshot = pendingSnapshot
let requested = false
const listeners = new Set<() => void>()

function publish(next: CatalogSnapshot) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

function requestCatalog() {
  if (requested) return
  requested = true
  fetch(PLAN_CATALOG_PATH, { headers: { Accept: 'application/json' } })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      const catalog = parsePlanCatalog(data)
      publish(catalog ? { status: 'ready', catalog } : { status: 'failed', catalog: null })
    })
    .catch(() => publish({ status: 'failed', catalog: null }))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  requestCatalog()
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => snapshot
const getServerSnapshot = () => pendingSnapshot

type PlanPriceProps = {
  plan: PaidPlanId
  locale: Locale
  /** Price baked in at build time, if the catalog was reachable then. */
  initial: Price | null
  template: string
  unavailable: string
}

export function PlanPrice({ plan, locale, initial, template, unavailable }: PlanPriceProps) {
  const live = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const price = live.catalog?.[plan] ?? initial

  if (price) return <>{fill(template, { price: formatPlanPrice(price, locale) })}</>
  if (live.status === 'failed') return <>{unavailable}</>
  return <span aria-busy="true">{fill(template, { price: '—' })}</span>
}
