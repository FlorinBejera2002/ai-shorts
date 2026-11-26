import type { BillingLocale } from '@/lib/billing'
import type { BillingPlanPrice } from '@/types/api'

const DATE_LOCALES: Record<BillingLocale, string> = { en: 'en-GB', ro: 'ro-RO', es: 'es-ES' }

/** "18 dec. 2026" / "18 Dec 2026"; null for missing or invalid dates. */
export function formatBillingDate(value: string | null | undefined, locale: BillingLocale) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date)
}

function formatMoney(amount: number, currency: string, locale: BillingLocale, wholeUnits: boolean) {
  const code = /^[a-z]{3}$/i.test(currency) ? currency.toUpperCase() : 'USD'
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: wholeUnits ? 0 : 2,
      maximumFractionDigits: 2
    }).format(amount / 100)
  } catch {
    return `${(amount / 100).toFixed(2)} ${code}`
  }
}

/** Plan price from the Stripe catalog: "19 €", "19,50 €". */
export function formatBillingPrice(price: BillingPlanPrice, locale: BillingLocale) {
  return formatMoney(price.amount, price.currency, locale, price.amount % 100 === 0)
}

/** Invoice total: "19,00 €". */
export function formatInvoiceAmount(amount: number, currency: string, locale: BillingLocale) {
  return formatMoney(amount, currency, locale, false)
}
