// Resolve a wall-clock date in the selected IANA zone without changing the browser zone.
// Rechecking the resolved parts rejects nonexistent times during a DST transition.
export function combineZonedDateTime(date: string, time: string, timeZone: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  if (hour > 23 || minute > 59) return null
  const wallTime = Date.UTC(year, month - 1, day, hour, minute)
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    })
    const partsAt = (instant: number) => {
      const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]))
      return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
    }
    let instant = wallTime
    for (let step = 0; step < 3; step++) instant += wallTime - partsAt(instant)
    if (partsAt(instant) !== wallTime) return null
    const result = new Date(instant)
    // Also reject normalized-over calendar dates such as February 31.
    const requested = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const resolved = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(result)
    return resolved === requested ? result : null
  } catch {
    return null
  }
}
