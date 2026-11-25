import type { Faq } from '@/content/copy/types'

export const FEATURE_PAGE_IDS = [
  'ai-video-clipper',
  'long-video-to-shorts',
  'auto-captions',
  'youtube-to-shorts',
  'schedule-social-posts'
] as const

export type FeaturePageId = (typeof FEATURE_PAGE_IDS)[number]

export type FeatureHighlight = { title: string; text: string }
export type FeatureSection = { title: string; paragraphs: string[] }

/** Copy of one search-focused product page; every page has its own text, not a keyword swap. */
export type FeaturePageCopy = {
  /** Short label for footer and related-page links. */
  navLabel: string
  metaTitle: string
  metaDescription: string
  eyebrow: string
  title: string
  lead: string
  imageAlt: string
  highlights: FeatureHighlight[]
  sections: FeatureSection[]
  faqs: Faq[]
}

export type FeaturePagesCopy = {
  footerTitle: string
  highlightsLabel: string
  relatedTitle: string
  faqTitle: string
  pages: Record<FeaturePageId, FeaturePageCopy>
}
