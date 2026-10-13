import { FolderOpen, History, ImagePlus, Lightbulb, MoreHorizontal, Paperclip, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export type AgentPanel = 'attachments' | 'projects' | 'recordings' | 'studio' | 'preferences' | 'suggestions'

export function AgentMenu({ ro, busy, hasOlder, studio, onPanel, onOlder, panelBusy = false }: {
  ro: boolean; busy: boolean; hasOlder: boolean; studio: boolean
  onPanel: (panel: AgentPanel) => void; onOlder: () => void
  panelBusy?: boolean
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button type="button" size="icon" variant="ghost" className="size-8" aria-label={ro ? 'Opțiuni conversație' : 'Conversation options'}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent side="top" align="start" className="w-60" data-agent-menu>
      <DropdownMenuItem disabled={panelBusy} onSelect={() => onPanel('attachments')}><Paperclip />{ro ? 'Atașează fișiere' : 'Attach files'}</DropdownMenuItem>
      <DropdownMenuItem disabled={panelBusy} onSelect={() => onPanel('projects')}><FolderOpen />{ro ? 'Alege proiectul' : 'Choose project'}</DropdownMenuItem>
      <DropdownMenuItem disabled={panelBusy} onSelect={() => onPanel(studio ? 'studio' : 'recordings')}><ImagePlus />{ro ? 'Adaugă surse media' : 'Add media sources'}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={panelBusy} onSelect={() => onPanel('suggestions')}><Lightbulb />{ro ? 'Pași recomandați' : 'Suggested next steps'}</DropdownMenuItem>
      {hasOlder && <DropdownMenuItem disabled={busy} onSelect={onOlder}><History />{ro ? 'Mesaje anterioare' : 'Earlier messages'}</DropdownMenuItem>}
      <DropdownMenuItem disabled={panelBusy} onSelect={() => onPanel('preferences')}><Settings2 />{ro ? 'Preferințe și istoric' : 'Preferences and history'}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
