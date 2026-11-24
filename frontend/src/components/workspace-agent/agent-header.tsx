'use client'

import { Bot, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AgentHeaderProps {
  title: string
  closeLabel: string
  onClose: () => void
}

/** Title bar of the assistant with the control that collapses it back to the launcher. */
export function AgentHeader({ title, closeLabel, onClose }: AgentHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <span className="mr-1 flex size-7 items-center justify-center rounded-md bg-foreground text-background"><Bot className="size-4" aria-hidden="true" /></span>
      <h2 className="min-w-0 flex-1 text-sm font-semibold tracking-tight">{title}</h2>
      <Button size="icon" variant="ghost" className="size-8" aria-label={closeLabel} onClick={onClose}><ChevronRight className="size-4" /></Button>
    </header>
  )
}
