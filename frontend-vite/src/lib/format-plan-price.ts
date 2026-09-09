import type { BillingPlanPrice } from '@/types/api'

const currencyFormatters = new Map<string, Intl.NumberFormat>()

function currencyFormatter(
  locale: string,
  currency: string,
  minimumFractionDigits: number
) {
  const cacheKey = `${locale}:${currency}:${minimumFractionDigits}`
  const cached = currencyFormatters.get(cacheKey)
  if (cached) return cached

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits: 2
  })
  currencyFormatters.set(cacheKey, formatter)
  return formatter
}

export function formatPlanPrice(price: BillingPlanPrice, locale: string) {
  const minimumFractionDigits = price.amount % 100 === 0 ? 0 : 2
  return currencyFormatter(
    locale,
    price.currency,
    minimumFractionDigits
  ).format(price.amount / 100)
}
