export type ActivityDay = { date: string; clips: number; projects: number }
export type DailyCount = { day: Date | string; clips: number; projects: number }
export type ProjectStatus =
  | 'completed'
  | 'active'
  | 'failed'
  | 'cancelled'
  | 'other'

/** UTC calendar days keep server, browser and database buckets consistent. */
export function activityWindow(now = new Date(), days = 90) {
  const end = new Date(now)
  end.setUTCHours(0, 0, 0, 0)
  end.setUTCDate(end.getUTCDate() + 1)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - days)
  return { start, end }
}

export function buildActivity(
  rows: DailyCount[],
  now = new Date(),
  days = 90
): ActivityDay[] {
  const { start } = activityWindow(now, days)
  const counts = new Map(
    rows.map((row) => [new Date(row.day).toISOString().slice(0, 10), row])
  )
  return Array.from({ length: days }, (_, index) => {
    const day = new Date(start)
    day.setUTCDate(day.getUTCDate() + index)
    const date = day.toISOString().slice(0, 10)
    const row = counts.get(date)
    return { date, clips: row?.clips ?? 0, projects: row?.projects ?? 0 }
  })
}

export function projectStatus(status: string): ProjectStatus {
  if (status === 'completed' || status === 'failed' || status === 'cancelled')
    return status
  if (
    [
      'pending',
      'downloading',
      'transcribing',
      'analyzing',
      'clipping',
      'rendering',
      'detecting',
      'generating',
      'processing'
    ].includes(status)
  )
    return 'active'
  return 'other'
}
