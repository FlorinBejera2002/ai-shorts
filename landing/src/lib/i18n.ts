export const locales = ['en', 'ro', 'es'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

export const languageTags: Record<Locale, string> = { en: 'en-US', ro: 'ro-RO', es: 'es-ES' }
export const openGraphLocales: Record<Locale, string> = { en: 'en_US', ro: 'ro_RO', es: 'es_ES' }
export const languageNames: Record<Locale, string> = { en: 'English', ro: 'Română', es: 'Español' }

/** Path of a public page in the given locale: English has no prefix, the others live under /ro and /es. */
export function localePath(locale: Locale, path = '/'): string {
  const normalized = path === '/' ? '' : `/${path.replace(/^\/+|\/+$/g, '')}`
  if (locale === defaultLocale) return normalized || '/'
  return `/${locale}${normalized}`
}

/** Every locale except the given one, e.g. for og:locale:alternate. */
export function alternateLocales(locale: Locale): Locale[] {
  return locales.filter((option) => option !== locale)
}
