import type { FeatureHighlight } from '@/content/features'
import styles from './feature-page.module.css'

type FeatureHighlightsProps = { label: string; highlights: FeatureHighlight[] }

export function FeatureHighlights({ label, highlights }: FeatureHighlightsProps) {
  return (
    <section aria-label={label} className={styles.highlights}>
      <ul className={`container ${styles.highlightGrid}`}>
        {highlights.map((highlight) => (
          <li key={highlight.title} className={`card ${styles.highlight}`}>
            <h2 className={`heading ${styles.highlightTitle}`}>{highlight.title}</h2>
            <p className="muted">{highlight.text}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
