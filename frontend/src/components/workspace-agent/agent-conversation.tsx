'use client'

import type { ReactNode, Ref } from 'react'
import { ArrowDown } from 'lucide-react'
import type { SiteLocale } from '@/lib/site-config'
import styles from './agent-conversation.module.css'

interface AgentConversationProps {
  viewportRef: Ref<HTMLDivElement>
  onScroll: () => void
  locale: SiteLocale
  awayFromBottom: boolean
  onScrollToLatest: () => void
  children: ReactNode
}

/** Scrollable message area; shows a round jump-to-latest control when the reader has scrolled away from the end. */
export function AgentConversation({ viewportRef, onScroll, locale, awayFromBottom, onScrollToLatest, children }: AgentConversationProps) {
  const jumpLabel = { en: 'Jump to latest messages', ro: 'Mergi la ultimele mesaje', es: 'Ir a los mensajes más recientes' }[locale]
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={viewportRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain px-4" aria-label={{ en: 'Conversation', ro: 'Conversație', es: 'Conversación' }[locale]} tabIndex={0} data-agent-conversation>
        <div className="min-h-full pb-4">{children}</div>
      </div>
      {awayFromBottom && <button type="button" className={styles.jumpButton} onClick={onScrollToLatest} aria-label={jumpLabel} title={jumpLabel}>
        <ArrowDown aria-hidden="true" />
      </button>}
    </div>
  )
}
