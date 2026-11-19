'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { languageNames, localePath, locales, type Locale } from '@/lib/i18n'
import styles from './site.module.css'

type LanguageMenuProps = {
  locale: Locale
  /** Locale-neutral path of the current page, used to link to its translation. */
  path: string
  label: string
  placement?: 'below' | 'above'
}

export function LanguageMenu({ locale, path, label, placement = 'below' }: LanguageMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      rootRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={styles.languageMenu}>
      <button
        type="button"
        className={styles.languageButton}
        aria-label={label}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        {locale.toUpperCase()}
        <Icon name="chevronDown" size={14} />
      </button>
      <ul id={menuId} hidden={!open} className={`${styles.languageList} ${placement === 'above' ? styles.languageListAbove : ''}`}>
        {locales.map((option) => (
          <li key={option}>
            <a
              href={localePath(option, path)}
              hrefLang={option}
              lang={option}
              aria-current={option === locale ? 'true' : undefined}
              className={styles.languageOption}
            >
              {languageNames[option]}
              {option === locale && <Icon name="check" size={14} />}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
