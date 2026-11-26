'use client'

import type { ComponentProps } from 'react'
import { m as motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { SiteLocale } from '@/lib/site-config'
import { AgentIllustration } from './agent-persona'
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
import { AgentPill } from './agent-pill'
import { AgentIconButton } from './agent-ui'
import styles from './agent-panels.module.css'

type AgentController = ReturnType<typeof useWorkspaceAgent>
type ProjectChoice = Parameters<ComponentProps<typeof AgentProjectPicker>['onSelect']>[0]

interface AgentContextPanelProps {
  panel: AgentPanel
  title: string
  copy: AgentMessages
  locale: SiteLocale
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
  const { panel, title, locale, uploading, onClose, reducedMotion } = props
  return (
    <motion.section
        initial={reducedMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.16 }}
        className={styles.panel}
        data-agent-context-panel={panel}
        aria-label={title}
      >
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          <AgentIconButton label={{ en: 'Close options', ro: 'Închide opțiunile', es: 'Cerrar opciones' }[locale]} disabled={uploading} onClick={onClose}>
            <X />
          </AgentIconButton>
        </div>
        <AgentPanelBody {...props} />
      </motion.section>
  )
}

function AgentPanelBody(props: AgentContextPanelProps) {
  const { panel, locale, agent, uploading } = props
  switch (panel) {
    case 'attachments':
      return <AgentAttachments attachments={props.attachments} locale={locale} kinds={props.attachmentKinds} target={props.attachmentTarget} />
    case 'recordings':
      return props.storyId
        ? <AgentResources resource={props.resource} locale={locale} />
        : <>
            <p className="text-xs text-muted-foreground">{{ en: 'Choose a project for these recordings.', ro: 'Alege proiectul la care atașezi filmările.', es: 'Elige el proyecto al que adjuntas las grabaciones.' }[locale]}</p>
            <AgentProjectPicker locale={locale} storiesOnly disabled={uploading} selectedId={props.projectId} onSelect={props.onRecordingsProject} />
          </>
    case 'studio':
      return props.studioProjectId
        ? <StudioAssets key={props.studioProjectId} projectId={props.studioProjectId} locale={locale} onBusy={props.onStudioBusy} onUploaded={props.onStudioUploaded} />
        : <p className="text-xs text-muted-foreground">{{ en: 'Identify the Studio project in the conversation before attaching files.', ro: 'Precizează proiectul Studio în conversație înainte de a atașa fișierele.', es: 'Indica el proyecto de Studio en la conversación antes de adjuntar archivos.' }[locale]}</p>
    case 'projects':
      return <AgentProjectPicker locale={locale} disabled={uploading} selectedId={props.projectId} onSelect={props.onProject} />
    case 'preferences':
      return <AgentPreferences agent={agent} messages={props.copy} locale={locale} width={props.width} onWidth={props.onWidth} />
    case 'suggestions':
      return <AgentSuggestions agent={agent} copy={props.copy} locale={locale} disabled={agent.busy || Boolean(agent.retry) || uploading} onClose={props.onClose} />
  }
}

function AgentSuggestions({ agent, copy, locale, disabled, onClose }: { agent: AgentController; copy: AgentMessages; locale: SiteLocale; disabled: boolean; onClose: () => void }) {
  const { suggestions } = agent
  if (suggestions.isPending) return <p role="status" className={styles.emptyText}>{copy.loading}</p>
  if (suggestions.isError) {
    return (
      <div className={styles.emptyState}>
        <AgentIllustration scene="offline" size={96} />
        <p className={styles.emptyText} role="alert">{copy.error}</p>
        <AgentPill onClick={() => void suggestions.refetch()}>{{ en: 'Retry', ro: 'Reîncearcă', es: 'Reintentar' }[locale]}</AgentPill>
      </div>
    )
  }
  if (!suggestions.data?.suggestions.length) {
    return (
      <div className={styles.emptyState}>
        <AgentIllustration scene="noSuggestions" size={140} />
        <p className={styles.emptyText}>{{ en: 'No suggestions right now', ro: 'Nu sunt recomandări acum', es: 'No hay sugerencias por ahora' }[locale]}</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {suggestions.data.suggestions.map(suggestion => (
        <SuggestionCard
          key={suggestion.id}
          original={suggestion}
          messages={copy}
          locale={locale}
          disabled={disabled}
          onAccept={item => { onClose(); void agent.send(undefined, item) }}
          onDismiss={id => void agent.dismiss(id)}
        />
      ))}
    </div>
  )
}
