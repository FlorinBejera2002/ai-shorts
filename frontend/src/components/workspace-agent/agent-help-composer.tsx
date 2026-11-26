import { pickInlineText, type InlineText } from '@/i18n/inline-text'
import type { SiteLocale } from '@/lib/site-config'
import { Sparkles, X } from 'lucide-react'
import { AgentPill } from './agent-pill'
import { AgentIconButton } from './agent-ui'
import styles from './agent-composer.module.css'

interface Props {
  locale: SiteLocale
  helpMode: boolean
  pendingQuestion?: string
  draftLength: number
  onRegularMessage: () => void
  onAddQuestion: () => void
}

/** Help-mode chip and the pending help question, shown above the textarea. */
export function AgentHelpComposer({ locale, helpMode, pendingQuestion, draftLength, onRegularMessage, onAddQuestion }: Props) {
  const text: InlineText = (english, romanian, spanish) => pickInlineText(locale, english, romanian, spanish)
  const addDisabled = pendingQuestion !== undefined && draftLength + pendingQuestion.length + 2 > 4000
  return <>
    {helpMode && <div className={styles.helpRow}>
      <span className={styles.chip}>
        <Sparkles aria-hidden="true" />
        <span className={styles.chipLabel}>{text('Clip help', 'Ajutor la clipuri', 'Ayuda con clips')}</span>
        <AgentIconButton label={text('Regular message', 'Mesaj obișnuit', 'Mensaje normal')} onClick={onRegularMessage}>
          <X />
        </AgentIconButton>
      </span>
    </div>}
    {pendingQuestion && <div className={styles.question} role="status">
      <span className={styles.chip} title={pendingQuestion}>
        <Sparkles aria-hidden="true" />
        <span className={styles.chipLabel}>{text('Question from the current step', 'Întrebare de la pasul curent', 'Pregunta del paso actual')}</span>
        <span className={styles.chipText}>{pendingQuestion}</span>
      </span>
      <AgentPill variant="ghost" disabled={addDisabled} onClick={onAddQuestion}>{text('Add question', 'Adaugă întrebarea', 'Añadir pregunta')}</AgentPill>
    </div>}
  </>
}
