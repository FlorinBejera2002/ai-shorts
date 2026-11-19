import { parsePlanCatalog, type PlanCatalog } from './plan-catalog'

let pending: Promise<PlanCatalog | null> | undefined

async function fetchCatalog(source: string): Promise<PlanCatalog | null> {
  try {
    const response = await fetch(source, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) return null
    return parsePlanCatalog(await response.json())
  } catch {
    return null
  }
}

/**
 * Prices baked into the static HTML and JSON-LD at build time.
 * PLANS_SOURCE_URL points at the live backend (e.g. https://sneepcut.com/api/stripe/plans);
 * without it the pages render no price and the browser loads it from the same origin.
 */
export function loadPlanCatalog(): Promise<PlanCatalog | null> {
  const source = process.env.PLANS_SOURCE_URL?.trim()
  if (!source) return Promise.resolve(null)
  pending ??= fetchCatalog(source)
  return pending
}
