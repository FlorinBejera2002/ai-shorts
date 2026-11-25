import { Icon } from '@/components/ui/icons'
import type { FeaturePageCopy } from '@/content/features'
import styles from './feature-page.module.css'

type Link = { href: string; label: string }
type FeatureHeroProps = {
  page: Pick<FeaturePageCopy, 'eyebrow' | 'title' | 'lead' | 'imageAlt'>
  image: { src: string; width: number; height: number }
  primary: Link
  secondary: Link
}

export function FeatureHero({ page, image, primary, secondary }: FeatureHeroProps) {
  return (
    <section className={styles.hero}>
      <div className={`container ${styles.heroGrid}`}>
        <div className={styles.heroText}>
          <span className={`muted ${styles.eyebrow}`}>{page.eyebrow}</span>
          <h1 className={`heading ${styles.title}`}>{page.title}</h1>
          <p className={`muted ${styles.lead}`}>{page.lead}</p>
          <div className={styles.actions}>
            <a href={primary.href} className="btn btn-primary">
              {primary.label}
              <Icon name="chevronRight" />
            </a>
            <a href={secondary.href} className="btn btn-secondary">
              {secondary.label}
            </a>
          </div>
        </div>
        <img
          className={styles.heroArt}
          src={image.src}
          alt={page.imageAlt}
          width={image.width}
          height={image.height}
          fetchPriority="high"
          decoding="async"
        />
      </div>
    </section>
  )
}
