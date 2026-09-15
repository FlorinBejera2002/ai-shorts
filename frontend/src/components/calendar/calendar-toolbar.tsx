'use client'

import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import styles from './calendar-workspace.module.css'

export function CalendarToolbar({
  title,
  loading,
  onPrevious,
  onNext,
  onToday,
  onNewPost
}: {
  title: string
  loading: boolean
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  onNewPost: () => void
}) {
  const t = useTranslations('contentCalendar')

  return (
    <div className={styles.toolbar}>
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
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
            className="text-foreground hover:bg-muted hover:text-foreground"
          >
            {t('actions.today')}
          </Button>
          <h2 className="min-w-0 px-1 text-lg font-semibold capitalize sm:text-xl">
            {title}
          </h2>
          {loading && (
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-foreground"
              aria-label={t('loading')}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={onNewPost} className="h-9">
            <Plus />
            {t('actions.newPost')}
          </Button>
        </div>
      </div>
    </div>
  )
}
