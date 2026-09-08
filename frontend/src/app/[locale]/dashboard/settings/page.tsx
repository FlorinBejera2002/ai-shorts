import Account from '@/components/dashboard/views/settings'
import { redirect } from '@/i18n/navigation'
import {
  type DashboardSearchParams,
  dashboardRedirectHref
} from '@/lib/dashboard-sections'
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<DashboardSearchParams>
}) {
  const search = await searchParams
  if (search.tab === 'brand' || search.tab === 'billing') {
    const { locale } = await params
    return redirect({ href: dashboardRedirectHref(search.tab, search), locale })
  }
  return <Account />
}
