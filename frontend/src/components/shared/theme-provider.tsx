'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode
} from 'react'
import { ThemeContext, type ResolvedTheme, type Theme } from './theme-context'
import { THEME_STORAGE_KEY, readStoredTheme } from './theme-storage'

const SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)'

function readSystemTheme(): ResolvedTheme {
  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? 'dark' : 'light'
}

function subscribeToSystemTheme(onChange: () => void) {
  const media = window.matchMedia(SYSTEM_THEME_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>(() => readStoredTheme())
  const systemTheme = useSyncExternalStore(
    subscribeToSystemTheme,
    readSystemTheme,
    () => 'light' as const
  )
  const resolvedTheme = theme === 'system' ? systemTheme : theme

  const setTheme = useCallback((nextTheme: Theme) => {
    updateTheme(nextTheme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch {
      // Keep the in-memory selection even if persistence is unavailable.
    }
  }, [])

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === THEME_STORAGE_KEY || event.key === null) {
        updateTheme(readStoredTheme())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useLayoutEffect(() => {
    // Apply the theme before paint in this client-rendered app. A React-rendered
    // bootstrap script would be inert and emit a development warning.
    const transitions = document.createElement('style')
    transitions.textContent = '*,*::before,*::after{transition:none!important}'
    document.head.append(transitions)
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(resolvedTheme)
    document.documentElement.style.colorScheme = resolvedTheme
    void window.getComputedStyle(document.body).opacity
    const timeout = window.setTimeout(() => transitions.remove(), 1)
    return () => {
      window.clearTimeout(timeout)
      transitions.remove()
    }
  }, [resolvedTheme])

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
