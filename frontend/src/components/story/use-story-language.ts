import { useLocale } from 'next-intl'
import { useCallback } from 'react'

export function useStoryLanguage() {
  const locale = useLocale()
  return useCallback(
    (english: string, romanian: string) => (locale === 'ro' ? romanian : english),
    [locale]
  )
}
