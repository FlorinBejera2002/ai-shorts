'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useIsMobile } from '@/hooks/use-mobile'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Popover } from 'radix-ui'
import { useMemo, useState } from 'react'
import { localDateKey, parseLocalDateKey } from './calendar-utils'
import styles from './schedule-picker.module.css'
import theme from './publishing-theme.module.css'

type OpenPanel = 'date' | 'time' | null

function addDays(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + amount)
}

export function SchedulePicker({ date, time, onDateChange, onTimeChange, dateError, timeError, compact = false, disabled = false }: {
  date: string
  time: string
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
  dateError?: string
  timeError?: string
  compact?: boolean
  disabled?: boolean
}) {
  const locale = useLocale()
  const t = useTranslations('contentCalendar')
  const mobile = useIsMobile()
  const selectedDate = parseLocalDateKey(date) ?? new Date()
  const [viewMonth, setViewMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)
  const weekStartsOn: 0 | 1 = locale.toLowerCase().startsWith('ro') ? 1 : 0
  const [hour = '09', minute = '00'] = time.split(':')
  const hours = Array.from({ length: 24 }, (_, value) => String(value).padStart(2, '0'))
  const minutes = [...new Set([...Array.from({ length: 12 }, (_, value) => String(value * 5).padStart(2, '0')), minute])].sort()
  const days = useMemo(() => {
    const offset = (viewMonth.getDay() - weekStartsOn + 7) % 7
    return Array.from({ length: 42 }, (_, index) => addDays(viewMonth, index - offset))
  }, [viewMonth, weekStartsOn])
  const weekdays = useMemo(() => {
    const first = new Date(2026, 0, weekStartsOn === 1 ? 5 : 4)
    return Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(addDays(first, index)))
  }, [locale, weekStartsOn])
  const dateLabel = new Intl.DateTimeFormat(locale, {
    ...(compact ? {} : { weekday: 'short' as const }), day: 'numeric', month: 'short', year: 'numeric'
  }).format(selectedDate)
  const todayKey = localDateKey(new Date())
  const fullDateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'full' }), [locale])

  function changePanel(panel: OpenPanel) {
    if (panel === 'date') setViewMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
    setOpenPanel(panel)
  }

  const calendar = (
    <div className={styles.calendar}>
      <div className={styles.monthHeader}>
        <Button type="button" variant="ghost" size="icon" aria-label={t('actions.previousMonth')} onClick={() => setViewMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}><ChevronLeft className="size-4" /></Button>
        <span aria-live="polite">{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(viewMonth)}</span>
        <Button type="button" variant="ghost" size="icon" aria-label={t('actions.nextMonth')} onClick={() => setViewMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}><ChevronRight className="size-4" /></Button>
      </div>
      <div className={styles.days}>
        {weekdays.map((label, index) => <span key={`${index}-${label}`} className={styles.weekday}>{label}</span>)}
        {days.map(day => {
          const key = localDateKey(day)
          return <button key={key} type="button" aria-label={fullDateFormatter.format(day)} aria-pressed={key === date} aria-current={key === todayKey ? 'date' : undefined} data-outside={day.getMonth() !== viewMonth.getMonth()} onClick={() => { onDateChange(key); if (!mobile) setOpenPanel(null) }} className={styles.day}>{day.getDate()}</button>
        })}
      </div>
    </div>
  )
  const timeColumns = (
    <div className={styles.timeColumns}>
      {[{ label: t('form.hourLabel'), values: hours, selected: hour, change: (value: string) => onTimeChange(`${value}:${minute}`) }, { label: t('form.minuteLabel'), values: minutes, selected: minute, change: (value: string) => onTimeChange(`${hour}:${value}`) }].map(column => (
        <div key={column.label}>
          <h3>{column.label}</h3>
          <div className={styles.timeChoices} role="group" aria-label={column.label}>
            {column.values.map(value => <button type="button" key={value} aria-pressed={column.selected === value} onClick={() => column.change(value)}>{value}</button>)}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className={styles.root}>
      {(['date', 'time'] as const).map(panel => {
        const error = panel === 'date' ? dateError : timeError
        const label = t(panel === 'date' ? 'form.dateLabel' : 'form.timeLabel')
        const trigger = <button type="button" disabled={disabled} className={styles.trigger} aria-label={label} aria-expanded={openPanel === panel} aria-haspopup="dialog" aria-invalid={Boolean(error)} onClick={mobile ? () => changePanel(panel) : undefined}>{panel === 'date' ? <CalendarDays /> : <Clock3 />}<span>{panel === 'date' ? dateLabel : `${hour}:${minute}`}</span><ChevronDown /></button>
        return <div key={panel} className={styles.field}>
          {!compact && <span className={styles.label}>{label}</span>}
          {mobile ? trigger : (
            <Popover.Root open={openPanel === panel} onOpenChange={open => changePanel(open ? panel : null)}>
              <Popover.Trigger asChild>{trigger}</Popover.Trigger>
              <Popover.Portal><Popover.Content data-publish-surface="" data-schedule-picker-panel="" className={`${theme.surface} ${styles.popover}`} align={panel === 'date' ? 'start' : 'end'} sideOffset={8} collisionPadding={12} aria-label={label}>
                {panel === 'date' ? calendar : <>{timeColumns}<Button type="button" className={styles.done} onClick={() => setOpenPanel(null)}>{t('actions.done')}</Button></>}
              </Popover.Content></Popover.Portal>
            </Popover.Root>
          )}
          {error && <p role="alert" className={styles.error}>{error}</p>}
        </div>
      })}
      {mobile && <Dialog open={openPanel !== null} onOpenChange={open => { if (!open) setOpenPanel(null) }}>
        <DialogContent className={`${theme.surface} ${styles.mobileDialog}`} overlayClassName={theme.overlay} data-publish-surface="" aria-describedby={undefined} data-schedule-picker-panel="">
          <span className={styles.sheetHandle} aria-hidden="true" />
          <div className={styles.sheetHeader}><DialogTitle>{t('composer.dateAndTime')}</DialogTitle><Button type="button" variant="ghost" size="icon" aria-label={t('actions.close')} onClick={() => setOpenPanel(null)}><X className="size-4" /></Button></div>
          {calendar}
          <div className={styles.mobileTime}>
            <label>{t('form.hourLabel')}<select aria-label={t('form.hourLabel')} value={hour} onChange={event => onTimeChange(`${event.target.value}:${minute}`)}>{hours.map(value => <option key={value}>{value}</option>)}</select></label>
            <label>{t('form.minuteLabel')}<select aria-label={t('form.minuteLabel')} value={minute} onChange={event => onTimeChange(`${hour}:${event.target.value}`)}>{minutes.map(value => <option key={value}>{value}</option>)}</select></label>
          </div>
          <Button type="button" className={styles.done} onClick={() => setOpenPanel(null)}>{t('actions.done')}</Button>
        </DialogContent>
      </Dialog>}
    </div>
  )
}
