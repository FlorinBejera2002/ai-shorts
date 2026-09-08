import { redirect } from '@/i18n/navigation'
import {
  type DashboardSearchParams,
  dashboardRedirectHref,
  type legacyDashboardDestinations
} from '@/lib/dashboard-sections'

export function dashboardRedirect(
  page: keyof typeof legacyDashboardDestinations
) {
  return async function LegacyDashboardPage({
    params,
    searchParams
  }: {
    params: Promise<{ locale: string }>
    searchParams: Promise<DashboardSearchParams>
  }) {
    const { locale } = await params
    return redirect({
      href: dashboardRedirectHref(page, await searchParams),
      locale
    })
  }
}
