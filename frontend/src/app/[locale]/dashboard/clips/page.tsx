import { DashboardSection } from '@/components/dashboard/dashboard-section'
import Library from '@/components/dashboard/views/clips'
import Review from '@/components/dashboard/views/review'
import {
  type DashboardSearchParams,
  dashboardSectionTab
} from '@/lib/dashboard-sections'

export default async function Page({
  searchParams
}: {
  searchParams: Promise<DashboardSearchParams>
}) {
  const tab = dashboardSectionTab('clips', (await searchParams).tab)
  return (
    <DashboardSection section="clips" activeTab={tab}>
      {tab === 'review' ? <Review /> : <Library />}
    </DashboardSection>
  )
}
