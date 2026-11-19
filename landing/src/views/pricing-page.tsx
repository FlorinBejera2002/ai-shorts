import { PlanCard } from '@/components/pricing/plan-card'
import { PLAN_ORDER } from '@/components/pricing/plans'
import styles from '@/components/pricing/pricing.module.css'
import { JsonLd } from '@/components/seo/json-ld'
import { FaqSection } from '@/components/shared/faq-section'
import { PageShell } from '@/components/site/page-shell'
import { getCopy } from '@/content/copy'
import type { PlanId } from '@/content/copy/types'
import { appLinks } from '@/lib/app-links'
import type { Locale } from '@/lib/i18n'
import { loadPlanCatalog } from '@/lib/plan-catalog.server'
import { contactEmail } from '@/lib/site'
import { breadcrumbJsonLd, faqJsonLd, softwareApplicationJsonLd } from '@/lib/structured-data'

function planCtaHref(plan: PlanId, locale: Locale): string {
  return plan === 'agency' ? `mailto:${contactEmail()}` : appLinks(locale).register
}

export async function PricingPage({ locale }: { locale: Locale }) {
  const copy = getCopy(locale)
  const catalog = await loadPlanCatalog()

  return (
    <PageShell locale={locale} path="/pricing">
      <JsonLd
        data={[
          softwareApplicationJsonLd(locale, copy, catalog),
          faqJsonLd(copy.pricing.faqs),
          breadcrumbJsonLd(locale, 'Sneep Cut', { name: copy.nav.pricing, path: '/pricing' })
        ]}
      />
      <section className={styles.intro}>
        <div className={`container ${styles.introInner}`}>
          <h1 className={`heading ${styles.title}`}>{copy.pricing.title}</h1>
          <p className={`muted ${styles.subtitle}`}>{copy.pricing.subtitle}</p>
        </div>
      </section>
      <section className={styles.plans} aria-label={copy.nav.pricing}>
        <div className={`container ${styles.grid}`}>
          {PLAN_ORDER.map((plan) => (
            <PlanCard
              key={plan}
              plan={plan}
              locale={locale}
              copy={copy.pricing}
              catalog={catalog}
              ctaHref={planCtaHref(plan, locale)}
            />
          ))}
        </div>
      </section>
      <FaqSection title={copy.pricing.faqTitle} faqs={copy.pricing.faqs} group="pricing-faq" />
    </PageShell>
  )
}
