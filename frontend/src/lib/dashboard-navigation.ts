export const dashboardNavigation = [
  {
    labelKey: 'groupStudio',
    items: [
      { href: '/dashboard', key: 'home' },
      { href: '/dashboard/review', key: 'review' },
      { href: '/dashboard/clips', key: 'clips' },
      { href: '/dashboard/history', key: 'history' }
    ]
  },
  {
    labelKey: 'groupGrow',
    items: [
      { href: '/dashboard/analytics', key: 'analytics' },
      { href: '/dashboard/calendar', key: 'calendar' },
      { href: '/dashboard/script-generator', key: 'scripts' },
      { href: '/dashboard/publish', key: 'publish' }
    ]
  },
  {
    labelKey: 'groupWorkspace',
    items: [
      { href: '/dashboard/brand', key: 'brand' },
      { href: '/dashboard/billing', key: 'billing' },
      { href: '/dashboard/settings', key: 'settings' }
    ]
  }
] as const

export function isDashboardRouteActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === href
  if (href === '/dashboard/history' && pathname.startsWith('/dashboard/jobs/'))
    return true
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function dashboardRouteLabel(pathname: string) {
  if (isDashboardRouteActive(pathname, '/dashboard/create')) return 'create'
  return (
    dashboardNavigation
      .flatMap((group) => [...group.items])
      .find((item) => isDashboardRouteActive(pathname, item.href))?.key ??
    'home'
  )
}
