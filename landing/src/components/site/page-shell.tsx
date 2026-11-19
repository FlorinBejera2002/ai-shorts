import type { ReactNode } from 'react'
import type { Locale } from '@/lib/i18n'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'
import { SiteMobileNav } from './site-mobile-nav'

type PageShellProps = {
  locale: Locale
  /** Locale-neutral path of the page, used by the language switcher. */
  path: string
  children: ReactNode
}

export function PageShell({ locale, path, children }: PageShellProps) {
  return (
    <>
      <SiteHeader locale={locale} path={path} />
      <main id="main">{children}</main>
      <SiteFooter locale={locale} path={path} />
      <SiteMobileNav locale={locale} path={path} />
    </>
  )
}
