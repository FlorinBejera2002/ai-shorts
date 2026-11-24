'use client'

import type { ComponentProps } from 'react'
import { m as motion } from 'framer-motion'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentAttachments } from './agent-attachments'
import { AgentPreferences } from './agent-preferences'
import { AgentProjectPicker } from './agent-project-picker'
import { AgentResources } from './agent-resources'
import type { AgentPanel } from './agent-menu'
import type { AgentMessages } from './messages'
import { StudioAssets } from './studio-assets'
import { SuggestionCard } from './suggestion-card'
import type { useAgentAttachments } from './use-agent-attachments'
import type { useAgentResources } from './use-agent-resources'
import type { useWorkspaceAgent } from './use-workspace-agent'
import type { attachmentTarget } from './attachment-target'

type AgentController = ReturnType<typeof useWorkspaceAgent>
type ProjectChoice = Parameters<ComponentProps<typeof AgentProjectPicker>['onSelect']>[0]

interface AgentContextPanelProps {
  panel: AgentPanel
  title: string
  copy: AgentMessages
  ro: boolean
  agent: AgentController
  attachments: ReturnType<typeof useAgentAttachments>
  resource: ReturnType<typeof useAgentResources>
  /** Kinds the waiting run is missing, or undefined to show every attachment kind. */
  attachmentKinds?: string[]
  attachmentTarget: ReturnType<typeof attachmentTarget>
  storyId?: string
  projectId?: string
  studioProjectId?: string
  uploading: boolean
  width: number
  onWidth: (width: number) => void
  onClose: () => void
  onRecordingsProject: (project: ProjectChoice) => void
  onProject: (project: ProjectChoice) => void
  onStudioBusy: (busy: boolean) => void
  onStudioUploaded: (id: string) => void
  reducedMotion: boolean
}

/** Side panel of the assistant (attachments, projects, media, studio, preferences, suggestions). */
export function AgentContextPanel(props: AgentContextPanelProps) {
  const { panel, title, ro, uploading, onClose, reducedMotion } = props
  return (
    <motion.section
        initial={reducedMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.16 }}
        className="mt-3 space-y-3 rounded-md border p-3"
        data-agent-context-panel={panel}
        aria-label={title}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-medium">{title}</h3>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={ro ? 'Închide opțiunile' : 'Close options'}
            disabled={uploading}
            onClick={onClose}
          >
            <X className="size-3.5" />
          </Button>
        </div>
        <AgentPanelBody {...props} />
      </motion.section>
  )
}

function AgentPanelBody(props: AgentContextPanelProps) {
  const { panel, ro, agent, uploading } = props
  switch (panel) {
    case 'attachments':
      return <AgentAttachments attachments={props.attachments} ro={ro} kinds={props.attachmentKinds} target={props.attachmentTarget} />
    case 'recordings':
      return props.storyId
        ? <AgentResources resource={props.resource} ro={ro} />
        : <>
            <p className="text-xs text-muted-foreground">{ro ? 'Alege proiectul la care atașezi filmările.' : 'Choose a project for these recordings.'}</p>
            <AgentProjectPicker ro={ro} storiesOnly disabled={uploading} selectedId={props.projectId} onSelect={props.onRecordingsProject} />
          </>
    case 'studio':
      return props.studioProjectId
        ? <StudioAssets key={props.studioProjectId} projectId={props.studioProjectId} ro={ro} onBusy={props.onStudioBusy} onUploaded={props.onStudioUploaded} />
        : <p className="text-xs text-muted-foreground">{ro ? 'Precizează proiectul Studio în conversație înainte de a atașa fișierele.' : 'Identify the Studio project in the conversation before attaching files.'}</p>
    case 'projects':
      return <AgentProjectPicker ro={ro} disabled={uploading} selectedId={props.projectId} onSelect={props.onProject} />
    case 'preferences':
      return <AgentPreferences agent={agent} messages={props.copy} ro={ro} width={props.width} onWidth={props.onWidth} />
    case 'suggestions':
      return <AgentSuggestions agent={agent} copy={props.copy} ro={ro} disabled={agent.busy || Boolean(agent.retry) || uploading} onClose={props.onClose} />
  }
}

function AgentSuggestions({ agent, copy, ro, disabled, onClose }: { agent: AgentController; copy: AgentMessages; ro: boolean; disabled: boolean; onClose: () => void }) {
  const { suggestions } = agent
  if (suggestions.isPending) return <p role="status" className="text-xs">{copy.loading}</p>
  if (suggestions.isError) {
    return (
      <div>
        <p className="text-xs" role="alert">{copy.error}</p>
        <Button size="sm" variant="outline" onClick={() => void suggestions.refetch()}>{copy.retry}</Button>
      </div>
    )
  }
  if (!suggestions.data?.suggestions.length) return <p className="text-xs text-muted-foreground">{ro ? 'Nu sunt recomandări acum.' : 'No suggestions right now.'}</p>
  return (
    <div className="space-y-3">
      {suggestions.data.suggestions.map(suggestion => (
        <SuggestionCard
          key={suggestion.id}
          original={suggestion}
          messages={copy}
          disabled={disabled}
          onAccept={item => { onClose(); void agent.send(undefined, item) }}
          onDismiss={id => void agent.dismiss(id)}
        />
      ))}
    </div>
  )
}
