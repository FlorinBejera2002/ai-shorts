'use client'

import { useIsMobile } from '@/hooks/use-mobile'
import { AgentAvatar, AgentIllustration } from './agent-persona'
import { AgentPill } from './agent-pill'
import { RunCard } from './run-card'
import { SuggestionCard } from './suggestion-card'
import type { AgentMessages } from './messages'
import type { useWorkspaceAgent } from './use-workspace-agent'
import styles from './agent-conversation.module.css'

type AgentController = ReturnType<typeof useWorkspaceAgent>

interface AgentTranscriptProps {
  agent: AgentController
  copy: AgentMessages
  ro: boolean
  uploading: boolean
  reducedMotion: boolean
  onOpenRecordings: (id: string) => void
}

/** Loading, error, empty and run states of the conversation, followed by the in-flight request. */
export function AgentTranscript({ agent, copy, ro, uploading, reducedMotion, onOpenRecordings }: AgentTranscriptProps) {
  const { history, runs } = agent
  if (history.isPending) return <AgentLoadingState copy={copy} />
  return (
    <>
      {history.isError && <TranscriptError agent={agent} ro={ro} />}
      {!runs.length && <AgentEmptyState agent={agent} copy={copy} ro={ro} uploading={uploading} />}
      {runs.map(run => (
        <RunCard
          key={run.id}
          run={run}
          messages={copy}
          busy={agent.busy}
          uploading={uploading}
          connectionLost={agent.connectionLost}
          control={(item, command) => void agent.control(item, command)}
          selectProject={onOpenRecordings}
          onRetry={item => void agent.send({ request_id: crypto.randomUUID(), message: item.message, context: item.context })}
        />
      ))}
      {agent.sending && <TypingReply ro={ro} reducedMotion={reducedMotion} />}
    </>
  )
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
function TypingReply({ ro, reducedMotion }: { ro: boolean; reducedMotion: boolean }) {
  const dot = `${styles.dot} ${reducedMotion ? styles.dotStatic : ''}`
  return (
    <div className="flex items-end gap-2.5 py-2" data-agent-sending>
      <AgentAvatar size={32} typing />
      <div className={styles.typingBubble} role="status">
        <span className="sr-only">{ro ? 'Agentul scrie…' : 'Agent is typing…'}</span>
        <span className={dot} aria-hidden="true" />
        <span className={dot} aria-hidden="true" />
        <span className={dot} aria-hidden="true" />
      </div>
    </div>
  )
}

function TranscriptError({ agent, ro }: { agent: AgentController; ro: boolean }) {
  const hasRuns = agent.runs.length > 0
  if (!hasRuns) return <AgentErrorState agent={agent} ro={ro} />
  return (
    <div className={styles.stateBlock}>
      <p role="alert" className="text-xs text-destructive">{ro ? 'Conexiunea s-a întrerupt. Verifică starea înainte să continui.' : 'Connection interrupted. Refresh the status before continuing.'}</p>
      <AgentPill variant="secondary" disabled={agent.history.isFetching} onClick={() => void agent.history.refetch()}>{ro ? 'Reîncearcă' : 'Retry'}</AgentPill>
    </div>
  )
}

function AgentErrorState({ agent, ro }: { agent: AgentController; ro: boolean }) {
  const isMobile = useIsMobile()
  return (
    <div className={styles.stateBlock}>
      <AgentIllustration scene="offline" size={isMobile ? 150 : 120} />
      <h2 className={styles.stateTitle} role="alert">{ro ? 'Conectarea a eșuat' : 'Connection failed'}</h2>
      <AgentPill variant="secondary" disabled={agent.history.isFetching} onClick={() => void agent.history.refetch()}>{ro ? 'Reîncearcă' : 'Retry'}</AgentPill>
    </div>
  )
}

function AgentEmptyState({ agent, copy, ro, uploading }: { agent: AgentController; copy: AgentMessages; ro: boolean; uploading: boolean }) {
  const isMobile = useIsMobile()
  const suggestions = agent.showSuggestions ? agent.suggestions.data?.suggestions ?? [] : []
  const sceneSize = isMobile ? 150 : 120
  return (
    <section className={styles.stateBlock}>
      <AgentIllustration scene="welcome" size={sceneSize} />
      <h2 className={styles.stateTitle}>{ro ? 'La ce vrei să lucrăm?' : 'What would you like to work on?'}</h2>
      {agent.showSuggestions && suggestions.length > 0 && <>
        <p className={styles.sectionLabel}>{copy.suggestions}</p>
        <div className={styles.suggestions}>
          {suggestions.map(suggestion => (
            <SuggestionCard
              key={suggestion.id}
              original={suggestion}
              messages={copy}
              disabled={agent.busy || Boolean(agent.retry) || uploading}
              onAccept={item => void agent.send(undefined, item)}
              onDismiss={id => void agent.dismiss(id)}
            />
          ))}
        </div>
      </>}
      {agent.showSuggestions && !suggestions.length && agent.suggestions.isSuccess && <>
        <AgentIllustration scene="noSuggestions" size={sceneSize} />
        <p className={styles.statusLine}>{ro ? 'Nu sunt recomandări acum' : 'No suggestions right now'}</p>
      </>}
    </section>
  )
}
