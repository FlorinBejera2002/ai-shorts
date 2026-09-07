'use client'
import { ApiState } from '@/components/shared/api-state'
import { authClient } from '@/lib/auth'
import { useLocale } from 'next-intl'
import { usePathname } from 'next/navigation'
import { useEffect, useSyncExternalStore } from 'react'
export function useAuth() {
  return useSyncExternalStore(
    authClient.subscribe,
    authClient.getSnapshot,
    authClient.getServerSnapshot
  )
}
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const session = useAuth()
  const locale = useLocale()
  const pathname = usePathname()
  useEffect(() => {
    if (authClient.getSnapshot().status === 'loading')
      void authClient.refresh().catch(() => undefined)
  }, [])
  useEffect(() => {
    if (session.status !== 'anonymous') return
    const prefix = locale === 'en' ? '' : `/${locale}`
    const callbackUrl = window.location.pathname + window.location.search
    window.location.replace(
      `${prefix}/login?${new URLSearchParams({ callbackUrl })}`
    )
  }, [session.status, locale])
  useEffect(() => {
    if (
      session.user?.deletion_pending &&
      !pathname.endsWith('/dashboard/settings')
    ) {
      window.location.replace(
        `${locale === 'en' ? '' : `/${locale}`}/dashboard/settings`
      )
    }
  }, [session.user?.deletion_pending, pathname, locale])
  if (
    session.status !== 'authenticated' ||
    (session.user?.deletion_pending &&
      !pathname.endsWith('/dashboard/settings'))
  )
    return (
      <ApiState
        error={session.error}
        retry={() =>
          void (
            session.status === 'logout-error'
              ? authClient.logout()
              : authClient.refresh()
          ).catch(() => undefined)
        }
      />
    )
  return children
}
