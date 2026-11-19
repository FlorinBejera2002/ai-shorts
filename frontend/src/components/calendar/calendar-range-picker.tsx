'use client'

import {
  addLocalDays,
  addLocalMonths,
  getWeekdayLabels,
  localDateKey,
  startOfLocalMonth
} from './calendar-utils'
import { customPeriod, periodLabel, type PublishingPeriod } from './calendar-period'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './calendar-range-picker.module.css'

type PickedRange = { first: Date | null; last: Date | null }

/** Six weeks of cells for a month; days outside the month are blank, as in the reference. */
function monthCells(month: Date, weekStartsOn: 0 | 1) {
  const first = startOfLocalMonth(month)
  const offset = (first.getDay() - weekStartsOn + 7) % 7
  return Array.from({ length: 42 }, (_, index) => {
    const day = addLocalDays(first, index - offset)
    return day.getMonth() === first.getMonth() ? day : null
  })
}

function isBetween(day: Date, first: Date, last: Date) {
  const time = day.getTime()
  return time >= Math.min(first.getTime(), last.getTime()) && time <= Math.max(first.getTime(), last.getTime())
}

/** Picks a first and last day; the result is an inclusive custom period. */
export function CalendarRangePicker({
  initial,
  locale,
  weekStartsOn,
  onBack,
  onApply
}: {
  initial: PublishingPeriod
  locale: string
  weekStartsOn: 0 | 1
  onBack: () => void
  onApply: (period: PublishingPeriod) => void
}) {
  const t = useTranslations('contentCalendar')
  const [picked, setPicked] = useState<PickedRange>(() => ({
    first: initial.start,
    last: addLocalDays(initial.end, -1)
  }))
  const [month, setMonth] = useState(() => startOfLocalMonth(initial.start))
  const cells = useMemo(() => monthCells(month, weekStartsOn), [month, weekStartsOn])
  const weekdays = getWeekdayLabels(locale, weekStartsOn)
  const monthTitle = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month)
  const complete = picked.first !== null && picked.last !== null
  const dayFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' })

  function pickDay(day: Date) {
    if (picked.first === null || picked.last !== null) setPicked({ first: day, last: null })
    else setPicked({ first: picked.first, last: day })
  }

  return (
    <div className={styles.picker} data-range-picker="">
      <div className={styles.head}>
        <button type="button" className={styles.back} onClick={onBack} aria-label={t('periods.back')}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <span className={styles.heading}>{t('periods.custom')}</span>
      </div>
      <div className={styles.monthBar}>
        <button type="button" className={styles.nav} onClick={() => setMonth(addLocalMonths(month, -1))} aria-label={t('actions.previousMonth')}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <span className={styles.month}>{monthTitle}</span>
        <button type="button" className={styles.nav} onClick={() => setMonth(addLocalMonths(month, 1))} aria-label={t('actions.nextMonth')}>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className={styles.grid} role="grid" aria-label={monthTitle}>
        {weekdays.map((label, index) => (
          <span key={`${label}-${index}`} className={styles.weekday} aria-hidden="true">
            {label}
          </span>
        ))}
        {cells.map((day, index) => {
          if (!day) return <span key={`blank-${index}`} aria-hidden="true" />
          const selectedFirst = picked.first !== null && localDateKey(day) === localDateKey(picked.first)
          const selectedLast = picked.last !== null && localDateKey(day) === localDateKey(picked.last)
          const inside = complete && isBetween(day, picked.first!, picked.last!)
          return (
            <button
              key={localDateKey(day)}
              type="button"
              role="gridcell"
              className={styles.day}
              data-inside={inside || undefined}
              data-endpoint={selectedFirst || selectedLast || undefined}
              aria-pressed={selectedFirst || selectedLast}
              aria-label={dayFormat.format(day)}
              onClick={() => pickDay(day)}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
      <div className={styles.footer}>
        <span className={styles.summary}>
          {complete ? periodLabel(customPeriod(picked.first!, picked.last!), locale) : ''}
        </span>
        <button
          type="button"
          className={styles.apply}
          disabled={!complete}
          onClick={() => onApply(customPeriod(picked.first!, picked.last!))}
        >
          {t('periods.apply')}
        </button>
      </div>
    </div>
  )
}
