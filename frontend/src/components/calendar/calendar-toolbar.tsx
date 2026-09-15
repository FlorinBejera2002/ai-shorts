'use client'

import { Button } from '@/components/ui/button'
import { GooeyNav } from '@/components/ui/gooey-nav'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  LayoutList,
  Plus,
  Rows3
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { CalendarViewMode } from './calendar-utils'
import styles from './calendar-workspace.module.css'

export type PublishingWorkspaceMode = 'preview' | 'calendar'

const workspaceModes: {
  id: PublishingWorkspaceMode
  icon: typeof CalendarDays
}[] = [
  { id: 'preview', icon: LayoutList },
  { id: 'calendar', icon: CalendarDays }
]

const calendarViews: { id: CalendarViewMode; icon: typeof CalendarDays }[] = [
  { id: 'month', icon: CalendarDays },
  { id: 'week', icon: Columns3 },
  { id: 'day', icon: Rows3 }
]

export function CalendarToolbar({
  title,
  workspaceMode,
  view,
  loading,
  onPrevious,
  onNext,
  onToday,
  onNewPost,
  onWorkspaceModeChange,
  onViewChange
}: {
  title: string
  workspaceMode: PublishingWorkspaceMode
  view: CalendarViewMode
  loading: boolean
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  onNewPost: () => void
  onWorkspaceModeChange: (mode: PublishingWorkspaceMode) => void
  onViewChange: (view: CalendarViewMode) => void
}) {
  const t = useTranslations('contentCalendar')
  const activeWorkspaceIndex = workspaceModes.findIndex(
    ({ id }) => id === workspaceMode
  )
  const activeViewIndex = calendarViews.findIndex(({ id }) => id === view)

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
            aria-label={t('workspaceViews.label')}
            items={workspaceModes.map(({ id, icon: Icon }) => ({
              label: t(`workspaceViews.${id}`),
              icon: <Icon className="size-3" />
            }))}
            value={activeWorkspaceIndex}
            onChange={(index) => {
              const selectedMode = workspaceModes[index]
              if (selectedMode) onWorkspaceModeChange(selectedMode.id)
            }}
            size="sm"
          />
          {workspaceMode === 'calendar' && (
            <GooeyNav
              aria-label={t('views.label')}
              items={calendarViews.map(({ id, icon: Icon }) => ({
                label: t(`views.${id}`),
                icon: <Icon className="size-3" />
              }))}
              value={activeViewIndex}
              onChange={(index) => {
                const selectedView = calendarViews[index]
                if (selectedView) onViewChange(selectedView.id)
              }}
              size="sm"
            />
          )}
          <Button type="button" onClick={onNewPost} className="h-9">
            <Plus />
            {t('actions.newPost')}
          </Button>
        </div>
      </div>
    </div>
  )
}
