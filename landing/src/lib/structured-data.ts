import type { Faq, SiteCopy } from '@/content/copy/types'
import { LEGAL_OPERATOR } from '@/content/legal/legal-content'
import { languageTags, localePath, type Locale } from './i18n'
import { PAID_PLAN_IDS, priceValue, type PlanCatalog } from './plan-catalog'
import { absoluteUrl, SITE_NAME } from './site'

type JsonLd = Record<string, unknown>

const organizationId = () => absoluteUrl('/#organization')

export function organizationJsonLd(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': organizationId(),
    name: SITE_NAME,
    legalName: LEGAL_OPERATOR.legalName,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/landing/brand/logo-512.png'),
    email: LEGAL_OPERATOR.privacyEmail,
    telephone: LEGAL_OPERATOR.phone,
    taxID: LEGAL_OPERATOR.taxId,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Str. Parcului nr. 25, camera 2, bl. A, et. II, ap. 9',
      addressLocality: 'Giroc',
      addressRegion: 'Timiș',
      addressCountry: 'RO'
    }
  }
}

export function websiteJsonLd(locale: Locale): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: absoluteUrl(localePath(locale, '/')),
    inLanguage: languageTags[locale],
    publisher: { '@id': organizationId() }
  }
}

export function softwareApplicationJsonLd(
  locale: Locale,
  copy: SiteCopy,
  catalog: PlanCatalog | null
): JsonLd {
  const currency = catalog?.creator?.currency ?? catalog?.pro?.currency ?? catalog?.agency?.currency
  const offers: JsonLd[] = []
  if (currency) offers.push({ '@type': 'Offer', name: copy.pricing.plans.free.name, price: '0', priceCurrency: currency })
  for (const plan of PAID_PLAN_IDS) {
    const price = catalog?.[plan]
    if (!price) continue
    offers.push({
      '@type': 'Offer',
      name: copy.pricing.plans[plan].name,
      price: priceValue(price),
      priceCurrency: price.currency,
      url: absoluteUrl(localePath(locale, '/pricing')),
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: priceValue(price),
        priceCurrency: price.currency,
        billingDuration: 'P1M',
        unitText: 'MONTH'
      }
    })
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    url: absoluteUrl(localePath(locale, '/')),
    description: copy.meta.homeDescription,
    inLanguage: languageTags[locale],
    image: absoluteUrl('/landing/brand/og.png'),
    publisher: { '@id': organizationId() },
    ...(offers.length > 0 ? { offers } : {})
  }
}

export function faqJsonLd(faqs: Faq[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer }
    }))
  }
}

export function breadcrumbJsonLd(locale: Locale, homeLabel: string, page: { name: string; path: string }): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: homeLabel, item: absoluteUrl(localePath(locale, '/')) },
      { '@type': 'ListItem', position: 2, name: page.name, item: absoluteUrl(localePath(locale, page.path)) }
    ]
  }
}
