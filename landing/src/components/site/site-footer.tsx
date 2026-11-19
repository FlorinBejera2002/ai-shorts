import { getCopy } from '@/content/copy'
import { LEGAL_DOCUMENT_IDS } from '@/content/legal/documents'
import { appLinks } from '@/lib/app-links'
import { localePath, type Locale } from '@/lib/i18n'
import { siteNavigation } from '@/lib/sections'
import { BrandLogo } from './brand-logo'
import { LanguageMenu } from './language-menu'
import styles from './site.module.css'

type FooterLink = { href: string; label: string }

function FooterColumn({ title, columns }: { title: string; columns: FooterLink[][] }) {
  return (
    <div className={styles.footerGroup}>
      <h2 className={styles.footerTitle}>{title}</h2>
      <div className={styles.footerColumns}>
        {columns.map((links) => (
          <ul key={links[0]?.href} className={styles.footerLinks}>
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="muted">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  )
}

type SiteFooterProps = { locale: Locale; path: string }

export function SiteFooter({ locale, path }: SiteFooterProps) {
  const { nav, footer } = getCopy(locale)
  const links = siteNavigation(locale)
  const app = appLinks(locale)
  const legal = LEGAL_DOCUMENT_IDS.map((id) => ({ href: localePath(locale, `/${id}`), label: footer.legalLinks[id] }))

  return (
    <footer className={styles.footer}>
      <div className="container">
        <div className={styles.footerMain}>
          <a href={links.home} className={styles.footerLogo} aria-label={nav.home}>
            <BrandLogo height={28} alt="" />
          </a>
          <div className={styles.footerGrid}>
            <FooterColumn
              title={footer.product}
              columns={[[
                { href: links.features, label: nav.features },
                { href: links.howItWorks, label: nav.howItWorks },
                { href: links.pricing, label: nav.pricing }
              ]]}
            />
            <FooterColumn
              title={footer.account}
              columns={[[
                { href: app.login, label: nav.signIn },
                { href: app.register, label: footer.createAccount }
              ]]}
            />
            <div className={styles.footerLegal}>
              <FooterColumn title={footer.legal} columns={[legal.slice(0, 5), legal.slice(5)]} />
            </div>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span className="muted">© {new Date().getFullYear()} Sneep Cut</span>
          <LanguageMenu locale={locale} path={path} label={nav.languageCurrent} placement="above" />
        </div>
      </div>
    </footer>
  )
}
