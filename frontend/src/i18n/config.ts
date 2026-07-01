export const locales = ['en', 'ro'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'
