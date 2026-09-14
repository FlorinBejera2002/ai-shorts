export const dashboardNavigation = [
  {
    labelKey: 'groupStudio',
    items: [
      { href: '/dashboard', key: 'home' },
      { href: '/dashboard/studio', key: 'editor' },
      { href: '/dashboard/script-generator', key: 'scripts' }
    ]
  },
  {
    labelKey: 'groupContent',
    items: [
      { href: '/dashboard/history', key: 'history' },
      { href: '/dashboard/clips', key: 'clips' },
      { href: '/dashboard/calendar', key: 'calendar' },
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
  pathname = pathname.split('?')[0] ?? pathname
  if (href === '/dashboard') return pathname === href
  if (href === '/dashboard/history' && pathname.startsWith('/dashboard/jobs/'))
    return true
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function dashboardRouteLabel(pathname: string) {
  if (isDashboardRouteActive(pathname, '/dashboard/create')) return 'create'
  if (isDashboardRouteActive(pathname, '/dashboard/script-generator'))
    return 'scripts'
  return (
    dashboardNavigation
      .flatMap((group) => [...group.items])
      .find((item) => isDashboardRouteActive(pathname, item.href))?.key ??
    'home'
  )
}
