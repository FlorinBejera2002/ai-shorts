import { localePath, type Locale } from './i18n'

/** Routes owned by the Sneep Cut web app (served by the SPA, not this site). */
export function appLinks(locale: Locale) {
  return {
    login: localePath(locale, '/login'),
    register: localePath(locale, '/register'),
    create: localePath(locale, '/dashboard/create')
  }
}
