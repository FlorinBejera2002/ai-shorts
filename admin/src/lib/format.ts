export const numberFormat = new Intl.NumberFormat('ro-RO')
export const dateTimeFormat = new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' })

export function initial(value: string) {
  return value.slice(0, 1).toUpperCase()
}

const relativeFormat = new Intl.RelativeTimeFormat('ro-RO', { numeric: 'auto' })
const relativeSteps: [Intl.RelativeTimeFormatUnit, number][] = [['minute', 60], ['hour', 24], ['day', 30], ['month', 12], ['year', Infinity]]

/** "acum 5 minute", "ieri"… for a past timestamp; "Niciodată" when missing. */
export function relativeTime(value: string | null, now = Date.now()) {
  if (!value) return 'Niciodată'
  let amount = (new Date(value).getTime() - now) / 60_000
  if (amount > -1) return 'Acum'
  for (const [unit, size] of relativeSteps) {
    if (Math.abs(amount) < size) return relativeFormat.format(Math.round(amount), unit)
    amount /= size
  }
  return dateTimeFormat.format(new Date(value))
}
