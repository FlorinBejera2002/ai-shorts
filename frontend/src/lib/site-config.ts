
export const SITE_NAME = 'Sneep Cut'
export const DEFAULT_LOCALE = 'en'
export const SUPPORTED_LOCALES = ['en', 'ro', 'es'] as const
export const PUBLIC_ROUTES = [
  '',
  '/pricing',
  '/privacy',
  '/terms',
  '/data-deletion',
  '/legal-notice',
  '/cookie-policy',
  '/acceptable-use',
  '/refund-policy',
  '/subprocessors',
  '/dpa'
] as const
export const PRIVATE_ROUTES = [
  '/api/',
  '/v1/',
  '/activate',
  '/ro/activate',
  '/dashboard',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/ro/dashboard',
  '/ro/login',
  '/ro/register',
  '/ro/forgot-password',
  '/ro/reset-password',
  '/es/activate',
  '/es/dashboard',
  '/es/login',
  '/es/register',
  '/es/forgot-password',
  '/es/reset-password'
] as const

export type SiteLocale = (typeof SUPPORTED_LOCALES)[number]

/** Maps an untrusted locale segment (URL or API value) to a supported site locale. */
export function resolveSiteLocale(value: string | undefined | null): SiteLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value ?? '')
    ? (value as SiteLocale)
    : DEFAULT_LOCALE
}

const LOCALE_CONFIG = {
  en: {
    languageTag: 'en-US',
    openGraphLocale: 'en_US',
    title: 'Sneep Cut — AI video clipping',
    description:
      'Turn long videos into ready-to-publish short clips with AI-assisted highlights, reframing, and captions.'
  },
  ro: {
    languageTag: 'ro-RO',
    openGraphLocale: 'ro_RO',
    title: 'Sneep Cut — clipuri video cu AI',
    description:
      'Transformă videoclipurile lungi în clipuri scurte gata de publicare, cu selecție asistată de AI, reîncadrare și subtitrări.'
  },
  es: {
    languageTag: 'es-ES',
    openGraphLocale: 'es_ES',
    title: 'Sneep Cut — clips de video con IA',
    description:
      'Convierte videos largos en clips cortos listos para publicar, con momentos destacados asistidos por IA, reencuadre y subtítulos.'
  }
} as const

function normalizeOrigin(value: string | undefined): URL | null {
  if (!value) return null

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.pathname = '/'
    url.search = ''
    url.hash = ''
    return url
  } catch {
    return null
  }
}

export function getSiteUrl(): URL {
  return (
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ??
    normalizeOrigin(process.env.APP_URL) ??
    new URL('http://localhost:3000')
  )
}

export function isPublicProductionOrigin(url = getSiteUrl()): boolean {
  return (
    url.protocol === 'https:' &&
    !['localhost', '127.0.0.1'].includes(url.hostname)
  )
}

export function localePath(locale: SiteLocale, path = ''): string {
  const normalizedPath =
    path === '/' ? '' : `/${path.replace(/^\/+|\/+$/g, '')}`
  return locale === DEFAULT_LOCALE
    ? normalizedPath || '/'
    : `/${locale}${normalizedPath}`
}

export function localizedUrls(path = '', siteUrl = getSiteUrl()) {
  return {
    en: new URL(localePath('en', path), siteUrl).toString(),
    ro: new URL(localePath('ro', path), siteUrl).toString(),
    es: new URL(localePath('es', path), siteUrl).toString(),
    'x-default': new URL(localePath('en', path), siteUrl).toString()
  }
}

export function getContactEmail(): string | null {
  const value = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim()
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null
  return value
}

type PageMetadata = {
  title?: string
  description?: string
  path?: string
  image?: string
}

export function buildLocaleMetadata(
  locale: SiteLocale,
  page: PageMetadata = {}
) {
  const config = LOCALE_CONFIG[locale]
  const siteUrl = getSiteUrl()
  const path = page.path ?? ''
  const canonical = new URL(localePath(locale, path), siteUrl).toString()
  const title = page.title ?? config.title
  const description = page.description ?? config.description
  const image = page.image ?? '/sneepcut-og.png'
  const alternateLocale = SUPPORTED_LOCALES.filter((candidate) => candidate !== locale).map(
    (candidate) => LOCALE_CONFIG[candidate].openGraphLocale
  )

  return {
    metadataBase: siteUrl,
    applicationName: SITE_NAME,
    title,
    description,
    alternates: {
      canonical,
      languages: localizedUrls(path, siteUrl)
    },
    robots: {
      index: isPublicProductionOrigin(siteUrl),
      follow: isPublicProductionOrigin(siteUrl),
      googleBot: {
        index: isPublicProductionOrigin(siteUrl),
        follow: isPublicProductionOrigin(siteUrl),
        'max-image-preview': 'large'
      }
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      type: 'website',
      locale: config.openGraphLocale,
      alternateLocale,
      images: [{ url: image, width: 1200, height: 630, alt: title }]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image]
    }
  }
}

export function getLocaleConfig(locale: SiteLocale) {
  return LOCALE_CONFIG[locale]
}

export function buildSitemapEntries(siteUrl = getSiteUrl()) {
  return PUBLIC_ROUTES.flatMap((route) =>
    SUPPORTED_LOCALES.map((locale) => ({
      url: new URL(localePath(locale, route), siteUrl).toString(),
      alternates: { languages: localizedUrls(route, siteUrl) }
    }))
  )
}

export function buildRobotsPolicy(siteUrl = getSiteUrl()) {
  const production = isPublicProductionOrigin(siteUrl)
  return {
    rules: production
      ? { userAgent: '*', allow: '/', disallow: [...PRIVATE_ROUTES] }
      : { userAgent: '*', disallow: '/' },
    sitemap: new URL('/sitemap.xml', siteUrl).toString(),
    host: siteUrl.origin
  }
}

const FEATURE_LIST: Record<SiteLocale, string[]> = {
  en: [
    'AI-assisted video highlight selection',
    'Vertical video reframing',
    'Caption generation',
    'Clip review and export workflow'
  ],
  ro: [
    'Selecția momentelor video asistată de AI',
    'Reîncadrare pentru video vertical',
    'Generare de subtitrări',
    'Flux de verificare și export al clipurilor'
  ],
  es: [
    'Selección de momentos destacados de video asistida por IA',
    'Reencuadre de video vertical',
    'Generación de subtítulos',
    'Flujo de revisión y exportación de clips'
  ]
}

export function buildSoftwareApplicationJsonLd(locale: SiteLocale) {
  const config = getLocaleConfig(locale)
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    url: new URL(localePath(locale), getSiteUrl()).toString(),
    description: config.description,
    inLanguage: config.languageTag,
    featureList: FEATURE_LIST[locale]
  }
}
