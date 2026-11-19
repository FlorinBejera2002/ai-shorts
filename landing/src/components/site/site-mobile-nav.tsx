import { getCopy } from '@/content/copy'
import { appLinks } from '@/lib/app-links'
import type { Locale } from '@/lib/i18n'
import { siteNavigation } from '@/lib/sections'
import { MobileNav } from './mobile-nav'

type SiteMobileNavProps = { locale: Locale; path: string }

export function SiteMobileNav({ locale, path }: SiteMobileNavProps) {
  const { nav } = getCopy(locale)
  const links = siteNavigation(locale)
  const app = appLinks(locale)

  return (
    <MobileNav
      locale={locale}
      path={path}
      tabs={[
        { href: links.home, label: nav.homeTab, icon: 'home', current: path === '/' },
        { href: links.features, label: nav.features, icon: 'sparkle', current: false },
        { href: links.pricing, label: nav.pricing, icon: 'tag', current: path === '/pricing' }
      ]}
      sheetLinks={[
        { href: links.howItWorks, label: nav.howItWorks },
        { href: app.login, label: nav.signIn }
      ]}
      cta={{ href: app.register, label: nav.startFree }}
      labels={{
        navigation: nav.mobileNavigation,
        more: nav.more,
        close: nav.close,
        theme: nav.theme,
        themeLight: nav.themeLight,
        themeDark: nav.themeDark,
        language: nav.language,
        languageCurrent: nav.languageCurrent
      }}
    />
  )
}
