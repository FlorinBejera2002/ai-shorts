'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import type { ContentPlatform, ContentPostStatus } from '@/lib/content-calendar'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  FilterX,
  List,
  Rows3,
  Search
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { CalendarDensity, CalendarViewMode } from './calendar-utils'
import styles from './calendar-workspace.module.css'

export type PlatformFilter = ContentPlatform | 'all'
export type StatusFilter = ContentPostStatus | 'all'

const views: { id: CalendarViewMode; icon: typeof CalendarDays }[] = [
  { id: 'month', icon: CalendarDays },
  { id: 'week', icon: Columns3 },
  { id: 'day', icon: Rows3 },
  { id: 'list', icon: List }
]

export function CalendarToolbar({
  title,
  view,
  density,
  query,
  platform,
  status,
  loading,
  resultCount,
  onPrevious,
  onNext,
  onToday,
  onViewChange,
  onDensityChange,
  onQueryChange,
  onPlatformChange,
  onStatusChange,
  onClearFilters
}: {
  title: string
  view: CalendarViewMode
  density: CalendarDensity
  query: string
  platform: PlatformFilter
  status: StatusFilter
  loading: boolean
  resultCount: number
  onPrevious: () => void
  onNext: () => void
  onToday: () => void
  onViewChange: (view: CalendarViewMode) => void
  onDensityChange: (density: CalendarDensity) => void
  onQueryChange: (query: string) => void
  onPlatformChange: (platform: PlatformFilter) => void
  onStatusChange: (status: StatusFilter) => void
  onClearFilters: () => void
}) {
  const t = useTranslations('contentCalendar')
  const filtersActive =
    query.trim() !== '' || platform !== 'all' || status !== 'all'

  return (
    <div className={`${styles.toolbar} border-b border-border p-4 sm:p-5`}>
      <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            type="button"
            onClick={onPrevious}
            aria-label={t('actions.previousPeriod')}
            className="h-9 w-9 px-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={onNext}
            aria-label={t('actions.nextPeriod')}
            className="h-9 w-9 px-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" type="button" onClick={onToday}>
            {t('actions.today')}
          </Button>
          <h2 className="min-w-0 px-1 text-lg font-semibold capitalize sm:text-xl">
            {title}
          </h2>
          {loading && (
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-primary"
              aria-label={t('loading')}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-lg border border-border bg-muted/35 p-0.5"
            role="group"
            aria-label={t('views.label')}
          >
            {views.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-label={t(`views.${id}`)}
                aria-pressed={view === id}
                onClick={() => onViewChange(id)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold transition-colors ${
                  view === id
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t(`views.${id}`)}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label={t(`density.${density}`)}
            onClick={() =>
              onDensityChange(density === 'compact' ? 'comfortable' : 'compact')
            }
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            title={t(`density.${density}`)}
          >
            {density === 'compact' ? (
              <Rows3 className="h-3.5 w-3.5" />
            ) : (
              <Columns3 className="h-3.5 w-3.5" />
            )}
            <span className="hidden xl:inline">{t(`density.${density}`)}</span>
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto]">
        <div className="relative">
          <Label className="sr-only" htmlFor="calendar-search">
            {t('filters.searchLabel')}
          </Label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="calendar-search"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t('filters.searchPlaceholder')}
            className="h-10 pl-9"
          />
        </div>
        <Label className="sr-only" htmlFor="calendar-platform-filter">
          {t('filters.platformLabel')}
        </Label>
        <NativeSelect
          id="calendar-platform-filter"
          value={platform}
          onChange={(event) =>
            onPlatformChange(event.target.value as PlatformFilter)
          }
          className="min-h-10 bg-card px-3 text-xs font-semibold"
        >
          <option value="all">{t('filters.allPlatforms')}</option>
          <option value="tiktok">{t('platforms.tiktok')}</option>
          <option value="instagram">{t('platforms.instagram')}</option>
          <option value="youtube">{t('platforms.youtube')}</option>
          <option value="linkedin">{t('platforms.linkedin')}</option>
        </NativeSelect>
        <Label className="sr-only" htmlFor="calendar-status-filter">
          {t('filters.statusLabel')}
        </Label>
        <NativeSelect
          id="calendar-status-filter"
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as StatusFilter)
          }
          className="min-h-10 bg-card px-3 text-xs font-semibold"
        >
          <option value="all">{t('filters.allStatuses')}</option>
          <option value="draft">{t('statuses.draft')}</option>
          <option value="scheduled">{t('statuses.scheduled')}</option>
          <option value="published">{t('statuses.published')}</option>
        </NativeSelect>
        {filtersActive && (
          <button
            type="button"
            onClick={onClearFilters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-primary hover:bg-primary/[0.06]"
          >
            <FilterX className="h-4 w-4" />
            {t('actions.clearFilters')}
          </button>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[10px] font-medium text-muted-foreground">
        <span>{t('filters.resultCount', { count: resultCount })}</span>
        {filtersActive && (
          <span className="rounded-full bg-primary/[0.07] px-2 py-1 text-primary">
            {t('filters.active')}
          </span>
        )}
      </div>
    </div>
  )
}
