'use client'

import { useAuth } from '@/components/auth/use-auth'
import { ActiveJobs } from '@/components/dashboard/active-jobs'
import { ActivityCharts } from '@/components/dashboard/activity-charts'
import { RecentClips } from '@/components/dashboard/recent-clips'
import { StatsBar } from '@/components/dashboard/stats-bar'
import { StudioHero } from '@/components/dashboard/studio-hero'
import { ApiState } from '@/components/shared/api-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import type { DashboardData } from '@/types/api'
import { ArrowUpRight, ChevronDown, Scissors } from 'lucide-react'
import { useTranslations } from 'next-intl'

export default function DashboardPage() {
  const t = useTranslations('dashboard')
  const s = useTranslations('dashboard.studio')
  const session = useAuth()
  const { data, error, reload } =
    useApiResource<DashboardData>('/api/dashboard')
  if (!data) return <ApiState error={error} retry={reload} />
  const { metrics, recentClips } = data

  return (
    <div className="space-y-6" data-testid="studio-dashboard">
      <header className="flex flex-wrap items-center justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('welcomeUser', { name: session?.user?.name || 'empty' })}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {s('subtitle')}
          </p>
        </div>
      </header>

      <StudioHero />

      <StatsBar
        credits={metrics.credits}
        jobCount={metrics.jobCount}
        clipCount={metrics.clipCount}
        durationMinutes={metrics.durationMinutes}
      />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0" aria-label={t('recentClips')}>
          {recentClips.length ? (
            <RecentClips clips={recentClips} />
          ) : (
            <Card className="rounded-xl py-0 shadow-none">
              <CardContent className="px-6 py-9 text-center sm:px-8 sm:py-10">
                <div className="mx-auto max-w-sm">
                  <div className="mb-5 inline-flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <Scissors className="size-5" />
                  </div>
                  <h2 className="text-lg font-semibold tracking-tight">
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
        </section>
        <aside className="min-w-0 space-y-6">
          <ActiveJobs />
        </aside>
      </div>
      <details
        className="group/activity border-t pt-5"
        data-testid="dashboard-insights"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span>{s('activity')}</span>
          <ChevronDown className="size-4 text-muted-foreground transition-transform group-open/activity:rotate-180" />
        </summary>
        <div className="pt-5">
          <ActivityCharts
            activity={metrics.activity}
            statuses={metrics.statuses}
          />
          <p className="pt-4 text-xs leading-relaxed text-muted-foreground">
            {s('dataNote')}
          </p>
        </div>
      </details>
    </div>
  )
}
