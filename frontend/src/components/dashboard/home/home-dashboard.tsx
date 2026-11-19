'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import { WorkspaceMobileHeader } from '@/components/dashboard/workspace-mobile-header'
import { useApiResource } from '@/hooks/use-api-resource'
import type { DashboardData } from '@/types/api'
import { HomeFirstRun } from './home-first-run'
import { HomeHero } from './home-hero'
import { HomeRecentClips } from './home-recent-clips'
import { HomeScheduledCard } from './home-scheduled-card'
import { HomeStats } from './home-stats'
import { HomeError, HomeLoading } from './home-states'
import { HomeWorkCard } from './home-work-card'
import styles from './home.module.css'

/** Panou principal: chooses between loading, error, new account and the regular overview. */
export function HomeDashboard() {
  const { data, error, reload } = useApiResource<DashboardData>('/api/dashboard')
  const firstRun = data ? data.metrics.jobCount === 0 && data.metrics.clipCount === 0 : false

  return (
    <div
      className={`${theme.surface} ${styles.home}`}
      data-reference-surface=""
      data-testid="studio-dashboard"
      data-home-workspace=""
    >
      <WorkspaceMobileHeader />
      {!data ? (
        error ? <HomeError onRetry={reload} /> : <HomeLoading />
      ) : firstRun ? (
        <>
          <HomeHero firstRun />
          <HomeFirstRun />
        </>
      ) : (
        <>
          <div className={styles.row}>
            <HomeHero />
            <HomeWorkCard />
          </div>
          <div className={styles.row}>
            <HomeStats
              clipCount={data.metrics.clipCount}
              jobCount={data.metrics.jobCount}
              durationMinutes={data.metrics.durationMinutes}
              activity={data.metrics.activity ?? []}
            />
            <HomeScheduledCard />
          </div>
          <HomeRecentClips clips={data.recentClips} />
        </>
      )}
    </div>
  )
}
