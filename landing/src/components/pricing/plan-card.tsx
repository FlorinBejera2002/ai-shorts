import type { PlanId, SiteCopy } from '@/content/copy/types'
import { Icon } from '@/components/ui/icons'
import type { Locale } from '@/lib/i18n'
import type { PlanCatalog } from '@/lib/plan-catalog'
import { PlanPrice } from './plan-price'
import { FEATURED_PLAN, PLAN_ILLUSTRATIONS } from './plans'
import styles from './pricing.module.css'

type PlanCardProps = {
  plan: PlanId
  locale: Locale
  copy: SiteCopy['pricing']
  catalog: PlanCatalog | null
  ctaHref: string
}

export function PlanCard({ plan, locale, copy, catalog, ctaHref }: PlanCardProps) {
  const details = copy.plans[plan]
  const featured = plan === FEATURED_PLAN
  const titleId = `plan-${plan}-title`

  return (
    <article className={`card ${styles.plan} ${featured ? styles.featured : ''}`} aria-labelledby={titleId}>
      {featured && <span className={styles.popular}>{copy.mostPopular}</span>}
      <img src={PLAN_ILLUSTRATIONS[plan]} alt="" width={120} height={120} className={styles.illustration} loading="lazy" decoding="async" />
      <div className={styles.planIntro}>
        <h2 id={titleId} className={`heading ${styles.planName}`}>
          {details.name}
        </h2>
        <span className="muted">{details.tagline}</span>
      </div>
      <p className={`heading ${styles.price}`}>
        {plan === 'free' ? (
          copy.free
        ) : (
          <PlanPrice
            plan={plan}
            locale={locale}
            initial={catalog?.[plan] ?? null}
            template={copy.perMonth}
            unavailable={copy.unavailable}
          />
        )}
      </p>
      <a href={ctaHref} className={`btn ${featured ? 'btn-primary' : 'btn-secondary'} ${styles.cta}`}>
        {details.cta}
      </a>
      <ul className={styles.features}>
        {details.features.map((feature) => (
          <li key={feature}>
            <Icon name="check" className={styles.check} />
            {feature}
          </li>
        ))}
      </ul>
    </article>
  )
}
