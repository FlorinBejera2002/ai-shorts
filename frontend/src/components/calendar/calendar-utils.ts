import type {
  CalendarMutationStatus,
  ContentPlatform,
  ContentPostStatus,
  ScheduledPostRecord
} from '@/lib/content-calendar'

export const CALENDAR_PLATFORMS: readonly ContentPlatform[] = [
  'tiktok',
  'instagram',
  'facebook',
  'youtube',
  'linkedin',
  'twitter'
]

export const CALENDAR_STATUSES: readonly ContentPostStatus[] = [
  'draft',
  'scheduled',
  'publishing',
  'failed',
  'published'
]

export const EDITABLE_CALENDAR_STATUSES: readonly CalendarMutationStatus[] = [
  'draft',
  'scheduled',
  'publish'
]

export type CalendarRange = {
  days: Date[]
  start: Date
  end: Date
}

export type CalendarViewMode = 'month' | 'week' | 'day' | 'list'
export type CalendarDensity = 'compact' | 'comfortable'

export type PostFormPayload = {
  title?: string
  caption?: string | null
  notes?: string | null
  platforms?: ContentPlatform[]
  accountIds?: string[]
  status?: CalendarMutationStatus
  scheduledAt: string
  clipId?: string | null
}

export type CalendarIssue = {
  field: string
  message: string
}

export function normalizeScheduledPost(
  post: ScheduledPostRecord
): ScheduledPostRecord {
  return {
    ...post,
    accountIds: Array.isArray(post.accountIds)
      ? post.accountIds.filter(
          (accountId): accountId is string => typeof accountId === 'string'
        )
      : []
  }
}

export class CalendarRequestError extends Error {
  status: number
  issues: CalendarIssue[]

  constructor(message: string, status: number, issues: CalendarIssue[] = []) {
    super(message)
    this.name = 'CalendarRequestError'
    this.status = status
    this.issues = issues
  }
}

export function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

export function startOfLocalMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

export function addLocalDays(value: Date, amount: number): Date {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate() + amount
  )
}

export function addLocalMonths(value: Date, amount: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1)
}

export function getWeekRange(value: Date, weekStartsOn: 0 | 1): CalendarRange {
  const anchor = startOfLocalDay(value)
  const offset = (anchor.getDay() - weekStartsOn + 7) % 7
  const start = addLocalDays(anchor, -offset)
  const days = Array.from({ length: 7 }, (_, index) =>
    addLocalDays(start, index)
  )
  return { days, start, end: addLocalDays(start, 7) }
}

export function movePostToLocalDate(
  scheduledAt: string,
  targetDate: Date,
  targetHour?: number
): Date {
  const source = new Date(scheduledAt)
  const result = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
    targetHour ?? source.getHours(),
    targetHour === undefined ? source.getMinutes() : 0,
    0,
    0
  )
  return result
}

export function localDateKey(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, month, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

export function localTimeValue(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(
    value.getMinutes()
  ).padStart(2, '0')}`
}

export function combineLocalDateTime(
  dateValue: string,
  timeValue: string
): Date | null {
  const date = parseLocalDateKey(dateValue)
  const match = /^(\d{2}):(\d{2})$/.exec(timeValue)
  if (!date || !match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null

  const expectedYear = date.getFullYear()
  const expectedMonth = date.getMonth()
  const expectedDay = date.getDate()
  date.setHours(hours, minutes, 0, 0)
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== expectedYear ||
    date.getMonth() !== expectedMonth ||
    date.getDate() !== expectedDay ||
    date.getHours() !== hours ||
    date.getMinutes() !== minutes
  ) {
    return null
  }
  return date
}

export function getDefaultPlanningTime(
  selectedDate: Date,
  referenceDate = new Date()
): Date {
  const now = new Date(referenceDate)
  const selected = startOfLocalDay(selectedDate)
  const today = startOfLocalDay(now)

  if (selected.getTime() === today.getTime()) {
    const result = new Date(now)
    result.setSeconds(0, 0)
    const minutes = result.getMinutes()
    result.setMinutes(minutes < 30 ? 30 : result.getHours() === 23 ? 59 : 60)
    return result
  }

  selected.setHours(9, 0, 0, 0)
  return selected
}

export function getCalendarRange(
  month: Date,
  weekStartsOn: 0 | 1
): CalendarRange {
  const firstOfMonth = startOfLocalMonth(month)
  const offset = (firstOfMonth.getDay() - weekStartsOn + 7) % 7
  const start = addLocalDays(firstOfMonth, -offset)
  const days = Array.from({ length: 42 }, (_, index) =>
    addLocalDays(start, index)
  )
  const end = addLocalDays(start, 42)
  return { days, start, end }
}

export function getWeekdayLabels(
  locale: string,
  weekStartsOn: 0 | 1
): string[] {
  const sunday = new Date(2024, 0, 7)
  return Array.from({ length: 7 }, (_, index) => {
    const dayOffset = (index + weekStartsOn) % 7
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
      addLocalDays(sunday, dayOffset)
    )
  })
}

export function isSameLocalDay(left: Date, right: Date): boolean {
  return localDateKey(left) === localDateKey(right)
}

export function isInRange(value: string, range: CalendarRange): boolean {
  const timestamp = new Date(value).getTime()
  return timestamp >= range.start.getTime() && timestamp < range.end.getTime()
}

export function groupPostsByLocalDay(
  posts: ScheduledPostRecord[]
): Map<string, ScheduledPostRecord[]> {
  const grouped = new Map<string, ScheduledPostRecord[]>()

  for (const post of posts) {
    const key = localDateKey(new Date(post.scheduledAt))
    const current = grouped.get(key) ?? []
    current.push(post)
    grouped.set(key, current)
  }

  for (const dayPosts of grouped.values()) {
    dayPosts.sort(
      (left, right) =>
        new Date(left.scheduledAt).getTime() -
        new Date(right.scheduledAt).getTime()
    )
  }

  return grouped
}

export function safeTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}
