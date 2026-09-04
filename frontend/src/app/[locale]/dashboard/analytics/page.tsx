import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { auth } from '@/lib/auth'
import { getPrisma } from '@/lib/db'
import {
  BarChart3,
  Clock,
  Film,
  TrendingDown,
  TrendingUp,
  Zap
} from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'

export const runtime = 'nodejs'

export default async function AnalyticsPage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('analytics')
  const common = await getTranslations('common')

  const session = await auth()
  const userId = session?.user?.id
  const prisma = getPrisma()

  const [jobs, clips] = await Promise.all([
    userId
      ? prisma.job.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            createdAt: true
          }
        })
      : [],
    userId
      ? prisma.clip.findMany({
          where: { userId },
          select: {
            id: true,
            duration: true,
            viralScore: true,
            createdAt: true
          }
        })
      : []
  ])

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
      label: day.toLocaleDateString('en', { weekday: 'short' }),
      count: clips.filter(
        (c) => new Date(c.createdAt) >= day && new Date(c.createdAt) < next
      ).length
    }
  })
  const maxClips = Math.max(...clipsByDay.map((d) => d.count), 1)

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
  const maxBucket = Math.max(...scoreBuckets.map((b) => b.count), 1)

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
            <div
              key={stat.label}
              className="panel-soft flex min-w-0 items-center gap-3 p-4"
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
            </div>
          )
        })}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel p-5 sm:p-6">
          <div>
            <p className="section-label">{t('clipsGenerated')}</p>
            <h2 className="mt-2 text-lg font-semibold text-foreground">
              {t('last7Days')}
            </h2>
          </div>
          <div className="mt-8 flex h-44 items-end justify-between gap-2 sm:gap-3">
            {clipsByDay.map((day, i) => {
              const heightPercent = Math.max(
                (day.count / maxClips) * 100,
                day.count > 0 ? 10 : 3
              )
              return (
                <div
                  key={day.label}
                  className="group flex h-full flex-1 flex-col items-center gap-1.5"
                  style={{
                    animation: `slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${i * 80}ms both`
                  }}
                >
                  <span
                    className={`h-4 text-[10px] font-semibold tabular-nums text-muted-foreground ${day.count === 0 ? 'invisible' : ''}`}
                  >
                    {day.count}
                  </span>
                  <div className="relative min-h-0 w-full flex-1">
                    <div
                      className="absolute inset-x-0 bottom-0 w-full rounded-t-lg bg-gradient-to-t from-primary to-accent/70 transition-all duration-500 hover:brightness-110"
                      style={{
                        height: `${heightPercent}%`,
                        opacity: day.count > 0 ? 1 : 0.2
                      }}
                      title={`${day.label}: ${common('clips', { count: day.count })}`}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {day.label}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        <section className="panel p-5 sm:p-6">
          <div>
            <p className="section-label">{t('avgViralScore')}</p>
            <h2 className="mt-2 text-lg font-semibold text-foreground">
              {t('scoreDistribution')}
            </h2>
          </div>
          <div className="mt-6 space-y-3">
            {scoreBuckets.map((bucket, i) => (
              <div
                key={bucket.label}
                style={{
                  animation: `slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${i * 50}ms both`
                }}
              >
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-foreground">
                    {bucket.label}
                  </span>
                  <span className="tabular-nums text-sm font-semibold text-muted-foreground">
                    {common('clips', { count: bucket.count })}
                  </span>
                </div>
                <div
                  className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={`${bucket.label}: ${common('clips', { count: bucket.count })}`}
                  aria-valuemin={0}
                  aria-valuemax={maxBucket}
                  aria-valuenow={bucket.count}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                    style={{ width: `${(bucket.count / maxBucket) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section>
        <h2 className="section-label mb-3">{t('performanceHighlights')}</h2>
        <div className="panel grid sm:grid-cols-2 xl:grid-cols-4">
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
        </div>
      </section>
    </div>
  )
}
