import type { Theme } from './theme-context'

export const THEME_STORAGE_KEY = 'theme'

export function parseTheme(value: unknown): Theme | null {
  return value === 'light' || value === 'dark' || value === 'system' ? value : null
}

/** The theme saved in this browser; "system" when none is saved or storage is blocked. */
export function readStoredTheme(storage?: Pick<Storage, 'getItem'>): Theme {
  try {
    return parseTheme((storage ?? globalThis.localStorage).getItem(THEME_STORAGE_KEY)) ?? 'system'
  } catch {
    // Themes still work when browser privacy settings disable local storage.
    return 'system'
  }
}
