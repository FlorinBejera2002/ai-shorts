const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1)
}

/** "2 hours ago", "yesterday" or a short date, like the library reference. */
export function formatUpdated(value: string, locale: string, now = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const elapsed = now.getTime() - date.getTime()
  if (elapsed >= 0 && elapsed < HOUR) {
    return relative.format(-Math.max(1, Math.round(elapsed / 60000)), 'minute')
  }
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY)
  if (days === 0 && elapsed >= 0) {
    return relative.format(-Math.round(elapsed / HOUR), 'hour')
  }
  if (days === 1) return relative.format(-1, 'day')
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' })
  }).format(date)
}

/** "Today, 14:02" for versions saved today, otherwise date and time. */
export function formatVersionTime(value: string, locale: string, now = new Date()) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY)
  if (days === 0 || days === 1) {
    const day = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
      -days,
      'day'
    )
    return `${capitalize(day)}, ${time}`
  }
  return `${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(date)}, ${time}`
}
