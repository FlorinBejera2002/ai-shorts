'use client'

import { useEffect, useId, useState } from 'react'
import { Icon } from '@/components/ui/icons'
import type { Locale } from '@/lib/i18n'
import { LanguageMenu } from './language-menu'
import { ThemeToggle } from './theme-toggle'
import styles from './site.module.css'

type MenuLink = { href: string; label: string }

type MobileMenuProps = {
  locale: Locale
  path: string
  links: MenuLink[]
  cta: MenuLink
  labels: {
    open: string
    close: string
    theme: string
    themeLight: string
    themeDark: string
    language: string
    languageCurrent: string
  }
}

export function MobileMenu({ locale, path, links, cta, labels }: MobileMenuProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onResize = () => {
      if (window.matchMedia('(min-width: 1080px)').matches) setOpen(false)
    }
    document.documentElement.classList.add(styles.scrollLocked)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.documentElement.classList.remove(styles.scrollLocked)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  return (
    <>
      <button
        type="button"
        className={`btn btn-secondary ${styles.menuButton}`}
        aria-label={open ? labels.close : labels.open}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name={open ? 'close' : 'menu'} size={18} />
      </button>
      <div id={panelId} hidden={!open} className={styles.mobilePanel}>
        <nav aria-label={labels.open}>
          {links.map((link) => (
            <a key={link.href} href={link.href} className={styles.mobileLink} onClick={() => setOpen(false)}>
              {link.label}
              <Icon name="chevronRight" />
            </a>
          ))}
        </nav>
        <div className={styles.mobileRow}>
          <span className="muted">{labels.theme}</span>
          <ThemeToggle large labels={{ group: labels.theme, light: labels.themeLight, dark: labels.themeDark }} />
        </div>
        <div className={`${styles.mobileRow} ${styles.mobileRowLast}`}>
          <span className="muted">{labels.language}</span>
          <LanguageMenu locale={locale} path={path} label={labels.languageCurrent} />
        </div>
        <a href={cta.href} className={`btn btn-primary ${styles.mobileCta}`}>
          {cta.label}
        </a>
      </div>
    </>
  )
}
