'use client'

import type { ReactNode, Ref } from 'react'
import { ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AgentConversationProps {
  viewportRef: Ref<HTMLDivElement>
  onScroll: () => void
  ro: boolean
  awayFromBottom: boolean
  onScrollToLatest: () => void
  children: ReactNode
}

/** Scrollable message area; shows a jump-to-latest control when the reader has scrolled away from the end. */
export function AgentConversation({ viewportRef, onScroll, ro, awayFromBottom, onScrollToLatest, children }: AgentConversationProps) {
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={viewportRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain px-4" aria-label={ro ? 'Conversație' : 'Conversation'} tabIndex={0} data-agent-conversation>
        <div className="min-h-full pb-4">{children}</div>
      </div>
      {awayFromBottom && <Button size="sm" variant="outline" className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background shadow-sm" onClick={onScrollToLatest}><ArrowDown className="mr-1.5 size-3.5" />{ro ? 'Ultimele mesaje' : 'Latest messages'}</Button>}
    </div>
  )
}
