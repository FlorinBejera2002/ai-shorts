import { Plus } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { StatsBar } from '@/components/dashboard/stats-bar'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { ActiveJobs } from '@/components/dashboard/active-jobs'
import { WeeklyChart } from '@/components/dashboard/weekly-chart'
import { RecentClips } from '@/components/dashboard/recent-clips'
import { TipsPanel } from '@/components/dashboard/tips-panel'

export const runtime = 'nodejs'

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('dashboard')
  const session = await auth()
  const userId = session?.user?.id

  const [jobCount, clipCount, recentClips, brandKit] = userId
    ? await Promise.all([
        prisma.job.count({ where: { userId } }),
        prisma.clip.count({ where: { userId } }),
        prisma.clip.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 6,
          select: {
            id: true,
            title: true,
            duration: true,
            viralScore: true,
            fileUrl: true,
            resolution: true,
          },
        }),
        prisma.brandKit.findUnique({ where: { userId } }),
      ])
    : [0, 0, [], null]

  const credits = session?.user?.credits ?? 0
  const plan = session?.user?.plan ?? 'free'

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    d.setHours(0, 0, 0, 0)
    return d
  })

  const allClipsForChart = userId
    ? await prisma.clip.findMany({
        where: {
          userId,
          createdAt: { gte: last7Days[0] },
        },
        select: { createdAt: true },
      })
    : []

  const chartData = last7Days.map((day) => {
    const next = new Date(day)
    next.setDate(next.getDate() + 1)
    return {
      label: day.toLocaleDateString(locale, { weekday: 'short' }),
      count: allClipsForChart.filter(
        (c) => new Date(c.createdAt) >= day && new Date(c.createdAt) < next
      ).length,
    }
  })

  return (
    <div className="animate-fade-in space-y-8">
      <div className="relative overflow-hidden border-b border-border pb-7 pt-2">
        <div className="relative flex items-end justify-between gap-5">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.22em] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Creator workspace</div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('welcomeUser', {
              name: session?.user?.name ? session.user.name : 'empty',
            })}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('overview')}
          </p>
        </div>
        <Link
          href="/dashboard/create"
          className="group inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-3 text-[13px] font-semibold text-background transition-all hover:-translate-y-0.5 hover:bg-primary hover:text-primary-foreground hover:shadow-lg"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('newProject')}
        </Link>
        </div>
      </div>

      <StatsBar
        credits={credits}
        jobCount={jobCount}
        clipCount={clipCount}
        plan={plan}
      />

      <QuickActions />

      <div className="grid gap-4 lg:grid-cols-2">
        <ActiveJobs />
        <WeeklyChart data={chartData} />
      </div>

      <RecentClips clips={recentClips} />

      <TipsPanel
        hasSubtitles={true}
        hasBrandKit={!!brandKit}
        pendingClips={recentClips.length}
      />
    </div>
  )
}
