'use client'

import { X } from 'lucide-react'
import type { AgentMessages } from './messages'
import styles from './agent-bubble.module.css'

interface AgentBubbleProps {
  copy: AgentMessages
  onOpen: () => void
  onDismiss: () => void
}

/** Speech bubble that rises from the launcher; its text opens the agent and × hides it. */
export function AgentBubble({ copy, onOpen, onDismiss }: AgentBubbleProps) {
  return (
    <div className={styles.bubble}>
      <button type="button" className={styles.text} onClick={onOpen}>{copy.bubble}</button>
      <button type="button" className={styles.dismiss} aria-label={copy.dismissBubble} onClick={onDismiss}>
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
