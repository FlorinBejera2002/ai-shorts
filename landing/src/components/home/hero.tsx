import type { SiteCopy } from '@/content/copy/types'
import { Icon } from '@/components/ui/icons'
import styles from './hero.module.css'

type HeroProps = { copy: SiteCopy['home']; createHref: string; howItWorksHref: string }

export function Hero({ copy, createHref, howItWorksHref }: HeroProps) {
  return (
    <section className={styles.hero}>
      <div className={`container ${styles.grid}`}>
        <div className={styles.text}>
          <h1 className={`heading ${styles.title}`}>
            {copy.heroLines[0]}
            <br />
            {copy.heroLines[1]}
            <br />
            <span className={styles.sticker}>
              {copy.heroSticker[0]}
              <span className={styles.highlight}>{copy.heroSticker[1]}</span>
            </span>
          </h1>
          <div className={styles.actions}>
            <a href={createHref} className={`btn btn-primary ${styles.action}`}>
              {copy.heroPrimary}
              <Icon name="chevronRight" />
            </a>
            <a href={howItWorksHref} className={`btn btn-secondary ${styles.action}`}>
              <Icon name="play" />
              {copy.heroSecondary}
            </a>
          </div>
        </div>
        <div className={styles.art}>
          <img
            src="/landing/illustrations/hero.webp"
            srcSet="/landing/illustrations/hero-600.webp 600w, /landing/illustrations/hero.webp 920w"
            sizes="(max-width: 899px) 300px, 460px"
            alt={copy.heroAlt}
            width={460}
            height={460}
            fetchPriority="high"
            decoding="async"
          />
        </div>
      </div>
    </section>
  )
}
