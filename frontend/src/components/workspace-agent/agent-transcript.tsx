'use client'

import type { SiteLocale } from '@/lib/site-config'
import { useIsMobile } from '@/hooks/use-mobile'
import { AgentAvatar, AgentIllustration } from './agent-persona'
import { AgentPill } from './agent-pill'
import { RunCard } from './run-card'
import { SuggestionCard } from './suggestion-card'
import type { AgentMessages } from './messages'
import type { AgentRun } from './model'
import type { useWorkspaceAgent } from './use-workspace-agent'
import styles from './agent-conversation.module.css'

type AgentController = ReturnType<typeof useWorkspaceAgent>

interface AgentTranscriptProps {
  agent: AgentController
  copy: AgentMessages
  locale: SiteLocale
  uploading: boolean
  reducedMotion: boolean
  onOpenRecordings: (id: string) => void
}

/** Loading, error, empty and run states of the conversation, followed by the in-flight request. */
export function AgentTranscript({ agent, copy, locale, uploading, reducedMotion, onOpenRecordings }: AgentTranscriptProps) {
  const { history, runs } = agent
  if (history.isPending) return <AgentLoadingState copy={copy} />
  return (
    <>
      {history.isError && <TranscriptError agent={agent} locale={locale} />}
      {!runs.length && <AgentEmptyState agent={agent} copy={copy} locale={locale} uploading={uploading} />}
      {runs.map(run => (
        <RunCard
          key={run.id}
          run={run}
          messages={copy}
          locale={locale}
          busy={agent.busy}
          uploading={uploading}
          connectionLost={agent.connectionLost}
          control={(item, command) => void agent.control(item, command)}
          selectProject={onOpenRecordings}
          onRetry={item => void agent.send({ request_id: crypto.randomUUID(), message: item.message, context: item.context })}
        />
      ))}
      {(agent.sending || runs.some(isAwaitingFirstReply)) && <TypingReply locale={locale} reducedMotion={reducedMotion} />}
    </>
  )
}

/** Accepted but still planning: nothing on the card yet, so the typing bubble keeps the wait visible. */
function isAwaitingFirstReply(run: AgentRun): boolean {
  return (run.status === 'planning' || run.status === 'running')
    && !run.action && !run.steps?.length && !run.approval_preview && !run.reply && !run.error
}

function AgentLoadingState({ copy }: { copy: AgentMessages }) {
  return (
    <div className={styles.stateBlock} role="status">
      <AgentIllustration scene="thinking" size={88} />
      <p className={styles.statusLine}>{copy.loading}</p>
    </div>
  )
}

/** Agent is composing a reply: avatar with a three-dot bubble. */
function TypingReply({ locale, reducedMotion }: { locale: SiteLocale; reducedMotion: boolean }) {
  const dot = `${styles.dot} ${reducedMotion ? styles.dotStatic : ''}`
  return (
    <div className="flex items-end gap-2.5 py-2" data-agent-sending>
      <AgentAvatar size={32} typing />
      <div className={styles.typingBubble} role="status">
        <span className="sr-only">{{ en: 'Agent is typing…', ro: 'Agentul scrie…', es: 'El agente está escribiendo…' }[locale]}</span>
        <span className={dot} aria-hidden="true" />
        <span className={dot} aria-hidden="true" />
        <span className={dot} aria-hidden="true" />
      </div>
    </div>
  )
}

function TranscriptError({ agent, locale }: { agent: AgentController; locale: SiteLocale }) {
  const hasRuns = agent.runs.length > 0
  if (!hasRuns) return <AgentErrorState agent={agent} locale={locale} />
  return (
    <div className={styles.stateBlock}>
      <p role="alert" className="text-xs text-destructive">{{ en: 'Connection interrupted. Refresh the status before continuing.', ro: 'Conexiunea s-a întrerupt. Verifică starea înainte să continui.', es: 'La conexión se interrumpió. Revisa el estado antes de continuar.' }[locale]}</p>
      <AgentPill variant="secondary" disabled={agent.history.isFetching} onClick={() => void agent.history.refetch()}>{{ en: 'Retry', ro: 'Reîncearcă', es: 'Reintentar' }[locale]}</AgentPill>
    </div>
  )
}

function AgentErrorState({ agent, locale }: { agent: AgentController; locale: SiteLocale }) {
  const isMobile = useIsMobile()
  return (
    <div className={styles.stateBlock}>
      <AgentIllustration scene="offline" size={isMobile ? 150 : 120} />
      <h2 className={styles.stateTitle} role="alert">{{ en: 'Connection failed', ro: 'Conectarea a eșuat', es: 'La conexión falló' }[locale]}</h2>
      <AgentPill variant="secondary" disabled={agent.history.isFetching} onClick={() => void agent.history.refetch()}>{{ en: 'Retry', ro: 'Reîncearcă', es: 'Reintentar' }[locale]}</AgentPill>
    </div>
  )
}

function AgentEmptyState({ agent, copy, locale, uploading }: { agent: AgentController; copy: AgentMessages; locale: SiteLocale; uploading: boolean }) {
  const isMobile = useIsMobile()
  const suggestions = agent.showSuggestions ? agent.suggestions.data?.suggestions ?? [] : []
  const sceneSize = isMobile ? 150 : 120
  return (
    <section className={styles.stateBlock}>
      <AgentIllustration scene="welcome" size={sceneSize} />
      <h2 className={styles.stateTitle}>{copy.empty}</h2>
      {agent.showSuggestions && suggestions.length > 0 && <>
        <p className={styles.sectionLabel}>{copy.suggestions}</p>
        <div className={styles.suggestions}>
          {suggestions.map(suggestion => (
            <SuggestionCard
              key={suggestion.id}
              original={suggestion}
              messages={copy}
              locale={locale}
              disabled={agent.busy || Boolean(agent.retry) || uploading}
              onAccept={item => void agent.send(undefined, item)}
              onDismiss={id => void agent.dismiss(id)}
            />
          ))}
        </div>
      </>}
      {agent.showSuggestions && !suggestions.length && agent.suggestions.isSuccess && <>
        <AgentIllustration scene="noSuggestions" size={sceneSize} />
        <p className={styles.statusLine}>{{ en: 'No suggestions right now', ro: 'Nu sunt recomandări acum', es: 'No hay sugerencias por ahora' }[locale]}</p>
      </>}
    </section>
  )
}
