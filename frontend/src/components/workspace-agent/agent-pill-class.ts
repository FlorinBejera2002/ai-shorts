import styles from './agent-pill.module.css'

export type AgentPillVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

/** Class names for a pill control, shared by buttons and links. `fill` makes it share a row evenly. */
export function agentPillClass(variant: AgentPillVariant = 'secondary', fill = false, className = '') {
  return [styles.pill, styles[variant], fill ? styles.fill : '', className].filter(Boolean).join(' ')
}
