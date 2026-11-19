'use client'

import { useEffect, useSyncExternalStore, type KeyboardEvent } from 'react'
import { Icon } from '@/components/ui/icons'
import { THEME_STORAGE_KEY, type ThemeChoice } from '@/lib/theme'
import styles from './site.module.css'

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

const readTheme = (): ThemeChoice =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light'

function applyTheme(theme: ThemeChoice) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // The theme still applies for this page when storage is unavailable.
  }
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

function useFollowSystemTheme() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const follow = () => {
      try {
        if (localStorage.getItem(THEME_STORAGE_KEY)) return
      } catch {
        // Without storage the system preference is the only signal.
      }
      document.documentElement.classList.toggle('dark', media.matches)
    }
    media.addEventListener('change', follow)
    return () => media.removeEventListener('change', follow)
  }, [])
}

type ThemeToggleProps = {
  labels: { group: string; light: string; dark: string }
  large?: boolean
}

export function ThemeToggle({ labels, large = false }: ThemeToggleProps) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'light' as const)
  useFollowSystemTheme()

  const options: { value: ThemeChoice; label: string; icon: 'sun' | 'moon' }[] = [
    { value: 'light', label: labels.light, icon: 'sun' },
    { value: 'dark', label: labels.dark, icon: 'moon' }
  ]

  function onKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const next = theme === 'light' ? 'dark' : 'light'
    applyTheme(next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-theme-option="${next}"]`)?.focus()
  }

  return (
    <span role="radiogroup" aria-label={labels.group} className={styles.themeGroup} onKeyDown={onKeyDown}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          aria-label={option.label}
          tabIndex={theme === option.value ? 0 : -1}
          data-theme-option={option.value}
          className={`${styles.themeOption} ${large ? styles.themeOptionLarge : ''}`}
          onClick={() => applyTheme(option.value)}
        >
          <Icon name={option.icon} />
        </button>
      ))}
    </span>
  )
}
