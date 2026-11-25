import type { FeatureComparison } from '@/content/features'
import styles from './feature-page.module.css'

/** Plain HTML table so the comparison stays readable for crawlers, screen readers and narrow screens. */
export function ComparisonTable({ comparison }: { comparison: FeatureComparison }) {
  const [feature, ours, theirs] = comparison.columns

  return (
    <section aria-labelledby="comparison-title" className={styles.comparison}>
      <div className={`container ${styles.comparisonInner}`}>
        <h2 id="comparison-title" className={`heading ${styles.articleTitle}`}>
          {comparison.title}
        </h2>
        <div className={`card ${styles.tableWrap}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{feature}</th>
                <th scope="col">{ours}</th>
                <th scope="col">{theirs}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.ours}</td>
                  <td>{row.theirs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={`muted ${styles.comparisonNote}`}>{comparison.note}</p>
      </div>
    </section>
  )
}
