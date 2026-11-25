'use client'

import { useLocale } from 'next-intl'
import { useCallback } from 'react'

/** Picks the English or Romanian copy of an inline string for the current locale. */
export function useCreateText() {
  const locale = useLocale()
  return useCallback(
    (english: string, romanian: string) => (locale === 'ro' ? romanian : english),
    [locale]
  )
}
