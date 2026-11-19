import type { SiteCopy } from '@/content/copy/types'
import { PLATFORM_ORDER, PlatformLogo } from './platform-logo'
import styles from './sections.module.css'

export function PlatformStrip({ copy }: { copy: SiteCopy['home'] }) {
  return (
    <section className={styles.platformsSection} aria-labelledby="platforms-title">
      <div className="container">
        <div className={`card ${styles.platforms}`}>
          <h2 id="platforms-title" className={styles.platformsTitle}>
            {copy.publishOn}
          </h2>
          <ul className={styles.platformList}>
            {PLATFORM_ORDER.map((platform) => (
              <li key={platform}>
                <PlatformLogo platform={platform} size={30} radius={8} decorative />
                {copy.platformNames[platform]}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
