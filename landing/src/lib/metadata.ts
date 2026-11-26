import type { Metadata } from 'next'
import { alternateLocales, localePath, locales, openGraphLocales, type Locale } from './i18n'
import { absoluteUrl, isIndexable, SITE_NAME, siteUrl } from './site'

const OG_IMAGE = { url: '/landing/brand/og.png', width: 1200, height: 630 }

type PageMetadataInput = {
  locale: Locale
  /** Locale-neutral path, e.g. "/pricing". */
  path: string
  title: string
  description: string
  noindex?: boolean
}

export function languageAlternates(path: string): Record<string, string> {
  const alternates: Record<string, string> = {}
  for (const locale of locales) alternates[locale] = absoluteUrl(localePath(locale, path))
  alternates['x-default'] = absoluteUrl(localePath('en', path))
  return alternates
}

export function pageMetadata({ locale, path, title, description, noindex }: PageMetadataInput): Metadata {
  const canonical = absoluteUrl(localePath(locale, path))
  const indexable = isIndexable() && !noindex

  return {
    metadataBase: siteUrl(),
    title: { absolute: title },
    description,
    applicationName: SITE_NAME,
    alternates: noindex ? undefined : { canonical, languages: languageAlternates(path) },
    robots: {
      index: indexable,
      follow: indexable,
      googleBot: { index: indexable, follow: indexable, 'max-image-preview': 'large' }
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title,
      description,
      url: canonical,
      locale: openGraphLocales[locale],
      alternateLocale: alternateLocales(locale).map((option) => openGraphLocales[option]),
      images: [{ ...OG_IMAGE, alt: title }]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_IMAGE.url]
    },
    icons: {
      icon: [
        { url: '/landing/brand/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/landing/brand/favicon-16x16.png', sizes: '16x16', type: 'image/png' }
      ],
      shortcut: '/landing/brand/favicon.ico',
      apple: '/landing/brand/apple-touch-icon.png'
    }
  }
}
