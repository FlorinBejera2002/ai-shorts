import { FinalCta } from '@/components/home/final-cta'
import { HowItWorks } from '@/components/home/how-it-works'
import { ComparisonTable } from '@/components/features/comparison-table'
import { FeatureArticle } from '@/components/features/feature-article'
import { FeatureHero } from '@/components/features/feature-hero'
import { FeatureHighlights } from '@/components/features/feature-highlights'
import { RelatedFeatures } from '@/components/features/related-features'
import { JsonLd } from '@/components/seo/json-ld'
import { FaqSection } from '@/components/shared/faq-section'
import { PageShell } from '@/components/site/page-shell'
import { getCopy } from '@/content/copy'
import { FEATURE_IMAGES, featurePath, getFeatureCopy, type FeaturePageId } from '@/content/features'
import { appLinks } from '@/lib/app-links'
import type { Locale } from '@/lib/i18n'
import { loadPlanCatalog } from '@/lib/plan-catalog.server'
import { homeSectionIds, siteNavigation } from '@/lib/sections'
import { breadcrumbJsonLd, faqJsonLd, softwareApplicationJsonLd } from '@/lib/structured-data'

type FeaturePageProps = { locale: Locale; id: FeaturePageId }

/** Search-focused product page: one feature or use case, explained in depth, then the shared sign-up flow. */
export async function FeaturePage({ locale, id }: FeaturePageProps) {
  const copy = getCopy(locale)
  const features = getFeatureCopy(locale)
  const page = features.pages[id]
  const catalog = await loadPlanCatalog()
  const path = featurePath(id)
  const app = appLinks(locale)

  return (
    <PageShell locale={locale} path={path}>
      <JsonLd
        data={[
          softwareApplicationJsonLd(locale, copy, catalog),
          faqJsonLd(page.faqs),
          breadcrumbJsonLd(locale, 'Sneep Cut', { name: page.navLabel, path })
        ]}
      />
      <FeatureHero
        page={page}
        image={FEATURE_IMAGES[id]}
        primary={{ href: app.register, label: copy.nav.startFree }}
        secondary={{ href: siteNavigation(locale).pricing, label: copy.home.allPlans }}
      />
      <FeatureHighlights label={features.highlightsLabel} highlights={page.highlights} />
      {page.comparison ? <ComparisonTable comparison={page.comparison} /> : null}
      <FeatureArticle sections={page.sections} />
      <HowItWorks copy={copy.home} id={homeSectionIds(locale).howItWorks} />
      <FaqSection title={features.faqTitle} faqs={page.faqs} group={`${id.replace('/', '-')}-faq`} />
      <RelatedFeatures locale={locale} current={id} title={features.relatedTitle} />
      <FinalCta copy={copy.home} registerHref={app.register} />
    </PageShell>
  )
}
