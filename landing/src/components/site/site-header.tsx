import { getCopy } from '@/content/copy'
import { appLinks } from '@/lib/app-links'
import type { Locale } from '@/lib/i18n'
import { siteNavigation } from '@/lib/sections'
import { Icon } from '@/components/ui/icons'
import { BrandLogo } from './brand-logo'
import { LanguageMenu } from './language-menu'
import { ThemeToggle } from './theme-toggle'
import styles from './site.module.css'

type SiteHeaderProps = { locale: Locale; path: string }

export function SiteHeader({ locale, path }: SiteHeaderProps) {
  const { nav } = getCopy(locale)
  const links = siteNavigation(locale)
  const app = appLinks(locale)
  const sectionLinks = [
    { href: links.features, label: nav.features },
    { href: links.howItWorks, label: nav.howItWorks },
    { href: links.pricing, label: nav.pricing, current: path === '/pricing' }
  ]

  return (
    <header className={styles.header}>
      <div className={styles.headerBar}>
        <a href={links.home} className={styles.headerLogo} aria-label={nav.home}>
          <BrandLogo height={26} alt="" />
        </a>
        <nav aria-label={nav.main} className={styles.desktopNav}>
          {sectionLinks.map((link) => (
            <a key={link.href} href={link.href} className={styles.navLink} aria-current={link.current ? 'page' : undefined}>
              {link.label}
            </a>
          ))}
        </nav>
        <div className={styles.desktopActions}>
          <ThemeToggle labels={{ group: nav.theme, light: nav.themeLight, dark: nav.themeDark }} />
          <LanguageMenu locale={locale} path={path} label={nav.languageCurrent} />
          <span aria-hidden="true" className={styles.divider} />
          <a href={app.login} className={styles.signIn}>
            {nav.signIn}
          </a>
          <a href={app.register} className={`btn btn-primary ${styles.headerCta}`}>
            {nav.startFree}
            <Icon name="chevronRight" size={15} />
          </a>
        </div>
        <a href={app.login} className={styles.mobileSignIn}>
          {nav.signIn}
        </a>
      </div>
    </header>
  )
}
