'use client'
import { SocialConnectionReturnContext } from '@/components/publishing/social-connection-return-context'
import { ApiState } from '@/components/shared/api-state'
import { authClient } from '@/lib/auth'
import { useLocale } from 'next-intl'
import { usePathname, useSearchParams } from 'next/navigation'
import { useContext, useEffect } from 'react'
import { useAuth } from './use-auth'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const session = useAuth()
  const { returning } = useContext(SocialConnectionReturnContext)
  const locale = useLocale()
  const pathname = usePathname()
  const search = useSearchParams()
  const restricted =
    session.user?.deletion_pending &&
    (!pathname.endsWith('/dashboard/settings') ||
      ['brand', 'billing'].includes(search.get('tab') ?? ''))
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
    if (restricted) {
      window.location.replace(
        `${locale === 'en' ? '' : `/${locale}`}/dashboard/settings`
      )
    }
  }, [restricted, locale])
  if (session.status === 'loading' && returning) return null
  if (session.status !== 'authenticated' || restricted)
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
