import { useTranslations } from 'next-intl'
import { SAFE_INSET, type SnapGuides } from './preview-snap'
import styles from './preview-card.module.css'

const GRID = [1 / 3, 0.5, 2 / 3]
const on = (guide: number | null, line: number) => (guide !== null && Math.abs(guide - line) < 1e-6 ? '' : undefined)

/** "Zonă sigură" frame and, while dragging, the thirds grid; snapped lines turn yellow. */
export function PreviewGuides({ safeZone, grid, active }: { safeZone: boolean; grid: boolean; active: SnapGuides }) {
  const t = useTranslations('brand.editor')
  if (!safeZone && !grid) return null
  return (
    <span className={styles.guides} aria-hidden="true" data-brand-preview-guides="">
      {safeZone && (
        <span
          className={styles.safe}
          data-left={on(active.x, SAFE_INSET)}
          data-right={on(active.x, 1 - SAFE_INSET)}
          data-top={on(active.y, SAFE_INSET)}
          data-bottom={on(active.y, 1 - SAFE_INSET)}
        >
          <span className={styles.safeLabel}>{t('safeZone')}</span>
        </span>
      )}
      {grid &&
        GRID.map((line) => (
          <span key={`x${line}`} className={styles.vline} style={{ left: `${line * 100}%` }} data-center={line === 0.5 ? '' : undefined} data-active={on(active.x, line)} />
        ))}
      {grid &&
        GRID.map((line) => (
          <span key={`y${line}`} className={styles.hline} style={{ top: `${line * 100}%` }} data-center={line === 0.5 ? '' : undefined} data-active={on(active.y, line)} />
        ))}
    </span>
  )
}
