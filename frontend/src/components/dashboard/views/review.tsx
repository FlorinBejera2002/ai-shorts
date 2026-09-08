'use client'

import '@/components/clips/media-workbench.css'

import { ApiState } from '@/components/shared/api-state'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import type { ReviewClip } from '@/types/api'
import { CheckCircle2, Film, Plus, Scissors, TrendingUp } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { getClipReadiness } from '@/lib/clip-readiness'

export default function ReviewPage() {
  const t = useTranslations('review')
  const locale = useLocale()
  const [readinessFilter, setReadinessFilter] = useState('all')
  const { data, error, reload } = useApiResource<{ clips: ReviewClip[] }>(
    '/api/dashboard/review'
  )
  if (!data) return <ApiState error={error} retry={reload} />
  const { clips } = data

  const rows = clips.map((clip) => ({
    clip,
    readiness: getClipReadiness(clip)
  }))
  const readyCount = rows.filter((row) => row.readiness.score >= 85).length
  const needsReview = rows.filter((row) => row.readiness.score < 85).length
  const visibleRows = rows.filter(
    ({ readiness }) =>
      readinessFilter === 'all' ||
      (readinessFilter === 'ready'
        ? readiness.score >= 85
        : readiness.score < 85)
  )

  return (
    <div className="media-workbench animate-fade-in">
      <PageHeader
        title={t('title')}
        description={t('desc')}
        actions={
          <Button
            asChild={true}
            variant="default"
            className="clips-create-action"
          >
            <Link href="/dashboard/create">
              <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
              {t('generateMore')}
            </Link>
          </Button>
        }
      />

      <dl className="review-metrics">
        {[
          {
            label: t('totalClips'),
            value: rows.length,
            icon: Film,
            color: 'text-primary',
            bg: 'bg-primary/10'
          },
          {
            label: t('readyToPost'),
            value: readyCount,
            icon: CheckCircle2,
            color: 'text-success',
            bg: 'bg-success/10'
          },
          {
            label: t('needsReview'),
            value: needsReview,
            icon: TrendingUp,
            color: 'text-warning',
            bg: 'bg-warning/10'
          }
        ].map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="review-metric">
              <span className={`review-metric-icon ${stat.bg}`}>
                <Icon
                  aria-hidden="true"
                  className={`h-4 w-4 ${stat.color}`}
                  strokeWidth={1.75}
                />
              </span>
              <div className="review-metric-copy">
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            </div>
          )
        })}
      </dl>

      {/* Clips table */}
      {rows.length > 0 ? (
        <div className="mt-6 space-y-3">
          <div className="media-controls">
            {(
              [
                ['all', t('totalClips')],
                ['ready', t('readyToPost')],
                ['review', t('needsReview')]
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant={readinessFilter === value ? 'secondary' : 'ghost'}
                aria-pressed={readinessFilter === value}
                onClick={() => setReadinessFilter(value)}
              >
                {label}
              </Button>
            ))}
            <span
              className="ml-auto px-2 text-xs tabular-nums text-muted-foreground"
              aria-live="polite"
            >
              {visibleRows.length} / {rows.length}
            </span>
          </div>
          <Card className="block gap-0 py-0 overflow-hidden p-0">
            <div className="section-label hidden grid-cols-[minmax(0,1fr)_80px_170px_72px_24px] gap-4 border-b border-border bg-muted/60 px-5 py-3 md:grid">
              <span>{t('clip')}</span>
              <span className="text-right">{t('viral')}</span>
              <span className="text-right">{t('readiness')}</span>
              <span className="text-right">{t('duration')}</span>
              <span />
            </div>
            <div className="divide-y divide-border">
              {visibleRows.map(({ clip, readiness }) => (
                <Link
                  key={clip.id}
                  href={`/dashboard/clips/${clip.id}`}
                  className="group grid gap-4 px-4 py-4 transition-colors hover:bg-muted/60 md:grid-cols-[minmax(0,1fr)_80px_170px_72px_24px] md:items-center md:px-5"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {clip.title}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {clip.hookText ??
                        clip.job.sourceUrl ??
                        clip.job.sourceFilePath ??
                        'Generated clip'}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-between md:justify-end">
                    <span className="section-label md:hidden">
                      {t('viral')}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${
                        clip.viralScore >= 8
                          ? 'bg-success/10 text-success'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {clip.viralScore ?? '-'}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-4 md:flex-col md:items-end md:justify-center md:gap-1.5">
                    <span className="section-label md:hidden">
                      {t('readiness')}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground tabular-nums">
                        {readiness.score}
                      </span>
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted md:w-20">
                        <div
                          className={`h-full rounded-full ${
                            readiness.score >= 85 ? 'bg-success' : 'bg-primary'
                          }`}
                          style={{ width: `${readiness.score}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-between text-sm text-muted-foreground tabular-nums md:justify-end">
                    <span className="section-label md:hidden">
                      {t('duration')}
                    </span>
                    <span>{Math.round(clip.duration)}s</span>
                  </div>
                  <div className="hidden shrink-0 items-center justify-center md:flex">
                    {readiness.score >= 85 ? (
                      <CheckCircle2
                        className="h-5 w-5 text-success"
                        strokeWidth={1.75}
                      />
                    ) : (
                      <Scissors
                        className="h-4 w-4 text-muted-foreground"
                        strokeWidth={1.75}
                      />
                    )}
                  </div>
                </Link>
              ))}
              {visibleRows.length === 0 && (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  {locale === 'ro'
                    ? 'Niciun clip pentru această selecție.'
                    : 'No clips match this selection.'}
                </p>
              )}
            </div>
          </Card>
        </div>
      ) : (
        <div className="mt-8">
          <EmptyState
            icon={Film}
            title={t('noClips')}
            description={t('noClipsDescription')}
            action={
              <Button
                asChild={true}
                variant="default"
                className="clips-create-action"
              >
                <Link href="/dashboard/create">
                  <Plus aria-hidden="true" className="size-4" strokeWidth={2} />
                  {t('firstProject')}
                </Link>
              </Button>
            }
          />
        </div>
      )}
    </div>
  )
}
