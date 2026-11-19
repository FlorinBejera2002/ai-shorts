export const PAID_PLAN_IDS = ['creator', 'pro', 'agency'] as const
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number]
export type PlanPrice = { amount: number; currency: string }
export type PlanCatalog = Partial<Record<PaidPlanId, PlanPrice>>

/** Public endpoint of the Go backend; prices come from the configured Stripe catalog. */
export const PLAN_CATALOG_PATH = '/api/stripe/plans'

function parsePrice(value: unknown): PlanPrice | null {
  if (!value || typeof value !== 'object') return null
  const { amount, currency } = value as Record<string, unknown>
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0) return null
  if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency)) return null
  return { amount, currency: currency.toUpperCase() }
}

export function parsePlanCatalog(data: unknown): PlanCatalog | null {
  if (!data || typeof data !== 'object') return null
  const catalog: PlanCatalog = {}
  for (const plan of PAID_PLAN_IDS) {
    const price = parsePrice((data as Record<string, unknown>)[plan])
    if (price) catalog[plan] = price
  }
  return Object.keys(catalog).length > 0 ? catalog : null
}

const formatters = new Map<string, Intl.NumberFormat>()

export function formatPlanPrice(price: PlanPrice, locale: string): string {
  const fractionDigits = price.amount % 100 === 0 ? 0 : 2
  const key = `${locale}:${price.currency}:${fractionDigits}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: price.currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: 2
    })
    formatters.set(key, formatter)
  }
  return formatter.format(price.amount / 100)
}

export function priceValue(price: PlanPrice): string {
  return (price.amount / 100).toFixed(2)
}
