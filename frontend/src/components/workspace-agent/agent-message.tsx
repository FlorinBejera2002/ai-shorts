'use client'

import { Copy, Undo2 } from 'lucide-react'
import type { SiteLocale } from '@/lib/site-config'
import { toast } from '@/lib/toast'
import { AgentAvatar } from './agent-persona'
import { AgentPill } from './agent-pill'
import styles from './agent-conversation.module.css'

/** The operator's message, right-aligned. */
export function UserMessage({ text }: { text: string }) {
  return <div className={styles.userRow}><p className={styles.userBubble}>{text}</p></div>
}

/** Agent reply: avatar on the left, text on the right, then copy and undo actions for finished answers. */
export function AgentReply({ text, locale, onUndo, undoBusy = false }: { text: string; locale: SiteLocale; onUndo?: () => void; undoBusy?: boolean }) {
  return <div className={styles.reply}>
    <AgentAvatar size={24} />
    <div className={styles.replyBody}>
      <p className={styles.replyText}><InlineMarkdown text={text} /></p>
      <div className={styles.replyActions}>
        <CopyButton text={text} locale={locale} />
        {onUndo && <AgentPill variant="ghost" disabled={undoBusy} onClick={onUndo}><Undo2 aria-hidden="true" />{{ en: 'Undo change', ro: 'Anulează modificarea', es: 'Deshacer cambio' }[locale]}</AgentPill>}
      </div>
    </div>
  </div>
}

const INLINE_MARK = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/

/** The planner writes light Markdown; show **bold** and `code` as text styles instead of raw marks. */
function InlineMarkdown({ text }: { text: string }) {
  let offset = 0
  return <>{text.split(INLINE_MARK).map(part => {
    const key = offset
    offset += part.length
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return <code key={key} className={styles.inlineCode}>{part.slice(1, -1)}</code>
    return part
  })}</>
}

function CopyButton({ text, locale }: { text: string; locale: SiteLocale }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      toast.success({ en: 'Response copied.', ro: 'Răspuns copiat.', es: 'Respuesta copiada.' }[locale])
    } catch {
      toast.error({ en: 'Copy failed.', ro: 'Copierea a eșuat.', es: 'No se pudo copiar.' }[locale])
    }
  }
  const copyLabel = { en: 'Copy response', ro: 'Copiază răspunsul', es: 'Copiar respuesta' }[locale]
  return <button type="button" className={styles.iconButton} onClick={() => void copy()} aria-label={copyLabel} title={copyLabel}>
    <Copy aria-hidden="true" />
  </button>
}
