import type { Locale } from '@/lib/i18n'
import { en } from './en'
import { es } from './es'
import { ro } from './ro'
import { ALTERNATIVE_PAGE_IDS, FEATURE_PAGE_IDS, TOOL_PAGE_IDS, USE_CASE_PAGE_IDS, type FeaturePageId, type FeaturePagesCopy } from './types'

const dictionaries: Record<Locale, FeaturePagesCopy> = { en, ro, es }

type FeatureImage = { src: string; width: number; height: number }

/** Illustration shown next to each page title, at its rendered size. */
export const FEATURE_IMAGES: Record<FeaturePageId, FeatureImage> = {
  'ai-video-clipper': { src: '/landing/illustrations/hero-600.webp', width: 360, height: 360 },
  'long-video-to-shorts': { src: '/landing/illustrations/step-clips.webp', width: 320, height: 320 },
  'auto-captions': { src: '/landing/illustrations/clip-frame.webp', width: 220, height: 391 },
  'youtube-to-shorts': { src: '/landing/illustrations/step-upload.webp', width: 320, height: 320 },
  'schedule-social-posts': { src: '/landing/illustrations/publish.webp', width: 320, height: 320 },
  'for/podcasters': { src: '/landing/illustrations/step-clips.webp', width: 320, height: 320 },
  'for/creators': { src: '/landing/illustrations/hero-600.webp', width: 360, height: 360 },
  'for/agencies': { src: '/landing/illustrations/step-publish.webp', width: 320, height: 320 },
  'for/churches-and-speakers': { src: '/landing/illustrations/publish.webp', width: 320, height: 320 },
  'alternatives/opus-clip': { src: '/landing/illustrations/hero-600.webp', width: 360, height: 360 },
  'alternatives/vizard': { src: '/landing/illustrations/step-clips.webp', width: 320, height: 320 },
  'alternatives/klap': { src: '/landing/illustrations/step-publish.webp', width: 320, height: 320 }
}

export function getFeatureCopy(locale: Locale): FeaturePagesCopy {
  return dictionaries[locale]
}

export function featurePath(id: FeaturePageId): string {
  return `/${id}`
}

export { esAlternatives } from './es-alternatives'
export { esUseCases } from './es-use-cases'
export { ALTERNATIVE_PAGE_IDS, FEATURE_PAGE_IDS, TOOL_PAGE_IDS, USE_CASE_PAGE_IDS }
export type * from './types'
