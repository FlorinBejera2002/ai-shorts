export const dashboardSections = {
  clips: {
    href: '/dashboard/clips',
    tabs: ['library', 'review']
  },
  projects: {
    href: '/dashboard/history',
    tabs: ['history', 'analytics']
  },
  settings: {
    href: '/dashboard/settings',
    tabs: ['account']
  }
} as const

export type DashboardSectionKey = keyof typeof dashboardSections
export type DashboardSearchParams = Record<
  string,
  string | string[] | undefined
>

export function dashboardSectionTab(
  section: DashboardSectionKey,
  value: unknown
) {
  const tabs: readonly string[] = dashboardSections[section].tabs
  return typeof value === 'string' && tabs.includes(value) ? value : tabs[0]!
}

export function dashboardSectionHref(
  section: DashboardSectionKey,
  tab: string
) {
  const config = dashboardSections[section]
  const selected = dashboardSectionTab(section, tab)
  return selected === config.tabs[0]
    ? config.href
    : `${config.href}?tab=${selected}`
}

export const legacyDashboardDestinations = {
  review: '/dashboard/clips?tab=review',
  analytics: '/dashboard/history?tab=analytics',
  brand: '/dashboard/brand',
  billing: '/dashboard/billing'
} as const

// Keep checkout return values and other query parameters on bookmarked URLs.
export function dashboardRedirectHref(
  page: keyof typeof legacyDashboardDestinations,
  search: DashboardSearchParams = {}
) {
  const [pathname, fixedQuery] = legacyDashboardDestinations[page].split('?')
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(search)) {
    for (const item of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value]) {
      query.append(key, item)
    }
  }
  if (page === 'brand' || page === 'billing') query.delete('tab')
  for (const [key, value] of new URLSearchParams(fixedQuery))
    query.set(key, value)
  return query.size ? `${pathname}?${query}` : pathname!
}
