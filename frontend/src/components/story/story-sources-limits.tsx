import type { StoryProject } from './types'
import { useStoryLanguage } from './use-story-language'
import { formatGigabytes, formatLimitMinutes } from './story-source-model'
import styles from './story-sources.module.css'

interface Props {
  limits: StoryProject['limits']
}

/** Desktop aside with the upload limits. Hidden on phones by the stylesheet. */
export function SourceLimits({ limits }: Props) {
  const text = useStoryLanguage()
  const decimal = text('.', ',')
  const perFile = `${formatGigabytes(limits.max_file_bytes, decimal, 0)} GB · ${formatLimitMinutes(limits.max_source_seconds)} min`
  const total = `${formatGigabytes(limits.max_total_bytes, decimal, 0)} GB · ${formatLimitMinutes(limits.max_total_seconds)} min`
  const rows = [
    [text('Per file', 'Pe fișier'), perFile],
    [text('Total', 'În total'), total],
    [text('Formats', 'Formate'), 'MP4, MOV, WebM, MKV']
  ]
  return (
    <aside className={`${styles.limits} ${styles.limitsPanel}`} aria-label={text('Limits', 'Limite')}>
      <p className={styles.limitsTitle}>{text('Limits', 'Limite')}</p>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.limitRow}>
          <span className={styles.limitLabel}>{label}</span>
          <span className={styles.limitValue}>{value}</span>
        </div>
      ))}
    </aside>
  )
}
