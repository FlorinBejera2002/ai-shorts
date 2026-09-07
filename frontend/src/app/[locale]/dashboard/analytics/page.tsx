'use client'

import { AnalyticsCharts } from '@/components/dashboard/analytics-charts'
import { ApiState } from '@/components/shared/api-state'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { useApiResource } from '@/hooks/use-api-resource'
import type { AnalyticsData } from '@/types/api'
import {
  BarChart3,
  Clock,
  Film,
  TrendingDown,
  TrendingUp,
  Zap
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

export default function AnalyticsPage() {
  const locale = useLocale()
  const t = useTranslations('analytics')
  const common = useTranslations('common')
  const { data, error, reload } = useApiResource<AnalyticsData>(
    '/api/dashboard/analytics'
  )
  if (!data) return <ApiState error={error} retry={reload} />
  const { jobs, clips } = data

  const totalJobs = jobs.length
  const completedJobs = jobs.filter((j) => j.status === 'completed').length
  const totalClips = clips.length
  const avgViralScore =
    clips.length > 0
      ? Math.round(
          (clips.reduce((sum, c) => sum + (c.viralScore ?? 0), 0) /
            clips.length) *
            10
        ) / 10
      : 0
  const totalDuration = clips.reduce((sum, c) => sum + (c.duration ?? 0), 0)
  const totalSourceMinutes = Math.round(totalDuration / 60)
  const highScoreClips = clips.filter((c) => (c.viralScore ?? 0) >= 8).length
  const successRate =
    totalJobs > 0 ? Math.round((completedJobs / totalJobs) * 100) : 0

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    d.setHours(0, 0, 0, 0)
    return d
  })
  const clipsByDay = last7Days.map((day) => {
    const next = new Date(day)
    next.setDate(next.getDate() + 1)
    return {
      label: day.toLocaleDateString(locale, { weekday: 'short' }),
      count: clips.filter(
        (c) => new Date(c.createdAt) >= day && new Date(c.createdAt) < next
      ).length
    }
  })

  const scoreBuckets = [
    { label: '9–10', min: 9, max: 10.01 },
    { label: '8–8.9', min: 8, max: 9 },
    { label: '7–7.9', min: 7, max: 8 },
    { label: '6–6.9', min: 6, max: 7 },
    { label: '<6', min: 0, max: 6 }
  ].map((b) => ({
    ...b,
    count: clips.filter(
      (c) => (c.viralScore ?? 0) >= b.min && (c.viralScore ?? 0) < b.max
    ).length
  }))

  const stats = [
    {
      label: t('totalProjects'),
      value: totalJobs,
      icon: Zap
    },
    {
      label: t('clipsGenerated'),
      value: totalClips,
      icon: Film
    },
    {
      label: t('avgViralScore'),
      value: `${avgViralScore}/10`,
      icon: TrendingUp
    },
    {
      label: t('successRate'),
      value: `${successRate}%`,
      icon: BarChart3
    },
    {
      label: t('contentCreated'),
      value: `${Math.round(totalDuration / 60)}m`,
      icon: Clock
    },
    {
      label: t('sourceProcessed'),
      value: `${totalSourceMinutes}m`,
      icon: Clock
    }
  ]

  if (totalClips === 0) {
    return (
      <div className="animate-fade-in">
        <PageHeader title={t('title')} description={t('desc')} />
        <div className="mt-12">
          <EmptyState
            icon={Film}
            title={t('noClipsTitle')}
            description={t('noClipsYet')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-8">
      <PageHeader title={t('title')} description={t('desc')} />

      <section
        aria-label={t('title')}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"
      >
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card
              key={stat.label}
              className="block gap-0 py-0 flex min-w-0 items-center gap-3 p-4"
            >
              <div className="icon-tile shrink-0 bg-primary/10 text-primary">
                <Icon className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <div className="section-label truncate">{stat.label}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums leading-none text-foreground">
                  {stat.value}
                </div>
              </div>
            </Card>
          )
        })}
      </section>

      <AnalyticsCharts days={clipsByDay} scores={scoreBuckets} />

      <section>
        <h2 className="section-label mb-3">{t('performanceHighlights')}</h2>
        <Card className="block gap-0 py-0 grid sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: t('highScoring'),
              value: highScoreClips,
              sublabel: t('scoreAbove8'),
              icon: TrendingUp
            },
            {
              label: t('completionRate'),
              value: `${successRate}%`,
              sublabel: `${completedJobs}/${totalJobs} ${common('jobs', { count: totalJobs })}`,
              icon: BarChart3
            },
            {
              label: t('avgClipLength'),
              value:
                totalClips > 0
                  ? `${Math.round(totalDuration / totalClips)}s`
                  : '0s',
              sublabel: t('perClip'),
              icon: Clock
            },
            {
              label: t('timeSaved'),
              value:
                totalSourceMinutes > 0
                  ? `~${Math.round(totalSourceMinutes * 3)}m`
                  : '0m',
              sublabel: t('vsManual'),
              icon: TrendingDown
            }
          ].map((item, i) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 border-b border-border p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r sm:[&:nth-child(3)]:border-b-0 xl:border-b-0 xl:border-r xl:last:border-r-0 xl:[&:nth-child(3)]:border-r animate-slide-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="icon-tile shrink-0 bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="section-label truncate">{item.label}</div>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
                    <span className="text-xl font-semibold tabular-nums">
                      {item.value}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {item.sublabel}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </Card>
      </section>
    </div>
  )
}
