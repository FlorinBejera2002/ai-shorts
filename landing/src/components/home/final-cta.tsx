import type { SiteCopy } from '@/content/copy/types'
import { Icon } from '@/components/ui/icons'
import styles from './sections.module.css'

export function FinalCta({ copy, registerHref }: { copy: SiteCopy['home']; registerHref: string }) {
  return (
    <section className={styles.cta} aria-labelledby="cta-title">
      <div className={`container ${styles.ctaInner}`}>
        <img src="/landing/illustrations/cta.webp" alt={copy.ctaAlt} width={250} height={250} loading="lazy" decoding="async" />
        <div className={`card ${styles.ctaCard}`}>
          <h2 id="cta-title" className={`heading ${styles.ctaTitle}`}>
            {copy.ctaTitle}
          </h2>
          <a href={registerHref} className={`btn btn-primary ${styles.ctaButton}`}>
            {copy.ctaButton}
            <Icon name="chevronRight" />
          </a>
        </div>
      </div>
    </section>
  )
}
