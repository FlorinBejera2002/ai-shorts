import type { Metadata } from 'next'
import { getCopy } from '@/content/copy'
import type { LegalDocumentId } from '@/content/copy/types'
import { featurePath, getFeatureCopy, type FeaturePageId } from '@/content/features'
import { getLegalDocument } from '@/content/legal/documents'
import type { Locale } from './i18n'
import { pageMetadata } from './metadata'

export function homeMetadata(locale: Locale): Metadata {
  const { meta } = getCopy(locale)
  return pageMetadata({ locale, path: '/', title: meta.homeTitle, description: meta.homeDescription })
}

export function pricingMetadata(locale: Locale): Metadata {
  const { meta } = getCopy(locale)
  return pageMetadata({ locale, path: '/pricing', title: meta.pricingTitle, description: meta.pricingDescription })
}

export function featureMetadata(locale: Locale, id: FeaturePageId): Metadata {
  const page = getFeatureCopy(locale).pages[id]
  return pageMetadata({ locale, path: featurePath(id), title: page.metaTitle, description: page.metaDescription })
}

function summarize(text: string, limit = 160): string {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit - 1)
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`
}

export function legalMetadata(locale: Locale, id: LegalDocumentId): Metadata {
  const document = getLegalDocument(id, locale)
  return pageMetadata({
    locale,
    path: `/${id}`,
    title: `${document.title} — Sneep Cut`,
    description: summarize(document.intro)
  })
}

export function notFoundMetadata(locale: Locale): Metadata {
  return {
    title: { absolute: getCopy(locale).meta.notFoundTitle },
    robots: { index: false, follow: false }
  }
}
