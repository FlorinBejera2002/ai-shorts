import { DashboardSection } from '@/components/dashboard/dashboard-section'
import Analytics from '@/components/dashboard/views/analytics'
import History from '@/components/dashboard/views/history'
import {
  type DashboardSearchParams,
  dashboardSectionTab
} from '@/lib/dashboard-sections'

export default async function Page({
  searchParams
}: {
  searchParams: Promise<DashboardSearchParams>
}) {
  const tab = dashboardSectionTab('projects', (await searchParams).tab)
  return (
    <DashboardSection section="projects" activeTab={tab}>
      {tab === 'analytics' ? <Analytics /> : <History />}
    </DashboardSection>
  )
}
