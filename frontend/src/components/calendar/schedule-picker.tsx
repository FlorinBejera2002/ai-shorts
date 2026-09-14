'use client'

import { Button } from '@/components/ui/button'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState } from 'react'
import { localDateKey, parseLocalDateKey } from './calendar-utils'

type OpenPanel = 'date' | 'time' | null

function addDays(value: Date, amount: number) {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate() + amount
  )
}

function startOfCalendarMonth(value: Date, weekStartsOn: 0 | 1) {
  const first = new Date(value.getFullYear(), value.getMonth(), 1)
  const offset = (first.getDay() - weekStartsOn + 7) % 7
  return addDays(first, -offset)
}

export function SchedulePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
  dateError,
  timeError
}: {
  date: string
  time: string
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
  dateError?: string
  timeError?: string
}) {
  const locale = useLocale()
  const t = useTranslations('contentCalendar')
  const rootRef = useRef<HTMLDivElement>(null)
  const selectedDate = parseLocalDateKey(date) ?? new Date()
  const [viewMonth, setViewMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  )
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)
  const weekStartsOn: 0 | 1 = locale.toLowerCase().startsWith('ro') ? 1 : 0
  const [hour = '09', minute = '00'] = time.split(':')
  const minuteOptions = useMemo(
    () =>
      [
        ...new Set([
          ...Array.from({ length: 12 }, (_, value) =>
            String(value * 5).padStart(2, '0')
          ),
          minute
        ])
      ].sort(),
    [minute]
  )

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenPanel(null)
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || openPanel === null) return
      event.preventDefault()
      event.stopImmediatePropagation()
      setOpenPanel(null)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape, true)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [openPanel])

  const days = useMemo(() => {
    const start = startOfCalendarMonth(viewMonth, weekStartsOn)
    return Array.from({ length: 42 }, (_, index) => addDays(start, index))
  }, [viewMonth, weekStartsOn])
  const weekdayLabels = useMemo(() => {
    const start =
      weekStartsOn === 1 ? new Date(2026, 0, 5) : new Date(2026, 0, 4)
    return Array.from({ length: 7 }, (_, index) =>
      new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(
        addDays(start, index)
      )
    )
  }, [locale, weekStartsOn])
  const todayKey = localDateKey(new Date())
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(selectedDate)

  function updateTime(nextHour: string, nextMinute: string) {
    onTimeChange(`${nextHour}:${nextMinute}`)
  }

  return (
    <div ref={rootRef} className="relative grid gap-3 sm:grid-cols-2">
      <div className="relative">
        <p className="text-xs font-semibold text-foreground">
          {t('form.dateLabel')}
        </p>
        <button
          type="button"
          aria-expanded={openPanel === 'date'}
          aria-haspopup="dialog"
          aria-invalid={Boolean(dateError)}
          onClick={() =>
            setOpenPanel((current) => (current === 'date' ? null : 'date'))
          }
          className="mt-1.5 flex h-11 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-left text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="truncate">{dateLabel}</span>
        </button>
        {dateError && (
          <p className="mt-1.5 text-xs font-medium text-destructive">
            {dateError}
          </p>
        )}

        {openPanel === 'date' && (
          <div
            data-schedule-picker-panel=""
            role="dialog"
            aria-label={t('form.dateLabel')}
            className="absolute left-0 top-[calc(100%+0.45rem)] z-[140] w-[19rem] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-xl"
          >
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('actions.previousMonth')}
                onClick={() =>
                  setViewMonth(
                    (current) =>
                      new Date(current.getFullYear(), current.getMonth() - 1, 1)
                  )
                }
              >
                <ChevronLeft className="size-4" />
              </Button>
              <p className="text-sm font-semibold capitalize">
                {new Intl.DateTimeFormat(locale, {
                  month: 'long',
                  year: 'numeric'
                }).format(viewMonth)}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('actions.nextMonth')}
                onClick={() =>
                  setViewMonth(
                    (current) =>
                      new Date(current.getFullYear(), current.getMonth() + 1, 1)
                  )
                }
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {weekdayLabels.map((label, index) => (
                <span
                  key={`${label}-${index}`}
                  className="py-1 text-center text-[10px] font-bold uppercase text-muted-foreground"
                >
                  {label}
                </span>
              ))}
              {days.map((day) => {
                const key = localDateKey(day)
                const selected = key === date
                const currentMonth = day.getMonth() === viewMonth.getMonth()
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      onDateChange(key)
                      setOpenPanel(null)
                    }}
                    className={`h-8 rounded-sm text-xs font-medium transition-colors ${selected ? 'bg-foreground text-background' : currentMonth ? 'hover:bg-muted' : 'text-muted-foreground/45 hover:bg-muted'} ${key === todayKey && !selected ? 'ring-1 ring-inset ring-border' : ''}`}
                  >
                    {day.getDate()}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        <p className="text-xs font-semibold text-foreground">
          {t('form.timeLabel')}
        </p>
        <button
          type="button"
          aria-expanded={openPanel === 'time'}
          aria-haspopup="dialog"
          aria-invalid={Boolean(timeError)}
          onClick={() =>
            setOpenPanel((current) => (current === 'time' ? null : 'time'))
          }
          className="mt-1.5 flex h-11 w-full items-center gap-2 rounded-md border border-border bg-background px-3 text-left text-sm font-medium tabular-nums transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Clock3 className="size-4 text-muted-foreground" />
          <span>
            {hour}:{minute}
          </span>
        </button>
        {timeError && (
          <p className="mt-1.5 text-xs font-medium text-destructive">
            {timeError}
          </p>
        )}

        {openPanel === 'time' && (
          <div
            data-schedule-picker-panel=""
            role="dialog"
            aria-label={t('form.timeLabel')}
            className="absolute right-0 top-[calc(100%+0.45rem)] z-[140] w-[15rem] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-xl"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t('form.hourLabel')}
                </p>
                <div className="grid max-h-48 grid-cols-3 gap-1 overflow-y-auto pr-1">
                  {Array.from({ length: 24 }, (_, value) =>
                    String(value).padStart(2, '0')
                  ).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateTime(value, minute)}
                      className={`h-8 rounded-sm text-xs font-semibold tabular-nums ${hour === value ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t('form.minuteLabel')}
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {minuteOptions.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateTime(hour, value)}
                      className={`h-8 rounded-sm text-xs font-semibold tabular-nums ${minute === value ? 'bg-foreground text-background' : 'hover:bg-muted'}`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <Button
              type="button"
              className="mt-3 w-full"
              onClick={() => setOpenPanel(null)}
            >
              {t('actions.done')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
