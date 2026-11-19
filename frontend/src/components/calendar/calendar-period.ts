import {
  addLocalDays,
  addLocalMonths,
  getWeekRange,
  startOfLocalDay,
  startOfLocalMonth
} from './calendar-utils'

export const periodPresets = [
  'today',
  'week',
  'month',
  'lastMonth',
  'last30'
] as const
export type PeriodPreset = (typeof periodPresets)[number]
export type PeriodKind = PeriodPreset | 'custom'
export const periodKinds: PeriodKind[] = [...periodPresets, 'custom']

/** The queue period; `end` is exclusive and both bounds are local midnights. */
export type PublishingPeriod = { kind: PeriodKind; start: Date; end: Date }

export function presetPeriod(
  kind: PeriodPreset,
  now: Date,
  weekStartsOn: 0 | 1
): PublishingPeriod {
  const today = startOfLocalDay(now)
  switch (kind) {
    case 'today':
      return { kind, start: today, end: addLocalDays(today, 1) }
    case 'week': {
      const week = getWeekRange(now, weekStartsOn)
      return { kind, start: week.start, end: week.end }
    }
    case 'month': {
      const start = startOfLocalMonth(now)
      return { kind, start, end: addLocalMonths(start, 1) }
    }
    case 'lastMonth': {
      const end = startOfLocalMonth(now)
      return { kind, start: addLocalMonths(end, -1), end }
    }
    case 'last30':
      return { kind, start: addLocalDays(today, -29), end: addLocalDays(today, 1) }
  }
}

/** Builds an inclusive custom period from two picked days, in either order. */
export function customPeriod(first: Date, last: Date): PublishingPeriod {
  const [from, to] = first <= last ? [first, last] : [last, first]
  return {
    kind: 'custom',
    start: startOfLocalDay(from),
    end: addLocalDays(startOfLocalDay(to), 1)
  }
}

/** Last day included in a period, for labels and the range picker. */
export function periodLastDay(period: PublishingPeriod) {
  return addLocalDays(period.end, -1)
}

export function periodLabel(period: PublishingPeriod, locale: string) {
  const dayFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  if (period.kind === 'month' || period.kind === 'lastMonth')
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(period.start)
  if (period.kind === 'today') return dayFormat.format(period.start)
  const first = dayFormat.format(period.start)
  const last = dayFormat.format(periodLastDay(period))
  return first === last ? first : `${first} – ${last}`
}

export function isSameRange(left: PublishingPeriod, right: PublishingPeriod) {
  return (
    left.kind === right.kind &&
    left.start.getTime() === right.start.getTime() &&
    left.end.getTime() === right.end.getTime()
  )
}

/** The calendar month containing a day, used when a saved post falls outside the period. */
export function monthPeriod(day: Date): PublishingPeriod {
  const start = startOfLocalMonth(day)
  return { kind: 'month', start, end: addLocalMonths(start, 1) }
}

export function periodContains(period: PublishingPeriod, date: Date) {
  return date >= period.start && date < period.end
}
