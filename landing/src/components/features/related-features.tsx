import { Icon } from '@/components/ui/icons'
import { FEATURE_PAGE_IDS, featurePath, getFeatureCopy, type FeaturePageId } from '@/content/features'
import { localePath, type Locale } from '@/lib/i18n'
import styles from './feature-page.module.css'

type RelatedFeaturesProps = { locale: Locale; current: FeaturePageId; title: string }

/** Internal links between the feature pages so each one is reachable from the others. */
export function RelatedFeatures({ locale, current, title }: RelatedFeaturesProps) {
  const { pages } = getFeatureCopy(locale)
  const related = FEATURE_PAGE_IDS.filter((id) => id !== current)

  return (
    <nav aria-labelledby="related-title" className={styles.related}>
      <div className="container">
        <h2 id="related-title" className={`heading ${styles.relatedTitle}`}>
          {title}
        </h2>
        <ul className={styles.relatedGrid}>
          {related.map((id) => (
            <li key={id}>
              <a href={localePath(locale, featurePath(id))} className={`card ${styles.relatedLink}`}>
                {pages[id].navLabel}
                <Icon name="chevronRight" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
