import type { PaidPlanId } from '@/lib/plan-catalog'

export type PlanId = 'free' | PaidPlanId
export type LegalDocumentId =
  | 'legal-notice'
  | 'privacy'
  | 'terms'
  | 'cookie-policy'
  | 'acceptable-use'
  | 'refund-policy'
  | 'subprocessors'
  | 'dpa'
  | 'data-deletion'

export type Faq = { question: string; answer: string }
export type FeatureRow = { title: string; meta?: string; platform?: PlatformId }
export type PlatformId = 'instagram' | 'facebook' | 'tiktok' | 'youtube'
export type FeaturePanel = {
  tab: string
  heading: string
  badge?: string
  caption: [string, string]
  rows: FeatureRow[]
}

export type SiteCopy = {
  meta: {
    homeTitle: string
    homeDescription: string
    pricingTitle: string
    pricingDescription: string
    notFoundTitle: string
  }
  nav: {
    main: string
    features: string
    howItWorks: string
    pricing: string
    signIn: string
    startFree: string
    home: string
    theme: string
    themeLight: string
    themeDark: string
    language: string
    languageCurrent: string
    mobileNavigation: string
    homeTab: string
    more: string
    close: string
    skipToContent: string
  }
  footer: {
    product: string
    account: string
    createAccount: string
    legal: string
    legalLinks: Record<LegalDocumentId, string>
  }
  home: {
    heroLines: [string, string]
    heroSticker: [string, string]
    heroPrimary: string
    heroSecondary: string
    heroAlt: string
    publishOn: string
    platformNames: Record<PlatformId, string>
    howEyebrow: string
    howTitle: string
    steps: { title: string; text: string; alt: string }[]
    featuresTitle: string
    featuresLabel: string
    clipDuration: string
    sourceSummary: [string, string]
    featurePanels: FeaturePanel[]
    publishAlt: string
    publishTitle: string
    weekTitle: string
    weekRange: string
    scheduled: string
    scheduledPosts: { platform: PlatformId; title: string; time: string }[]
    pricingEyebrow: string
    pricingTitle: string
    allPlans: string
    faqTitle: string
    faqs: Faq[]
    ctaAlt: string
    ctaTitle: string
    ctaButton: string
  }
  pricing: {
    title: string
    subtitle: string
    mostPopular: string
    free: string
    perMonth: string
    unavailable: string
    plans: Record<PlanId, { name: string; tagline: string; cta: string; features: string[] }>
    faqTitle: string
    faqs: Faq[]
  }
  legal: {
    contents: string
    contentsToggle: string
  }
  notFound: {
    code: string
    title: string
    text: string
    home: string
    pricing: string
    alt: string
  }
}
