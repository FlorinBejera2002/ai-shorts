import { FeatureShowcase } from '@/components/home/feature-showcase'
import { FinalCta } from '@/components/home/final-cta'
import { Hero } from '@/components/home/hero'
import { HowItWorks } from '@/components/home/how-it-works'
import { PlatformStrip } from '@/components/home/platform-strip'
import { PricingTeaser } from '@/components/home/pricing-teaser'
import { PublishSection } from '@/components/home/publish-section'
import { JsonLd } from '@/components/seo/json-ld'
import { FaqSection } from '@/components/shared/faq-section'
import { PageShell } from '@/components/site/page-shell'
import { getCopy } from '@/content/copy'
import { appLinks } from '@/lib/app-links'
import type { Locale } from '@/lib/i18n'
import { loadPlanCatalog } from '@/lib/plan-catalog.server'
import { homeSectionIds, siteNavigation } from '@/lib/sections'
import { faqJsonLd, organizationJsonLd, softwareApplicationJsonLd, websiteJsonLd } from '@/lib/structured-data'

export async function HomePage({ locale }: { locale: Locale }) {
  const copy = getCopy(locale)
  const catalog = await loadPlanCatalog()
  const ids = homeSectionIds(locale)
  const app = appLinks(locale)
  const links = siteNavigation(locale)

  return (
    <PageShell locale={locale} path="/">
      <JsonLd
        data={[
          organizationJsonLd(),
          websiteJsonLd(locale),
          softwareApplicationJsonLd(locale, copy, catalog),
          faqJsonLd(copy.home.faqs)
        ]}
      />
      <Hero copy={copy.home} createHref={app.create} howItWorksHref={`#${ids.howItWorks}`} />
      <PlatformStrip copy={copy.home} />
      <HowItWorks copy={copy.home} id={ids.howItWorks} />
      <FeatureShowcase copy={copy.home} id={ids.features} />
      <PublishSection copy={copy.home} />
      <PricingTeaser locale={locale} copy={copy} catalog={catalog} pricingHref={links.pricing} />
      <FaqSection title={copy.home.faqTitle} faqs={copy.home.faqs} group="home-faq" />
      <FinalCta copy={copy.home} registerHref={app.register} />
    </PageShell>
  )
}
