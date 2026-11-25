'use client'

import { Copy, Undo2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { AgentAvatar } from './agent-persona'
import { AgentPill } from './agent-pill'
import styles from './agent-conversation.module.css'

/** The operator's message, right-aligned. */
export function UserMessage({ text }: { text: string }) {
  return <div className={styles.userRow}><p className={styles.userBubble}>{text}</p></div>
}

/** Agent reply: avatar on the left, text on the right, then copy and undo actions for finished answers. */
export function AgentReply({ text, ro, onUndo, undoBusy = false }: { text: string; ro: boolean; onUndo?: () => void; undoBusy?: boolean }) {
  return <div className={styles.reply}>
    <AgentAvatar size={24} />
    <div className={styles.replyBody}>
      <p className={styles.replyText}>{text}</p>
      <div className={styles.replyActions}>
        <CopyButton text={text} ro={ro} />
        {onUndo && <AgentPill variant="ghost" disabled={undoBusy} onClick={onUndo}><Undo2 aria-hidden="true" />{ro ? 'Anulează modificarea' : 'Undo change'}</AgentPill>}
      </div>
    </div>
  </div>
}

function CopyButton({ text, ro }: { text: string; ro: boolean }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(ro ? 'Răspuns copiat.' : 'Response copied.')
    } catch {
      toast.error(ro ? 'Copierea a eșuat.' : 'Copy failed.')
    }
  }
  return <button type="button" className={styles.iconButton} onClick={() => void copy()} aria-label={ro ? 'Copiază răspunsul' : 'Copy response'} title={ro ? 'Copiază răspunsul' : 'Copy response'}>
    <Copy aria-hidden="true" />
  </button>
}
