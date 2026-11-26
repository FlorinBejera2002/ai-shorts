'use client'

import { pickInlineText, type InlineText } from '@/i18n/inline-text'
import { useLocale } from 'next-intl'
import { useCallback } from 'react'

/** Picks the English, Romanian or Spanish copy of an inline string for the current locale. */
export function useCreateText(): InlineText {
  const locale = useLocale()
  return useCallback(
    (english: string, romanian: string, spanish?: string) =>
      pickInlineText(locale, english, romanian, spanish),
    [locale]
  )
}
