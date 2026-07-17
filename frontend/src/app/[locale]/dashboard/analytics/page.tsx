import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
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

  const session = await auth()
  const userId = session?.user?.id

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
          clips.reduce((sum, c) => sum + (c.viralScore ?? 0), 0) / clips.length
        )
      : 0
  const totalDuration = clips.reduce((sum, c) => sum + (c.duration ?? 0), 0)
  const totalSourceMinutes = Math.round(totalDuration / 60)
  const highScoreClips = clips.filter((c) => (c.viralScore ?? 0) >= 80).length
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
    { label: '90-100', min: 90, max: 101 },
    { label: '80-89', min: 80, max: 90 },
    { label: '70-79', min: 70, max: 80 },
    { label: '60-69', min: 60, max: 70 },
    { label: '<60', min: 0, max: 60 }
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
      icon: Zap,
      color: 'from-amber-500/10 to-amber-500/5'
    },
    {
      label: t('clipsGenerated'),
      value: totalClips,
      icon: Film,
      color: 'from-violet-500/10 to-violet-500/5'
    },
    {
      label: t('avgViralScore'),
      value: avgViralScore,
      icon: TrendingUp,
      color: 'from-emerald-500/10 to-emerald-500/5'
    },
    {
      label: t('successRate'),
      value: `${successRate}%`,
      icon: BarChart3,
      color: 'from-blue-500/10 to-blue-500/5'
    },
    {
      label: t('contentCreated'),
      value: `${Math.round(totalDuration / 60)}m`,
      icon: Clock,
      color: 'from-pink-500/10 to-pink-500/5'
    },
    {
      label: t('sourceProcessed'),
      value: `${totalSourceMinutes}m`,
      icon: Clock,
      color: 'from-cyan-500/10 to-cyan-500/5'
    }
  ]

  if (totalClips === 0) {
    return (
      <div className="animate-fade-in">
        <PageHeader title={t('title')} description={t('desc')} />
        <div className="mt-12">
          <EmptyState
            icon={Film}
            title={t('noClipsYet')}
            description="Start creating clips to see your analytics"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title={t('title')} description={t('desc')} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat, i) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className={`rounded-xl border border-border/60 bg-gradient-to-br ${stat.color} p-4 transition-all duration-300 hover:border-border hover:shadow-md hover:-translate-y-0.5 animate-slide-up`}
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {stat.label}
                  </div>
                  <div className="mt-2 text-3xl font-bold tabular-nums text-foreground">
                    {stat.value}
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/40 backdrop-blur-sm">
                  <Icon
                    className="h-5 w-5 text-primary/70"
                    strokeWidth={1.75}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/5 to-accent/5 p-6">
          <h2 className="text-sm font-semibold">{t('last7Days')}</h2>
          <div className="mt-6 flex items-end justify-between gap-1 h-40">
            {clipsByDay.map((day, i) => {
              const heightPercent = Math.max(
                (day.count / maxClips) * 100,
                day.count > 0 ? 10 : 3
              )
              return (
                <div
                  key={day.label}
                  className="group flex flex-1 flex-col items-center gap-1.5"
                  style={{
                    animation: `slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${i * 80}ms both`
                  }}
                >
                  {day.count > 0 && (
                    <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {day.count}
                    </span>
                  )}
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-primary to-primary/60 transition-all duration-500 hover:from-primary hover:to-primary/50 cursor-pointer"
                    style={{
                      height: `${heightPercent}%`,
                      opacity: day.count > 0 ? 1 : 0.2
                    }}
                    title={`${day.label}: ${day.count} clips`}
                  />
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {day.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/5 to-accent/5 p-6">
          <h2 className="text-sm font-semibold">{t('scoreDistribution')}</h2>
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
                    {t('common.clips', { count: bucket.count })}
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-background/40">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
                    style={{ width: `${(bucket.count / maxBucket) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/5 to-accent/5 p-6">
        <h2 className="text-sm font-semibold">{t('performanceHighlights')}</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              label: t('highScoring'),
              value: highScoreClips,
              sublabel: t('scoreAbove80'),
              icon: TrendingUp
            },
            {
              label: t('completionRate'),
              value: `${successRate}%`,
              sublabel: `${completedJobs}/${totalJobs} ${t('common.jobs', { count: totalJobs })}`,
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
                className="rounded-lg border border-background bg-background/30 p-4 animate-slide-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {item.label}
                    </div>
                    <div className="mt-2 text-2xl font-bold tabular-nums text-foreground">
                      {item.value}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {item.sublabel}
                    </div>
                  </div>
                  <Icon
                    className="h-5 w-5 text-primary/50"
                    strokeWidth={1.75}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
