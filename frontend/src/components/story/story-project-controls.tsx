import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DeleteIllustration,
  OverlayActions,
  OverlayDescription,
  OverlayTitle,
  ReferenceOverlay
} from '@/components/shared/reference-overlay'
import overlay from '@/components/shared/reference-ui.module.css'
import { useIsMobile } from '@/hooks/use-mobile'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import type { StoryProject } from './types'
import { useStoryLanguage } from './use-story-language'
import { StoryProcessing } from './story-processing'
import { storyFailureReason, storyProblem } from './story-error'
import './story-pill-actions.css'

interface HeaderProps {
  unsavedChanges: boolean
  disabled: boolean
  onNewProject: () => void
}

/**
 * Controls above a finished result: starting a new project. The canvas result shows
 * no heading or project picker, so only the action remains.
 */
export function StoryProjectHeader({
  unsavedChanges,
  disabled,
  onNewProject
}: HeaderProps) {
  const text = useStoryLanguage()
  return (
    <div className="story-project-header flex w-full flex-wrap items-center justify-end gap-3">
      <Button
        variant="outline"
        className="creare-outline-pill"
        aria-label={text('New project', 'Proiect nou')}
        disabled={disabled}
        onClick={onNewProject}
      >
        <Plus />
        <span className="story-new-project-label">
          {text('New project', 'Proiect nou')}
        </span>
      </Button>
      {unsavedChanges && (
        <p role="status" className="w-full text-sm text-muted-foreground">
          {text(
            'Review your choices at Generate to save before switching projects.',
            'Verifică alegerile la Generează pentru a le salva înainte de a schimba proiectul.'
          )}
        </p>
      )}
    </div>
  )
}

interface StatusProps {
  onRetry?: () => void
  project: StoryProject
  active: boolean
  busy: boolean
  onCancel: () => void
}

export function StoryProjectStatus({
  project,
  active,
  busy,
  onCancel,
  onRetry
}: StatusProps) {
  if (project.status === 'draft') return null
  const hasResult = project.versions.some(
    (version) => version.number === project.current_version
  )
  if (!hasResult) {
    return (
      <StoryProcessing
        project={project}
        active={active}
        busy={busy}
        onCancel={onCancel}
        onRetry={onRetry}
      />
    )
  }
  const failed = project.status === 'failed' || project.operation_status === 'failed'
  if (!active && !failed && project.status !== 'cancelled') return null
  return (
    <ResultOperationNotice
      project={project}
      active={active}
      busy={busy}
      failed={failed}
      onCancel={onCancel}
      onRetry={onRetry}
    />
  )
}

/** Status of an operation on a project that already has a finished version. */
function ResultOperationNotice({
  project,
  active,
  busy,
  failed,
  onCancel,
  onRetry
}: {
  project: StoryProject
  active: boolean
  busy: boolean
  failed: boolean
  onCancel: () => void
  onRetry?: () => void
}) {
  const text = useStoryLanguage()
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
      role={failed ? 'alert' : 'status'}
      data-testid="story-operation"
    >
      <span className="flex items-center gap-2">
        {(active || busy) && <LoadingIndicator className="size-4" />}
        {operationMessage({ project, inProgress: active || busy, failed }, text)}
      </span>
      {active && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || project.status === 'cancelling'}
          onClick={onCancel}
        >
          {text('Cancel', 'Anulează')}
        </Button>
      )}
      {failed && onRetry && (
        <Button variant="outline" size="sm" disabled={busy} onClick={onRetry}>
          {text('Retry', 'Reîncearcă')}
        </Button>
      )}
    </div>
  )
}

/** The sentence describing an operation on a project with a finished version. */
function operationMessage(
  state: { project: StoryProject; inProgress: boolean; failed: boolean },
  text: ReturnType<typeof useStoryLanguage>
) {
  const { project, inProgress, failed } = state
  if (inProgress) return text('Processing…', 'Se procesează…')
  if (failed) {
    const failureReason = storyFailureReason(project)
    return failureReason
      ? storyProblem(failureReason, text)
      : text(
          'The last update did not finish. Open your saved video in Studio to continue.',
          'Ultima modificare nu s-a finalizat. Deschide videoul salvat în Studio pentru a continua.'
        )
  }
  if (project.status === 'cancelled') {
    return text(
      'Cancelled. Your previous video is still available.',
      'Anulat. Videoul anterior este disponibil.'
    )
  }
  return text(
    'Your saved video is available in Studio.',
    'Videoul salvat este disponibil în Studio.'
  )
}

interface DeleteProps {
  disabled: boolean
  onDelete: () => Promise<void>
}

/** Project deletion: a destructive trigger that opens the shared confirmation (dialog or bottom sheet). */
export function StoryProjectDelete({ disabled, onDelete }: DeleteProps) {
  const text = useStoryLanguage()
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="w-full">
      <Button
        variant="ghost"
        size="sm"
        className="rounded-full text-destructive hover:text-destructive"
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        <X aria-hidden="true" />
        {text('Delete project', 'Șterge proiectul')}
      </Button>
      {confirming && (
        <DeleteProjectDialog
          busy={disabled}
          onClose={() => setConfirming(false)}
          onConfirm={() => void onDelete()}
        />
      )}
    </div>
  )
}

/** Confirmation for deleting a project: the illustration, the permanent-delete warning and both actions. */
function DeleteProjectDialog({
  busy,
  onClose,
  onConfirm
}: {
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const text = useStoryLanguage()
  const mobile = useIsMobile()
  return (
    <ReferenceOverlay open alert mobile={mobile} busy={busy} onClose={onClose}>
      <div className={overlay.dialogHead}>
        <DeleteIllustration
          alt={text(
            'Illustration for deleting this project',
            'Ilustrație pentru ștergerea acestui proiect'
          )}
        />
        <OverlayTitle mobile={mobile}>
          {text('Delete the project?', 'Ștergi proiectul?')}
        </OverlayTitle>
        <OverlayDescription mobile={mobile}>
          {text(
            'Source files, previews and saved versions are deleted permanently.',
            'Fișierele sursă, previzualizările și versiunile salvate se șterg definitiv.'
          )}
        </OverlayDescription>
      </div>
      <OverlayActions
        cancel={text('Keep', 'Păstrează')}
        confirm={text('Delete permanently', 'Șterge definitiv')}
        tone="danger"
        busy={busy}
        onCancel={onClose}
        onConfirm={onConfirm}
      />
    </ReferenceOverlay>
  )
}
