import { localePath, type Locale } from './i18n'

const HOME_SECTION_IDS: Record<Locale, { features: string; howItWorks: string }> = {
  en: { features: 'features', howItWorks: 'how-it-works' },
  ro: { features: 'functii', howItWorks: 'cum' },
  es: { features: 'funciones', howItWorks: 'como-funciona' }
}

/** Home-page anchors; Romanian keeps the canvas ids. */
export function homeSectionIds(locale: Locale) {
  return HOME_SECTION_IDS[locale]
}

export function siteNavigation(locale: Locale) {
  const home = localePath(locale, '/')
  const ids = homeSectionIds(locale)
  return {
    home,
    features: `${home}#${ids.features}`,
    howItWorks: `${home}#${ids.howItWorks}`,
    pricing: localePath(locale, '/pricing')
  }
}
