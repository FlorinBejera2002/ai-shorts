import { Sparkles, X } from 'lucide-react'
import { AgentPill } from './agent-pill'
import { AgentIconButton } from './agent-ui'
import styles from './agent-composer.module.css'

interface Props {
  locale: string
  helpMode: boolean
  pendingQuestion?: string
  draftLength: number
  onRegularMessage: () => void
  onAddQuestion: () => void
}

/** Help-mode chip and the pending help question, shown above the textarea. */
export function AgentHelpComposer({ locale, helpMode, pendingQuestion, draftLength, onRegularMessage, onAddQuestion }: Props) {
  const text = (english: string, romanian: string) => locale === 'ro' ? romanian : english
  const addDisabled = pendingQuestion !== undefined && draftLength + pendingQuestion.length + 2 > 4000
  return <>
    {helpMode && <div className={styles.helpRow}>
      <span className={styles.chip}>
        <Sparkles aria-hidden="true" />
        <span className={styles.chipLabel}>{text('Clip help', 'Ajutor la clipuri')}</span>
        <AgentIconButton label={text('Regular message', 'Mesaj obișnuit')} onClick={onRegularMessage}>
          <X />
        </AgentIconButton>
      </span>
    </div>}
    {pendingQuestion && <div className={styles.question} role="status">
      <span className={styles.chip} title={pendingQuestion}>
        <Sparkles aria-hidden="true" />
        <span className={styles.chipLabel}>{text('Question from the current step', 'Întrebare de la pasul curent')}</span>
        <span className={styles.chipText}>{pendingQuestion}</span>
      </span>
      <AgentPill variant="ghost" disabled={addDisabled} onClick={onAddQuestion}>{text('Add question', 'Adaugă întrebarea')}</AgentPill>
    </div>}
  </>
}
