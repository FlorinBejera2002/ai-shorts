import { PlanPrice } from '@/components/pricing/plan-price'
import { PLAN_ILLUSTRATIONS, PLAN_ORDER } from '@/components/pricing/plans'
import type { SiteCopy } from '@/content/copy/types'
import { Icon } from '@/components/ui/icons'
import type { Locale } from '@/lib/i18n'
import type { PlanCatalog } from '@/lib/plan-catalog'
import styles from './sections.module.css'

type PricingTeaserProps = {
  locale: Locale
  copy: SiteCopy
  catalog: PlanCatalog | null
  pricingHref: string
}

export function PricingTeaser({ locale, copy, catalog, pricingHref }: PricingTeaserProps) {
  const { home, pricing } = copy
  return (
    <section className={styles.teaser} aria-labelledby="pricing-teaser-title">
      <div className="container">
        <div className={styles.sectionHeader}>
          <span className={`muted ${styles.eyebrow}`}>{home.pricingEyebrow}</span>
          <h2 id="pricing-teaser-title" className={`heading ${styles.sectionTitle}`}>
            {home.pricingTitle}
          </h2>
        </div>
        <ul className={styles.teaserGrid}>
          {PLAN_ORDER.map((plan) => (
            <li key={plan}>
              <a href={pricingHref} className={`card ${styles.teaserCard} ${plan === 'pro' ? styles.featured : ''}`}>
                <img src={PLAN_ILLUSTRATIONS[plan]} alt="" width={110} height={110} loading="lazy" decoding="async" />
                <h3 className={`heading ${styles.teaserName}`}>{pricing.plans[plan].name}</h3>
                <b className={styles.teaserPrice}>
                  {plan === 'free' ? (
                    pricing.free
                  ) : (
                    <PlanPrice
                      plan={plan}
                      locale={locale}
                      initial={catalog?.[plan] ?? null}
                      template={pricing.perMonth}
                      unavailable={pricing.unavailable}
                    />
                  )}
                </b>
                <span className={`muted ${styles.teaserTagline}`}>{pricing.plans[plan].tagline}</span>
              </a>
            </li>
          ))}
        </ul>
        <div className={styles.teaserMore}>
          <a href={pricingHref} className={`btn btn-secondary ${styles.teaserButton}`}>
            {home.allPlans}
            <Icon name="chevronRight" />
          </a>
        </div>
      </div>
    </section>
  )
}
