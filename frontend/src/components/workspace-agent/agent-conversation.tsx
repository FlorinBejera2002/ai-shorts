'use client'

import type { ReactNode, Ref } from 'react'
import { ArrowDown } from 'lucide-react'
import styles from './agent-conversation.module.css'

interface AgentConversationProps {
  viewportRef: Ref<HTMLDivElement>
  onScroll: () => void
  ro: boolean
  awayFromBottom: boolean
  onScrollToLatest: () => void
  children: ReactNode
}

/** Scrollable message area; shows a round jump-to-latest control when the reader has scrolled away from the end. */
export function AgentConversation({ viewportRef, onScroll, ro, awayFromBottom, onScrollToLatest, children }: AgentConversationProps) {
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={viewportRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain px-4" aria-label={ro ? 'Conversație' : 'Conversation'} tabIndex={0} data-agent-conversation>
        <div className="min-h-full pb-4">{children}</div>
      </div>
      {awayFromBottom && <button type="button" className={styles.jumpButton} onClick={onScrollToLatest} aria-label={ro ? 'Mergi la ultimele mesaje' : 'Jump to latest messages'} title={ro ? 'Mergi la ultimele mesaje' : 'Jump to latest messages'}>
        <ArrowDown aria-hidden="true" />
      </button>}
    </div>
  )
}
