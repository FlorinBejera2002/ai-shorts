import type { FeatureSection } from '@/content/features'
import styles from './feature-page.module.css'

/** Long-form explanation of the feature; plain prose so crawlers and readers get the full text. */
export function FeatureArticle({ sections }: { sections: FeatureSection[] }) {
  return (
    <article className={styles.article}>
      <div className={`container ${styles.articleInner}`}>
        {sections.map((section) => (
          <section key={section.title} className={styles.articleSection}>
            <h2 className={`heading ${styles.articleTitle}`}>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className={`muted ${styles.paragraph}`}>
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </article>
  )
}
