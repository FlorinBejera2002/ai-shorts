import { AuthGuard } from '@/components/auth/auth-guard'
import { ContentCalendar } from '@/components/calendar/content-calendar'
import { DashboardSection } from '@/components/dashboard/dashboard-section'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'
import Analytics from '@/components/dashboard/views/analytics'
import Library from '@/components/dashboard/views/clips'
import History from '@/components/dashboard/views/history'
import Review from '@/components/dashboard/views/review'
import Account from '@/components/dashboard/views/settings'
import { PublishingWorkspace } from '@/components/publishing/publishing-workspace'
import {
  dashboardRedirectHref,
  dashboardSectionTab,
  type DashboardSearchParams
} from '@/lib/dashboard-sections'
import { useLocale } from 'next-intl'
import { useState } from 'react'
import {
  Navigate,
  Outlet,
  useLocation,
  useSearchParams
} from 'react-router-dom'
import { localizeHref } from '../i18n/navigation'

function searchRecord(search: URLSearchParams): DashboardSearchParams {
  const record: DashboardSearchParams = {}
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key)
    record[key] = values.length > 1 ? values : values[0]
  }
  return record
}

export function DashboardLayout() {
  const [defaultOpen] = useState(
    () =>
      !document.cookie
        .split(';')
        .map((value) => value.trim())
        .includes('sidebar_state=false')
  )
  return (
    <AuthGuard>
      <DashboardShell defaultOpen={defaultOpen}>
        <Outlet />
      </DashboardShell>
    </AuthGuard>
  )
}

export function ClipsRoute() {
  const [search] = useSearchParams()
  const tab = dashboardSectionTab('clips', search.get('tab'))
  return (
    <DashboardSection section="clips" activeTab={tab}>
      {tab === 'review' ? <Review /> : <Library />}
    </DashboardSection>
  )
}

export function HistoryRoute() {
  const [search] = useSearchParams()
  const tab = dashboardSectionTab('projects', search.get('tab'))
  return (
    <DashboardSection section="projects" activeTab={tab}>
      {tab === 'analytics' ? <Analytics /> : <History />}
    </DashboardSection>
  )
}

export function SettingsRoute() {
  const locale = useLocale()
  const [search] = useSearchParams()
  const tab = search.get('tab')
  if (tab === 'brand' || tab === 'billing') {
    return (
      <Navigate
        replace={true}
        to={localizeHref(
          dashboardRedirectHref(tab, searchRecord(search)),
          locale
        )}
      />
    )
  }
  return <Account />
}

export function LegacyDashboardRedirect({
  page
}: {
  page: 'review' | 'analytics'
}) {
  const locale = useLocale()
  const location = useLocation()
  const search = new URLSearchParams(location.search)
  return (
    <Navigate
      replace={true}
      to={localizeHref(
        dashboardRedirectHref(page, searchRecord(search)),
        locale
      )}
    />
  )
}

export function CalendarRoute() {
  return <ContentCalendar />
}

export function PublishRoute() {
  return <PublishingWorkspace />
}
