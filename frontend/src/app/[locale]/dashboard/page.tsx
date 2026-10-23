'use client'

import { HomeEmptyState } from '@/components/dashboard/home-empty-state'
import { HomeInitialState } from '@/components/dashboard/home-initial-state'
import { RecentClips } from '@/components/dashboard/recent-clips'
import { StatsBar } from '@/components/dashboard/stats-bar'
import { StudioHero } from '@/components/dashboard/studio-hero'
import styles from '@/components/dashboard/home-workspace.module.css'
import { useApiResource } from '@/hooks/use-api-resource'
import type { DashboardData } from '@/types/api'

export default function DashboardPage() {
  const { data, error, reload } =
    useApiResource<DashboardData>('/api/dashboard')
  return (
    <div
      className={styles.workspace}
      data-testid="studio-dashboard"
      data-home-workspace=""
    >
      {!data ? (
        <HomeInitialState error={error} onRetry={reload} />
      ) : (
        <>
          <StudioHero />
          <StatsBar
            credits={data.metrics.credits}
            creditsUnlimited={data.metrics.creditsUnlimited}
            jobCount={data.metrics.jobCount}
            clipCount={data.metrics.clipCount}
            durationMinutes={data.metrics.durationMinutes}
          />
          {data.recentClips.length ? (
            <RecentClips clips={data.recentClips} />
          ) : (
            <HomeEmptyState />
          )}
        </>
      )}
    </div>
  )
}
