import type { SiteCopy } from '@/content/copy/types'
import styles from './sections.module.css'

const STEP_IMAGES = ['step-upload', 'step-clips', 'step-publish'] as const

export function HowItWorks({ copy, id }: { copy: SiteCopy['home']; id: string }) {
  return (
    <section id={id} className={`${styles.band} ${styles.steps}`} aria-labelledby={`${id}-title`}>
      <div className="container">
        <div className={styles.sectionHeader}>
          <span className={`muted ${styles.eyebrow}`}>{copy.howEyebrow}</span>
          <h2 id={`${id}-title`} className={`heading ${styles.sectionTitle}`}>
            {copy.howTitle}
          </h2>
        </div>
        <ol className={styles.stepGrid}>
          {copy.steps.map((step, index) => (
            <li key={step.title} className={styles.step}>
              <img
                src={`/landing/illustrations/${STEP_IMAGES[index]}.webp`}
                alt={step.alt}
                width={200}
                height={200}
                loading="lazy"
                decoding="async"
              />
              <span aria-hidden="true" className={styles.stepNumber}>
                {index + 1}
              </span>
              <h3 className={`heading ${styles.stepTitle}`}>{step.title}</h3>
              <p className={`muted ${styles.stepText}`}>{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
