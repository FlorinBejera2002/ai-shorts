'use client'

import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './calendar-publishing.module.css'

export function CalendarToolbar({
  title,
  loading,
  onPrevious,
  onNext,
  onToday
}: {
  title: string
  loading: boolean
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
}) {
  const t = useTranslations('contentCalendar')

  return (
    <div className={styles.toolbar}>
      <div className={styles.periodControls}>
        <Button
          variant="outline"
          type="button"
          onClick={onPrevious}
          aria-label={t('actions.previousPeriod')}
          className="h-9 w-9 px-0 text-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={onNext}
          aria-label={t('actions.nextPeriod')}
          className="h-9 w-9 px-0 text-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={onToday}
          className={styles.today}
        >
          {t('actions.today')}
        </Button>
        <h2 className={styles.periodTitle}>
          {title}
        </h2>
        {loading && (
          <span
            className="h-2 w-2 animate-pulse rounded-full bg-foreground"
            aria-label={t('loading')}
          />
        )}
      </div>

    </div>
  )
}
