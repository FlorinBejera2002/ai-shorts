import theme from '@/components/calendar/publishing-theme.module.css'
import styles from './scripts-workspace.module.css'

/** Scripts reuse the Publish reference theme; portals need the same scope. */
export const scriptSurfaceClass = `${theme.surface} ${styles.tokens}`
export const scriptOverlayClass = theme.overlay

/** Spread on the Scripts root and on every portal it opens. */
export const scriptSurfaceProps = {
  'data-reference-surface': ''
} as const
