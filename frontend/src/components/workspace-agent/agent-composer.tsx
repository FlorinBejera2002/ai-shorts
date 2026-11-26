'use client'

import type { ComponentProps, Ref } from 'react'
import { ArrowUp, Mic, RefreshCw, Square } from 'lucide-react'
import type { SiteLocale } from '@/lib/site-config'
import { AgentIllustration } from './agent-persona'
import { AgentHelpComposer } from './agent-help-composer'
import { AgentMenu, type AgentPanel } from './agent-menu'
import { AgentPill } from './agent-pill'
import { AgentIconButton } from './agent-ui'
import type { AgentMessages } from './messages'
import type { useDictation } from './use-dictation'
import type { useWorkspaceAgent } from './use-workspace-agent'
import styles from './agent-composer.module.css'

type AgentController = ReturnType<typeof useWorkspaceAgent>
type Dictation = ReturnType<typeof useDictation>

interface AgentComposerProps {
  agent: AgentController
  copy: AgentMessages
  locale: SiteLocale
  mobile: boolean
  canSend: boolean
  studioBusy: boolean
  studio: boolean
  hasOlder: boolean
  speech: Dictation
  composerRef: Ref<HTMLTextAreaElement>
  pendingQuestion?: string
  onAddQuestion: ComponentProps<typeof AgentHelpComposer>['onAddQuestion']
  onSubmit: () => void
  onPanel: (panel: AgentPanel) => void
  onOlder: () => void
}

/** Composer form: retry, help mode, listening state, dictation, the options menu and send. */
export function AgentComposer(props: AgentComposerProps) {
  const { agent, copy, locale, mobile, canSend, speech, studioBusy, studio, hasOlder, composerRef, pendingQuestion, onAddQuestion, onSubmit, onPanel, onOlder } = props
  return (
    <form
      className={styles.form}
      onSubmit={event => {
        event.preventDefault()
        if (canSend) onSubmit()
      }}
    >
      {agent.retry && (
        <div>
          <AgentPill icon={<RefreshCw aria-hidden="true" />} disabled={agent.busy} onClick={() => void agent.send(agent.retry!)}>
            {copy.retry}
          </AgentPill>
        </div>
      )}
      <AgentHelpComposer
        locale={locale}
        helpMode={agent.helpMode}
        pendingQuestion={pendingQuestion}
        draftLength={agent.draft.length}
        onRegularMessage={agent.clearHelp}
        onAddQuestion={onAddQuestion}
      />
      {speech.listening && (
        <div role="status" className={`${styles.listening} ${mobile ? styles.listeningCompact : ''}`}>
          <AgentIllustration scene="listening" size={mobile ? 64 : 140} />
          <p className={styles.listeningText}>{{ en: 'I am listening', ro: 'Te ascult', es: 'Te escucho' }[locale]}</p>
        </div>
      )}
      <div className={styles.box}>
        <textarea
          ref={composerRef}
          aria-label={copy.composerLabel}
          placeholder={copy.placeholder}
          value={agent.draft}
          onChange={event => agent.setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !mobile) {
              event.preventDefault()
              if (canSend) event.currentTarget.form?.requestSubmit()
            }
          }}
          maxLength={4000}
          rows={2}
          className={styles.textarea}
        />
        <div className={styles.toolbar}>
          <AgentMenu
            locale={locale}
            busy={agent.busy}
            panelBusy={studioBusy}
            hasOlder={hasOlder}
            studio={studio}
            onPanel={onPanel}
            onOlder={onOlder}
          />
          {speech.listening ? (
            <AgentPill variant="primary" icon={<Square aria-hidden="true" />} aria-label={copy.endDictation} aria-pressed onClick={speech.toggle}>
              {{ en: 'Listening…', ro: 'Ascult…', es: 'Escuchando…' }[locale]}
            </AgentPill>
          ) : (
            <AgentIconButton
              size="composer"
              label={speech.supported ? copy.dictate : copy.speechUnavailable}
              disabled={!speech.supported}
              onClick={speech.toggle}
            >
              <Mic />
            </AgentIconButton>
          )}
          <span className={styles.spacer} />
          <button type="submit" className={styles.send} aria-label={copy.send} disabled={!canSend}>
            <ArrowUp aria-hidden="true" />
          </button>
        </div>
      </div>
    </form>
  )
}
