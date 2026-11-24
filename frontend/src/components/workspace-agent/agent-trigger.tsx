'use client'

import type { Ref } from 'react'
import { Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AgentMessages } from './messages'

interface AgentTriggerProps {
  copy: AgentMessages
  /** Creare and job pages reserve the phone footer, so the launcher stays out of the way on phones. */
  hiddenOnPhone: boolean
  triggerRef: Ref<HTMLButtonElement>
  onOpen: () => void
}

/** Floating launcher for the workspace assistant; it sits below dialog and sheet overlays (z-50). */
export function AgentTrigger({ copy, hiddenOnPhone, triggerRef, onOpen }: AgentTriggerProps) {
  const phoneClass = hiddenOnPhone ? 'max-lg:hidden' : ''
  return (
    <Button
      data-agent-trigger
      ref={triggerRef}
      className={`fixed right-4 bottom-24 z-40 shadow-lg lg:bottom-6 ${phoneClass}`}
      onClick={onOpen}
      aria-label={copy.open}
      aria-expanded={false}
      aria-controls="workspace-agent-panel"
    >
      <Bot className="mr-2 size-4" />
      {copy.title}
    </Button>
  )
}
