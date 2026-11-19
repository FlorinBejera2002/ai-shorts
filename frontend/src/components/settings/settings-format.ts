const dateFormats = new Map<string, Intl.DateTimeFormat>()
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>()

export const SHORT_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }

/** Dates in the viewer's locale; one cached formatter per locale and option set. */
export function formatDate(value: string | Date, locale: string, options: Intl.DateTimeFormatOptions = SHORT_DATE) {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = dateFormats.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options)
    dateFormats.set(key, format)
  }
  return format.format(new Date(value))
}

/** "now", "2 hours ago", "3 days ago" relative to `now`. */
export function formatSince(value: string, now: number, locale: string) {
  let format = relativeFormats.get(locale)
  if (!format) {
    format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    relativeFormats.set(locale, format)
  }
  const seconds = Math.round((new Date(value).getTime() - now) / 1000)
  if (Math.abs(seconds) < 60) return format.format(0, 'second')
  if (Math.abs(seconds) < 3600) return format.format(Math.round(seconds / 60), 'minute')
  if (Math.abs(seconds) < 86400) return format.format(Math.round(seconds / 3600), 'hour')
  return format.format(Math.round(seconds / 86400), 'day')
}
