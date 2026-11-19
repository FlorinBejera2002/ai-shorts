'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Icon, type IconName } from '@/components/ui/icons'
import type { Locale } from '@/lib/i18n'
import { LanguageMenu } from './language-menu'
import { ThemeToggle } from './theme-toggle'
import styles from './mobile-nav.module.css'

type NavLink = { href: string; label: string }
type NavTab = NavLink & { icon: IconName; current: boolean }

type NavBarProps = {
  label: string
  tabs: NavTab[]
  moreLabel: string
  sheetId: string
  open: boolean
  onMore: () => void
}

function NavBar({ label, tabs, moreLabel, sheetId, open, onMore }: NavBarProps) {
  return (
    <nav aria-label={label} className={styles.bar}>
      {tabs.map((tab) => (
        <a key={tab.href} href={tab.href} className={styles.tab} aria-current={tab.current && !open ? 'page' : undefined}>
          <Icon name={tab.icon} size={19} />
          {tab.label}
        </a>
      ))}
      <button type="button" className={styles.tab} aria-expanded={open} aria-controls={sheetId} onClick={onMore}>
        <Icon name="menu" size={19} />
        {moreLabel}
      </button>
    </nav>
  )
}

type MobileNavProps = {
  locale: Locale
  /** Locale-neutral path of the page, used by the language switcher. */
  path: string
  tabs: NavTab[]
  sheetLinks: NavLink[]
  cta: NavLink
  labels: {
    navigation: string
    more: string
    close: string
    theme: string
    themeLight: string
    themeDark: string
    language: string
    languageCurrent: string
  }
}

/**
 * Floating bottom navigation for phones and tablets. "More" opens a native modal
 * dialog (focus containment, Escape, backdrop); the dialog repeats the bar so it
 * stays visible above the sheet, as on the canvas.
 */
export function MobileNav({ locale, path, tabs, sheetLinks, cta, labels }: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const sheetId = useId()

  useEffect(() => {
    if (!open) return
    const desktop = window.matchMedia('(min-width: 1080px)')
    const onViewportChange = () => desktop.matches && dialogRef.current?.close()
    document.documentElement.classList.add(styles.scrollLocked)
    desktop.addEventListener('change', onViewportChange)
    return () => {
      document.documentElement.classList.remove(styles.scrollLocked)
      desktop.removeEventListener('change', onViewportChange)
    }
  }, [open])

  function toggle() {
    const dialog = dialogRef.current
    if (!dialog) return
    if (dialog.open) {
      dialog.close()
      return
    }
    dialog.showModal()
    setOpen(true)
  }

  const close = () => dialogRef.current?.close()

  const bar = { label: labels.navigation, tabs, moreLabel: labels.more, sheetId, open, onMore: toggle }

  return (
    <div className={styles.root}>
      <NavBar {...bar} />
      <dialog
        ref={dialogRef}
        aria-label={labels.more}
        className={styles.dialog}
        onClose={() => setOpen(false)}
      >
        <div id={sheetId} className={styles.sheet}>
          <span aria-hidden="true" className={styles.grabber} />
          {sheetLinks.map((link) => (
            <a key={link.href} href={link.href} className={styles.sheetLink} onClick={close}>
              {link.label}
              <Icon name="chevronRight" />
            </a>
          ))}
          <div className={styles.sheetRow}>
            <span>{labels.theme}</span>
            <ThemeToggle large labels={{ group: labels.theme, light: labels.themeLight, dark: labels.themeDark }} />
          </div>
          <div className={`${styles.sheetRow} ${styles.sheetRowLast}`}>
            <span>{labels.language}</span>
            <LanguageMenu locale={locale} path={path} label={labels.languageCurrent} placement="above" />
          </div>
          <a href={cta.href} className={`btn btn-primary ${styles.sheetCta}`}>
            {cta.label}
          </a>
        </div>
        <NavBar {...bar} />
        {/* Tapping outside the sheet closes it; keyboard users have Escape. Last in the DOM so focus starts in the sheet. */}
        <button type="button" tabIndex={-1} aria-label={labels.close} className={styles.dismiss} onClick={close} />
      </dialog>
    </div>
  )
}
