'use client'

import type { Ref } from 'react'
import { AgentAvatar } from './agent-persona'
import { AgentBubble } from './agent-bubble'
import type { AgentMessages } from './messages'
import styles from './agent-shell.module.css'

interface AgentTriggerProps {
  copy: AgentMessages
  bubbleVisible: boolean
  /** Hide on phones where a fixed bottom action bar would be covered. */
  hiddenOnPhone: boolean
  triggerRef: Ref<HTMLButtonElement>
  onOpen: () => void
  onDismissBubble: () => void
}

/** Floating launcher: only the round Ana & Radu avatar, with the speech bubble rising above it. */
export function AgentTrigger({ copy, bubbleVisible, hiddenOnPhone, triggerRef, onOpen, onDismissBubble }: AgentTriggerProps) {
  return (
    <div className={hiddenOnPhone ? `${styles.launcher} ${styles.hiddenOnPhone}` : styles.launcher}>
      {bubbleVisible && <AgentBubble copy={copy} onOpen={onOpen} onDismiss={onDismissBubble} />}
      <button
        type="button"
        data-agent-trigger
        ref={triggerRef}
        className={styles.launcherButton}
        onClick={onOpen}
        aria-label={copy.open}
        aria-expanded={false}
        aria-controls="workspace-agent-panel"
      >
        <AgentAvatar size={64} />
      </button>
    </div>
  )
}
