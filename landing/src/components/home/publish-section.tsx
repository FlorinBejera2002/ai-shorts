import type { SiteCopy } from '@/content/copy/types'
import { PlatformLogo } from './platform-logo'
import styles from './sections.module.css'

export function PublishSection({ copy }: { copy: SiteCopy['home'] }) {
  return (
    <section className={`${styles.band} ${styles.publish}`} aria-labelledby="publish-title">
      <div className={`container ${styles.publishGrid}`}>
        <div className={styles.publishIntro}>
          <img src="/landing/illustrations/publish.webp" alt={copy.publishAlt} width={260} height={260} loading="lazy" decoding="async" />
          <h2 id="publish-title" className={`heading ${styles.publishTitle}`}>
            {copy.publishTitle}
          </h2>
        </div>
        <div className={styles.publishCardWrap}>
          <div className={`card ${styles.week}`}>
            <div className={styles.weekHeader}>
              <h3 className={styles.weekTitle}>{copy.weekTitle}</h3>
              <span className="muted">{copy.weekRange}</span>
            </div>
            <ul className={styles.weekList}>
              {copy.scheduledPosts.map((post) => (
                <li key={post.title} className={styles.weekRow}>
                  <PlatformLogo platform={post.platform} size={32} radius={9} />
                  <span className={styles.weekText}>
                    <b>{post.title}</b>
                    <span className="muted">{post.time}</span>
                  </span>
                  <span className={styles.status}>{copy.scheduled}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
