import { FolderOpen, History, ImagePlus, Lightbulb, MoreHorizontal, Paperclip, Settings2 } from 'lucide-react'
import type { SiteLocale } from '@/lib/site-config'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AgentIconButton } from './agent-ui'
import styles from './agent-composer.module.css'

export type AgentPanel = 'attachments' | 'projects' | 'recordings' | 'studio' | 'preferences' | 'suggestions'

/** Conversation options menu. It opens upwards from the composer. */
export function AgentMenu({ locale, busy, hasOlder, studio, onPanel, onOlder, panelBusy = false }: {
  locale: SiteLocale; busy: boolean; hasOlder: boolean; studio: boolean
  onPanel: (panel: AgentPanel) => void; onOlder: () => void
  panelBusy?: boolean
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <AgentIconButton size="composer" label={{ en: 'Conversation options', ro: 'Opțiuni conversație', es: 'Opciones de la conversación' }[locale]}>
        <MoreHorizontal />
      </AgentIconButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="top" align="start" className={styles.menu} data-agent-menu>
      <DropdownMenuItem className={styles.menuItem} disabled={panelBusy} onSelect={() => onPanel('attachments')}><Paperclip />{{ en: 'Attach files', ro: 'Atașează fișiere', es: 'Adjuntar archivos' }[locale]}</DropdownMenuItem>
      <DropdownMenuItem className={styles.menuItem} disabled={panelBusy} onSelect={() => onPanel('projects')}><FolderOpen />{{ en: 'Choose project', ro: 'Alege proiectul', es: 'Elegir proyecto' }[locale]}</DropdownMenuItem>
      <DropdownMenuItem className={styles.menuItem} disabled={panelBusy} onSelect={() => onPanel(studio ? 'studio' : 'recordings')}><ImagePlus />{{ en: 'Add media sources', ro: 'Adaugă surse media', es: 'Añadir fuentes multimedia' }[locale]}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem className={styles.menuItem} disabled={panelBusy} onSelect={() => onPanel('suggestions')}><Lightbulb />{{ en: 'Suggested next steps', ro: 'Pași recomandați', es: 'Próximos pasos sugeridos' }[locale]}</DropdownMenuItem>
      {hasOlder && <DropdownMenuItem className={styles.menuItem} disabled={busy} onSelect={onOlder}><History />{{ en: 'Earlier messages', ro: 'Mesaje anterioare', es: 'Mensajes anteriores' }[locale]}</DropdownMenuItem>}
      <DropdownMenuItem className={styles.menuItem} disabled={panelBusy} onSelect={() => onPanel('preferences')}><Settings2 />{{ en: 'Preferences and history', ro: 'Preferințe și istoric', es: 'Preferencias e historial' }[locale]}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
}
