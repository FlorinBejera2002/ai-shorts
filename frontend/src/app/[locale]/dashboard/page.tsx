'use client'

import { RecentClips } from '@/components/dashboard/recent-clips'
import { StatsBar } from '@/components/dashboard/stats-bar'
import { StudioHero } from '@/components/dashboard/studio-hero'
import { ApiState } from '@/components/shared/api-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useApiResource } from '@/hooks/use-api-resource'
import { Link } from '@/i18n/navigation'
import type { DashboardData } from '@/types/api'
import { ArrowUpRight, Scissors } from 'lucide-react'
import { useTranslations } from 'next-intl'

export default function DashboardPage() {
  const t = useTranslations('dashboard')
  const s = useTranslations('dashboard.studio')
  const { data, error, reload } =
    useApiResource<DashboardData>('/api/dashboard')
  if (!data) return <ApiState error={error} retry={reload} />
  const { metrics, recentClips } = data

  return (
    <div className="dashboard-workspace" data-testid="studio-dashboard">
      <StudioHero />

      <StatsBar
        credits={metrics.credits}
        jobCount={metrics.jobCount}
        clipCount={metrics.clipCount}
        durationMinutes={metrics.durationMinutes}
      />
      <div>
        <section className="min-w-0" aria-label={t('recentClips')}>
          {recentClips.length ? (
            <RecentClips clips={recentClips} />
          ) : (
            <Card className="rounded-md py-0 shadow-none">
              <CardContent className="px-6 py-9 text-center sm:px-8 sm:py-10">
                <div className="mx-auto max-w-sm">
                  <div className="mb-5 inline-flex size-11 items-center justify-center rounded-md bg-muted text-muted-foreground">
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
      </div>
    </div>
  )
}
