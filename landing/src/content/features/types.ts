import type { Faq } from '@/content/copy/types'

/** Pages about what the product does. */
export const TOOL_PAGE_IDS = [
  'ai-video-clipper',
  'long-video-to-shorts',
  'auto-captions',
  'youtube-to-shorts',
  'schedule-social-posts'
] as const

/** Pages about who the product is for, served under /for/. */
export const USE_CASE_PAGE_IDS = [
  'for/podcasters',
  'for/creators',
  'for/agencies',
  'for/churches-and-speakers'
] as const

export const FEATURE_PAGE_IDS = [...TOOL_PAGE_IDS, ...USE_CASE_PAGE_IDS] as const

export type ToolPageId = (typeof TOOL_PAGE_IDS)[number]
export type UseCasePageId = (typeof USE_CASE_PAGE_IDS)[number]
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
  useCasesTitle: string
  highlightsLabel: string
  relatedTitle: string
  faqTitle: string
  pages: Record<FeaturePageId, FeaturePageCopy>
}
