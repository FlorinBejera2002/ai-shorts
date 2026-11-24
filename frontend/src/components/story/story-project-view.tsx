import type { UseQueryResult } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { storyProblem } from './story-error'
import { StoryNewProjectWizard } from './story-new-project-wizard'
import type { RejectedSource } from './story-source-model'
import { StoryWorkspace } from './story-workspace'
import type { StoryProject } from './types'
import type { StoryIncomingProject } from './use-story-project-creation'
import type { StoryRefresh } from './use-story-project-query'
import { useStoryLanguage } from './use-story-language'

interface StoryProjectViewProps {
  id: string
  projectQuery: UseQueryResult<StoryProject, Error>
  limits: StoryProject['limits']
  creating: boolean
  retainedFiles: File[]
  refused: RejectedSource[]
  onRefusedChange: (update: (current: RejectedSource[]) => RejectedSource[]) => void
  incoming: StoryIncomingProject | null
  onAddFiles: (files: File[]) => void
  onContinue: () => void
  refresh: StoryRefresh
  onUploadBusy: (busy: boolean) => void
  onUnsavedChanges: (unsaved: boolean) => void
  onDeleted: () => void
}

/** Shows the wizard for a new project, or the workspace, error or loading state for the selected one. */
export function StoryProjectView({
  id,
  projectQuery,
  limits,
  creating,
  retainedFiles,
  refused,
  onRefusedChange,
  incoming,
  onAddFiles,
  onContinue,
  refresh,
  onUploadBusy,
  onUnsavedChanges,
  onDeleted
}: StoryProjectViewProps) {
  const text = useStoryLanguage()
  if (!id)
    return (
      <StoryNewProjectWizard
        creating={creating}
        canContinue={retainedFiles.length > 0}
        limits={limits}
        refused={refused}
        onRefusedChange={onRefusedChange}
        onAdd={onAddFiles}
        onContinue={onContinue}
      />
    )
  if (projectQuery.data)
    return (
      <StoryWorkspace
        key={id}
        project={projectQuery.data}
        initialFiles={incoming?.id === id ? incoming.files : []}
        initialStep={incoming?.id === id ? incoming.step : undefined}
        refresh={refresh}
        refused={refused}
        onRefusedChange={onRefusedChange}
        onUploadBusy={onUploadBusy}
        onUnsavedChanges={onUnsavedChanges}
        onDeleted={onDeleted}
      />
    )
  if (projectQuery.isError)
    return (
      <Card className="block space-y-3 p-5">
        <p role="alert">{storyProblem(projectQuery.error.message, text)}</p>
        <Button variant="outline" onClick={() => void projectQuery.refetch()}>
          <RefreshCw />
          {text('Retry', 'Reîncearcă')}
        </Button>
      </Card>
    )
  return (
    <p role="status" className="py-10 text-sm text-muted-foreground">
      {text('Loading your project…', 'Se încarcă proiectul…')}
    </p>
  )
}
