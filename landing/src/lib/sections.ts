import { localePath, type Locale } from './i18n'

/** Home-page anchors; Romanian keeps the canvas ids. */
export function homeSectionIds(locale: Locale) {
  return locale === 'ro'
    ? { features: 'functii', howItWorks: 'cum' }
    : { features: 'features', howItWorks: 'how-it-works' }
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
