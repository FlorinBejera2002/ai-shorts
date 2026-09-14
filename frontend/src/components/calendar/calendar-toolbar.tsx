'use client'

import { Button } from '@/components/ui/button'
import { GooeyNav } from '@/components/ui/gooey-nav'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  List,
  Rows3
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { CalendarViewMode } from './calendar-utils'
import styles from './calendar-workspace.module.css'

const views: { id: CalendarViewMode; icon: typeof CalendarDays }[] = [
  { id: 'month', icon: CalendarDays },
  { id: 'week', icon: Columns3 },
  { id: 'day', icon: Rows3 },
  { id: 'list', icon: List }
]

export function CalendarToolbar({
  title,
  view,
  loading,
  onPrevious,
  onNext,
  onToday,
  onViewChange
}: {
  title: string
  view: CalendarViewMode
  loading: boolean
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  onViewChange: (view: CalendarViewMode) => void
}) {
  const t = useTranslations('contentCalendar')
  const activeViewIndex = views.findIndex(({ id }) => id === view)

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
          <GooeyNav
            aria-label={t('views.label')}
            items={views.map(({ id, icon: Icon }) => ({
              label: t(`views.${id}`),
              icon: <Icon className="size-3" />
            }))}
            value={activeViewIndex}
            onChange={(index) => {
              const selectedView = views[index]
              if (selectedView) onViewChange(selectedView.id)
            }}
            size="sm"
          />
        </div>
      </div>
    </div>
  )
}
