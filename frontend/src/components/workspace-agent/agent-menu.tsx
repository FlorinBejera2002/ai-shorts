import { FolderOpen, History, ImagePlus, Lightbulb, MoreHorizontal, Paperclip, Settings2 } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AgentIconButton } from './agent-ui'
import styles from './agent-composer.module.css'

export type AgentPanel = 'attachments' | 'projects' | 'recordings' | 'studio' | 'preferences' | 'suggestions'

/** Conversation options menu. It opens upwards from the composer. */
export function AgentMenu({ ro, busy, hasOlder, studio, onPanel, onOlder, panelBusy = false }: {
  ro: boolean; busy: boolean; hasOlder: boolean; studio: boolean
  onPanel: (panel: AgentPanel) => void; onOlder: () => void
  panelBusy?: boolean
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <AgentIconButton size="composer" label={ro ? 'Opțiuni conversație' : 'Conversation options'}>
        <MoreHorizontal />
      </AgentIconButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="top" align="start" className={styles.menu} data-agent-menu>
      <DropdownMenuItem className={styles.menuItem} disabled={panelBusy} onSelect={() => onPanel('attachments')}><Paperclip />{ro ? 'Atașează fișiere' : 'Attach files'}</DropdownMenuItem>
      <DropdownMenuItem className={styles.menuItem} disabled={panelBusy} onSelect={() => onPanel('projects')}><FolderOpen />{ro ? 'Alege proiectul' : 'Choose project'}</DropdownMenuItem>
      <DropdownMenuItem className={styles.menuItem} disabled={panelBusy} onSelect={() => onPanel(studio ? 'studio' : 'recordings')}><ImagePlus />{ro ? 'Adaugă surse media' : 'Add media sources'}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className={styles.menuItem} disabled={panelBusy} onSelect={() => onPanel('suggestions')}><Lightbulb />{ro ? 'Pași recomandați' : 'Suggested next steps'}</DropdownMenuItem>
      {hasOlder && <DropdownMenuItem className={styles.menuItem} disabled={busy} onSelect={onOlder}><History />{ro ? 'Mesaje anterioare' : 'Earlier messages'}</DropdownMenuItem>}
      <DropdownMenuItem className={styles.menuItem} disabled={panelBusy} onSelect={() => onPanel('preferences')}><Settings2 />{ro ? 'Preferințe și istoric' : 'Preferences and history'}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
