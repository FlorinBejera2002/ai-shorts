'use client'

import { ChevronRight, X } from 'lucide-react'
import { AgentAvatar } from './agent-persona'
import styles from './agent-shell.module.css'

interface AgentHeaderProps {
  title: string
  /** Label for the collapse (desktop chevron) or close (phone ×) control. */
  controlLabel: string
  variant: 'panel' | 'sheet'
  onClose: () => void
}

/**
 * Title bar of the assistant. The desktop panel collapses with a chevron; the phone sheet closes with a
 * 44px × button. The header has no hairline: sections are separated by gap only.
 */
export function AgentHeader({ title, controlLabel, variant, onClose }: AgentHeaderProps) {
  if (variant === 'sheet') {
    return (
      <header className={styles.sheetHeader}>
        <AgentAvatar size={28} />
        <h2 className={styles.headerTitle}>{title}</h2>
        <button type="button" className={styles.closeSheet} aria-label={controlLabel} onClick={onClose}>
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>
    )
  }
  return (
    <header className={styles.panelHeader}>
      <AgentAvatar size={28} />
      <h2 className={styles.headerTitle}>{title}</h2>
      <button type="button" className={styles.collapse} aria-label={controlLabel} onClick={onClose}>
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </header>
  )
}
