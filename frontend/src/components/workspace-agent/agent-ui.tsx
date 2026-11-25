import type { ButtonHTMLAttributes, ReactNode } from 'react'
import styles from './agent-ui.module.css'

/** Round icon-only button. `label` is the accessible name. */
export function AgentIconButton({ label, size = 'panel', className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string; size?: 'panel' | 'composer'
}) {
  const sizeClass = size === 'composer' ? styles.iconComposer : styles.iconPanel
  return (
    <button type="button" aria-label={label} title={label} className={`${styles.iconButton} ${sizeClass} ${className}`} {...props}>
      {children}
    </button>
  )
}

/** Single-line file row: white, bordered, 12px radius, optional status and action. */
export function FileRow({ name, icon, status, tone = 'neutral', action }: {
  name: string; icon?: ReactNode; status?: string; tone?: ProgressTone; action?: ReactNode
}) {
  return (
    <div className={styles.fileRow}>
      {icon && <span className={styles.fileIcon} aria-hidden="true">{icon}</span>}
      <span className={styles.fileName} title={name}>{name}</span>
      {status && <span className={`${styles.status} ${TONE_CLASS[tone]}`}>{status}</span>}
      {action}
    </div>
  )
}

type ProgressTone = 'neutral' | 'success' | 'danger'

const TONE_CLASS: Record<ProgressTone, string> = {
  neutral: styles.toneNeutral,
  success: styles.toneSuccess,
  danger: styles.toneDanger
}

/** Upload row with a 6px progress bar. Without `percent` the bar runs as an indeterminate loader. */
export function UploadRow({ name, status, percent, tone = 'neutral', note, actions }: {
  name: string; status?: string; percent?: number; tone?: ProgressTone; note?: string; actions?: ReactNode
}) {
  const indeterminate = percent === undefined
  return (
    <div className={styles.uploadRow}>
      <div className={styles.uploadHead}>
        <span className={styles.fileName} title={name}>{name}</span>
        {status && <span className={`${styles.status} ${TONE_CLASS[tone]}`}>{status}</span>}
      </div>
      <div
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(percent)}
        className={styles.track}
      >
        <div
          className={`${styles.fill} ${TONE_CLASS[tone]}${indeterminate ? styles.indeterminate : ''}`}
          style={indeterminate ? undefined : { width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
      {note && <p className={styles.hint}>{note}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  )
}
