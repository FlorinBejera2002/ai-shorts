import { pickInlineText, type InlineText } from '@/i18n/inline-text'
import { useLocale } from 'next-intl'
import { useCallback } from 'react'

export function useStoryLanguage(): InlineText {
  const locale = useLocale()
  return useCallback(
    (english: string, romanian: string, spanish?: string) =>
      pickInlineText(locale, english, romanian, spanish),
    [locale]
  )
}
