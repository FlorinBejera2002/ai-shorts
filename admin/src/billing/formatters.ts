export const billingNumber = new Intl.NumberFormat('ro-RO')
const date = new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })

export function billingDate(value: string | null) {
  if (!value) return 'Nedisponibil'
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? 'Nedisponibil' : date.format(parsed)
}

const statusLabels: Record<string, string> = {
  none: 'Fără abonament', active: 'Activ', trialing: 'Trial', past_due: 'Plată restantă', unpaid: 'Neplătit',
  canceled: 'Anulat', incomplete: 'Plată incompletă', incomplete_expired: 'Plată expirată', paused: 'În pauză'
}

export function statusLabel(status: string) { return statusLabels[status] ?? status }
