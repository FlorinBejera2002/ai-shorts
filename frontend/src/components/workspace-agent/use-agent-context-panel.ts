import { useState } from 'react'
import type { AgentPanel } from './agent-menu'
import { contextualPanelFor } from './agent-view-state'
import { studioResourceTarget, studioResourceWaiter } from './studio-resources'
import type { SelectedProject } from './use-agent-project-selection'
import type { useWorkspaceAgent } from './use-workspace-agent'

type AgentController = ReturnType<typeof useWorkspaceAgent>

interface UseAgentContextPanelOptions {
  agent: AgentController
  routeStudio?: string
  selectedProject?: SelectedProject
}

/**
 * Owns the assistant's side panel: the panel the user opened, or the one a waiting run needs.
 * Closing a panel hides it until the waiting run changes.
 */
export function useAgentContextPanel({ agent, routeStudio, selectedProject }: UseAgentContextPanelOptions) {
  const [panel, setPanel] = useState<AgentPanel | null>(null)
  const [dismissedContext, setDismissedContext] = useState('')
  const waiting = [...agent.runs].reverse().find(run => run.status === 'waiting_for_resources')
  const missing = waiting?.missing_resources ?? []
  const contextKey = waiting ? `${waiting.id}:${waiting.revision}` : ''
  const visiblePanel = (contextKey !== dismissedContext ? contextualPanelFor(missing) : null) ?? panel
  const studioProjectId = studioResourceTarget(waiting, routeStudio ?? (selectedProject?.kind === 'studio' ? selectedProject.id : undefined))
  const attachmentKinds = panel === 'attachments' ? undefined : missing.map(item => item.kind)

  function openPanel(next: AgentPanel) {
    setDismissedContext(contextKey)
    setPanel(next)
  }
  function closePanel() {
    setPanel(null)
    setDismissedContext(contextKey)
  }
  function resumeStudioUpload(id: string) {
    const run = studioResourceWaiter(agent.runs, id)
    if (run && !agent.busy) void agent.control(run, 'resume')
  }

  return { panel, setPanel, visiblePanel, waiting, studioProjectId, attachmentKinds, openPanel, closePanel, resumeStudioUpload }
}
