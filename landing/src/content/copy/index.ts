import type { Locale } from '@/lib/i18n'
import { en } from './en'
import { es } from './es'
import { ro } from './ro'
import type { SiteCopy } from './types'

const dictionaries: Record<Locale, SiteCopy> = { en, ro, es }

export function getCopy(locale: Locale): SiteCopy {
  return dictionaries[locale]
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match
  )
}

export type * from './types'
