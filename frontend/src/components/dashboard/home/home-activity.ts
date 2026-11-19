import type { ActivityDay } from '@/lib/dashboard-activity'

const DAY_MS = 24 * 60 * 60 * 1000

/** The last seven UTC days ending today, filling days the API did not return with zero. */
export function lastSevenDays(activity: ActivityDay[], now = new Date()) {
  const byDate = new Map(activity.map((day) => [day.date.slice(0, 10), day.clips]))
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today - (6 - index) * DAY_MS)
    const key = date.toISOString().slice(0, 10)
    return { date, clips: byDate.get(key) ?? 0, today: index === 6 }
  })
}
