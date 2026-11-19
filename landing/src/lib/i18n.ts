export const locales = ['en', 'ro'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

export const languageTags: Record<Locale, string> = { en: 'en-US', ro: 'ro-RO' }
export const openGraphLocales: Record<Locale, string> = { en: 'en_US', ro: 'ro_RO' }
export const languageNames: Record<Locale, string> = { en: 'English', ro: 'Română' }

/** Path of a public page in the given locale: English has no prefix, Romanian lives under /ro. */
export function localePath(locale: Locale, path = '/'): string {
  const normalized = path === '/' ? '' : `/${path.replace(/^\/+|\/+$/g, '')}`
  if (locale === defaultLocale) return normalized || '/'
  return `/${locale}${normalized}`
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'en' ? 'ro' : 'en'
}
