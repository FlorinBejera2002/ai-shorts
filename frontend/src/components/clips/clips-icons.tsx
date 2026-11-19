import { Inbox } from 'lucide-react'
import overlay from '@/components/shared/reference-ui.module.css'
import styles from './clips.module.css'

/** Neutral folder tile used for every project (no per-project colours). */
export function ProjectIcon({ size }: { size: number }) {
  return (
    <span
      aria-hidden="true"
      className={styles.projectIcon}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h5l2 2.2h8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
      </svg>
    </span>
  )
}

/** Outlined circle for "No project" in project pickers. */
export function NoProjectIcon({ size = 20 }: { size?: number }) {
  return (
    <span aria-hidden="true" className={overlay.none} style={{ width: size, height: size }}>
      <Inbox />
    </span>
  )
}

const FORMAT_BOX: Record<string, [number, number]> = { '9:16': [10, 16], '1:1': [14, 14], '16:9': [18, 11] }

/** Frame outline matching an aspect ratio. */
export function FormatIcon({ ratio }: { ratio: string }) {
  const [width, height] = FORMAT_BOX[ratio] ?? [0, 0]
  return (
    <span aria-hidden="true" className={overlay.formatIcon}>
      {width > 0 && <span style={{ width, height }} />}
    </span>
  )
}
