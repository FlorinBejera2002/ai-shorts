import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { BarChart3, Clock, Film, TrendingUp, Zap } from 'lucide-react'

export const runtime = 'nodejs'

export default async function AnalyticsPage() {
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
            createdAt: true,
          },
        })
      : [],
    userId
      ? prisma.clip.findMany({
          where: { userId },
          select: {
            id: true,
            duration: true,
            viralScore: true,
            createdAt: true,
          },
        })
      : [],
  ])

  const totalJobs = jobs.length
  const completedJobs = jobs.filter((j) => j.status === 'completed').length
  const totalClips = clips.length
  const avgViralScore =
    clips.length > 0
      ? Math.round(
          clips.reduce((sum, c) => sum + (c.viralScore ?? 0), 0) / clips.length,
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
        (c) => new Date(c.createdAt) >= day && new Date(c.createdAt) < next,
      ).length,
    }
  })
  const maxClips = Math.max(...clipsByDay.map((d) => d.count), 1)

  const scoreBuckets = [
    { label: '90-100', min: 90, max: 101 },
    { label: '80-89', min: 80, max: 90 },
    { label: '70-79', min: 70, max: 80 },
    { label: '60-69', min: 60, max: 70 },
    { label: '<60', min: 0, max: 60 },
  ].map((b) => ({
    ...b,
    count: clips.filter(
      (c) => (c.viralScore ?? 0) >= b.min && (c.viralScore ?? 0) < b.max,
    ).length,
  }))
  const maxBucket = Math.max(...scoreBuckets.map((b) => b.count), 1)

  const stats = [
    { label: 'Total projects', value: totalJobs, icon: Zap },
    { label: 'Clips generated', value: totalClips, icon: Film },
    { label: 'Avg viral score', value: avgViralScore, icon: TrendingUp },
    { label: 'Success rate', value: `${successRate}%`, icon: BarChart3 },
    {
      label: 'Content created',
      value: `${Math.round(totalDuration / 60)}m`,
      icon: Clock,
    },
    { label: 'Source processed', value: `${totalSourceMinutes}m`, icon: Clock },
  ]

  return (
    <div className="animate-fade-in">
      <h1 className="text-lg font-semibold tracking-tight">Analytics</h1>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Overview of your clip generation performance
      </p>

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="bg-card px-4 py-4">
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </span>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">
                {stat.value}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-[13px] font-semibold">Clips last 7 days</h2>
          <div className="mt-4 flex items-end gap-2 h-32">
            {clipsByDay.map((day) => (
              <div key={day.label} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {day.count > 0 ? day.count : ''}
                </span>
                <div
                  className="w-full rounded-t bg-primary/80 transition-all"
                  style={{
                    height: `${Math.max((day.count / maxClips) * 100, day.count > 0 ? 8 : 2)}%`,
                    opacity: day.count > 0 ? 1 : 0.2,
                  }}
                />
                <span className="text-[10px] text-muted-foreground">{day.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-[13px] font-semibold">Viral score distribution</h2>
          {totalClips > 0 ? (
            <div className="mt-4 space-y-3">
              {scoreBuckets.map((bucket) => (
                <div key={bucket.label}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span>{bucket.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {bucket.count} clips
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-primary/70"
                      style={{ width: `${(bucket.count / maxBucket) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              No clips yet — generate your first project to see stats.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card p-5">
        <h2 className="text-[13px] font-semibold">Performance highlights</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
              High-scoring clips
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {highScoreClips}
            </div>
            <div className="text-[11px] text-muted-foreground">score &ge; 80</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Completion rate
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{successRate}%</div>
            <div className="text-[11px] text-muted-foreground">
              {completedJobs}/{totalJobs} jobs
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Avg clip length
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {totalClips > 0 ? Math.round(totalDuration / totalClips) : 0}s
            </div>
            <div className="text-[11px] text-muted-foreground">per clip</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
              Time saved
            </div>
            <div className="mt-1 text-xl font-semibold tabular-nums">
              {totalSourceMinutes > 0
                ? `~${Math.round(totalSourceMinutes * 3)}m`
                : '0m'}
            </div>
            <div className="text-[11px] text-muted-foreground">vs manual editing</div>
          </div>
        </div>
      </div>
    </div>
  )
}
