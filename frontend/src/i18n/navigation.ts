import { useLocale } from 'next-intl'
import { useLocation, useNavigate } from 'react-router-dom'
import { queryClient } from '../query/query-client'

export { Link } from './navigation-link'

const supportedLocales = ['en', 'ro'] as const

function stripLocale(pathname: string) {
  const match = pathname.match(/^\/(en|ro)(?=\/|$)/)
  const stripped = match ? pathname.slice(match[0].length) : pathname
  return stripped.startsWith('/') ? stripped || '/' : `/${stripped}`
}

export function localizeHref(href: string, locale: string) {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(href)) return href
  const url = new URL(href, 'https://sneepcut.local')
  const pathname = stripLocale(url.pathname)
  const localized =
    locale === 'ro' ? `/ro${pathname === '/' ? '' : pathname}` : pathname
  return `${localized}${url.search}${url.hash}`
}

export function usePathname() {
  return stripLocale(useLocation().pathname)
}

export function useRouter() {
  const locale = useLocale()
  const navigate = useNavigate()
  return {
    push(href: string) {
      void navigate(localizeHref(href, locale))
    },
    replace(href: string, options?: { locale?: string; scroll?: boolean }) {
      void navigate(localizeHref(href, options?.locale ?? locale), {
        replace: true
      })
    },
    refresh() {
      void queryClient.invalidateQueries()
    },
    back() {
      void navigate(-1)
    },
    prefetch() {
      return Promise.resolve()
    }
  }
}

export function getPathname({
  href,
  locale = 'en'
}: {
  href: string
  locale?: string
}) {
  return localizeHref(href, locale)
}

export function redirect({
  href,
  locale = 'en'
}: {
  href: string
  locale?: string
}): never {
  window.location.replace(localizeHref(href, locale))
  throw new Error('Redirecting')
}

export const routing = {
  locales: supportedLocales,
  defaultLocale: 'en' as const,
  localePrefix: 'as-needed' as const
}
