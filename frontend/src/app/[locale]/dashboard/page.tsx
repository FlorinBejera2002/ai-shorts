import { ActiveJobs } from '@/components/dashboard/active-jobs'
import { ActivityCharts } from '@/components/dashboard/activity-charts'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { RecentClips } from '@/components/dashboard/recent-clips'
import { StatsBar } from '@/components/dashboard/stats-bar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Link } from '@/i18n/navigation'
import { auth } from '@/lib/auth'
import { getDashboardData } from '@/lib/dashboard-data'
import { getPrisma } from '@/lib/db'
import { resolveMediaUrl } from '@/lib/signed-url'
import { ArrowUpRight, Film, Plus, Scissors } from 'lucide-react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'

export const runtime = 'nodejs'

export default async function DashboardPage({
  params
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('dashboard')
  const s = await getTranslations('dashboard.studio')
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect(locale === 'en' ? '/login' : `/${locale}/login`)
  const prisma = getPrisma()
  const [metrics, recentClips] = await Promise.all([
    getDashboardData(prisma, userId),
    prisma.clip.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: {
        id: true,
        title: true,
        duration: true,
        viralScore: true,
        filePath: true,
        fileUrl: true,
        fileStorageKey: true,
        thumbnailPath: true,
        thumbnailUrl: true,
        thumbnailStorageKey: true,
        resolution: true
      }
    })
  ])

  return (
    <div className="space-y-6" data-testid="studio-dashboard">
      <PageHeader
        title={t('welcomeUser', { name: session?.user?.name || 'empty' })}
        description={s('subtitle')}
        actions={
          <>
            <Badge
              variant="outline"
              className="rounded-md px-3 py-1.5 text-xs uppercase"
            >
              {metrics.plan}
            </Badge>
            <Button asChild={true} className="h-10">
              <Link href="/dashboard/create">
                <Plus className="size-4" />
                {t('newProject')}
              </Link>
            </Button>
          </>
        }
      />

      <StatsBar
        credits={metrics.credits}
        jobCount={metrics.jobCount}
        clipCount={metrics.clipCount}
        durationMinutes={metrics.durationMinutes}
      />
      <ActivityCharts activity={metrics.activity} statuses={metrics.statuses} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-5" aria-label={t('recentClips')}>
          {recentClips.length ? (
            <RecentClips
              clips={recentClips.map((clip) => ({
                ...clip,
                fileUrl: resolveMediaUrl(
                  clip.fileStorageKey ?? clip.filePath,
                  clip.fileUrl
                ),
                thumbnailUrl: resolveMediaUrl(
                  clip.thumbnailStorageKey ?? clip.thumbnailPath,
                  clip.thumbnailUrl
                )
              }))}
            />
          ) : (
            <Card className="overflow-hidden py-0 shadow-none">
              <CardContent className="relative px-6 py-8 sm:px-8">
                <div
                  aria-hidden="true"
                  className="absolute -right-8 top-0 flex h-full w-48 rotate-[-12deg] items-center justify-center opacity-[0.07]"
                >
                  <Film className="size-48 text-primary" strokeWidth={0.8} />
                </div>
                <div className="relative max-w-sm">
                  <div className="mb-5 inline-flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/5 text-primary">
                    <Scissors className="size-5" />
                  </div>
                  <h2 className="text-xl font-semibold tracking-tight">
                    {s('firstClip')}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    {s('firstClipDescription')}
                  </p>
                  <Button
                    asChild={true}
                    variant="outline"
                    className="mt-5 gap-2"
                  >
                    <Link href="/dashboard/create">
                      {s('startCreating')}
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <QuickActions />
        </section>
        <ActiveJobs />
      </div>
      <p className="border-t border-border/70 pt-4 text-[11px] text-muted-foreground">
        {s('dataNote')}
      </p>
    </div>
  )
}
