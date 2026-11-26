import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { apiResourceQuery, useApiResource } from '@/hooks/use-api-resource'
import type { SettingsData } from '@/lib/settings'
import { useTheme, type Theme } from './theme-context'
import { parseTheme } from './theme-storage'

const SETTINGS_PATH = '/api/user/settings'

function themeOf(data: SettingsData | null | undefined): Theme | null {
  return parseTheme(data?.preferences?.theme)
}

/**
 * Applies the theme saved on the account (Settings > Preferences), so another browser or
 * device opens with it. It runs only when the saved value changes, so it never fights a choice
 * that is still an unsaved draft.
 */
export function useAccountThemeSync() {
  const { data } = useApiResource<SettingsData>(SETTINGS_PATH)
  const accountTheme = themeOf(data)
  const { setTheme } = useTheme()
  useEffect(() => {
    if (accountTheme) setTheme(accountTheme)
  }, [accountTheme, setTheme])
}

/** The account theme from the shared settings cache, or null when it cannot be loaded in time. */
export async function loadAccountTheme(queryClient: QueryClient, timeoutMs = 4000): Promise<Theme | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })
  try {
    const data = await Promise.race([
      queryClient.fetchQuery(apiResourceQuery<SettingsData>(SETTINGS_PATH)),
      timeout
    ])
    return themeOf(data)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Resolves the theme Studio should open with: the account's, else this browser's. */
export function useStudioLaunchTheme() {
  const queryClient = useQueryClient()
  const { setTheme } = useTheme()
  return useCallback(async (): Promise<Theme | null> => {
    const theme = await loadAccountTheme(queryClient)
    if (theme) setTheme(theme)
    return theme
  }, [queryClient, setTheme])
}
