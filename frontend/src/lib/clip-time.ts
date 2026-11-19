/** "0:38" style clip length, shared by every clip tile. */
export function formatClipLength(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const relativeFormats = new Map<string, Intl.RelativeTimeFormat>()

/** "acum 2 ore", "ieri", "acum 3 săptămâni": how long ago a clip was made. */
export function formatClipAge(iso: string, locale: string, now = Date.now()) {
  let format = relativeFormats.get(locale)
  if (!format) {
    format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    relativeFormats.set(locale, format)
  }
  const elapsed = Math.max(0, now - new Date(iso).getTime())
  const days = Math.round(elapsed / 86_400_000)
  if (days < 1) return format.format(-Math.max(1, Math.round(elapsed / 3_600_000)), 'hour')
  if (days < 7) return format.format(-days, 'day')
  return format.format(-Math.round(days / 7), 'week')
}
