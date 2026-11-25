'use client'

import { Button } from '@/components/ui/button'
import { RunCard } from './run-card'
import type { AgentMessages } from './messages'
import type { useWorkspaceAgent } from './use-workspace-agent'

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
  if (history.isPending) return <p className="py-6 text-xs text-muted-foreground" role="status">{copy.loading}</p>
  return (
    <>
      {history.isError && <TranscriptError agent={agent} copy={copy} ro={ro} />}
      {!runs.length && <AgentEmptyState copy={copy} />}
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
        />
      ))}
      {agent.sending && (
        <p className={`py-3 text-xs text-muted-foreground ${reducedMotion ? '' : 'agent-shimmer'}`} role="status" data-agent-sending>
          {ro ? 'Se trimite cererea…' : 'Sending request…'}
        </p>
      )}
    </>
  )
}

function TranscriptError({ agent, copy, ro }: { agent: AgentController; copy: AgentMessages; ro: boolean }) {
  const hasRuns = agent.runs.length > 0
  const message = hasRuns
    ? ro ? 'Conexiunea s-a întrerupt. Verifică starea înainte să continui.' : 'Connection interrupted. Refresh the status before continuing.'
    : copy.error
  return (
    <div className="space-y-2 py-4">
      <p role="alert" className="text-xs text-destructive">{message}</p>
      <Button variant="outline" size="sm" disabled={agent.history.isFetching} onClick={() => void agent.history.refetch()}>{copy.retry}</Button>
    </div>
  )
}

function AgentEmptyState({ copy }: { copy: AgentMessages }) {
  return (
    <div className="flex min-h-48 items-center px-2 py-10">
      <p className="max-w-64 text-sm leading-relaxed text-muted-foreground">{copy.empty}</p>
    </div>
  )
}
