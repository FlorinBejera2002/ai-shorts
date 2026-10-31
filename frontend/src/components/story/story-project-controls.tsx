import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import type { StoryProject } from './types'
import { useStoryLanguage } from './use-story-language'
import { StoryProcessing } from './story-processing'

interface HeaderProps {
  id: string
  projects: StoryProject[]
  hasOutput: boolean
  unsavedChanges: boolean
  disabled: boolean
  onSelect: (id: string) => void
}

export function StoryProjectHeader({
  id,
  projects,
  hasOutput,
  unsavedChanges,
  disabled,
  onSelect
}: HeaderProps) {
  const text = useStoryLanguage()
  return (
    <div className="story-project-header flex w-full flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-semibold">
        {hasOutput
          ? text('Your clip', 'Clipul tău')
          : text('Your project', 'Proiectul tău')}
      </h2>
      <div className="story-project-actions flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
        {projects.length > 0 && (
          <select
            className="story-select story-project-picker"
            aria-label={text('Open project', 'Deschide proiectul')}
            value={id}
            disabled={disabled}
            onChange={(event) => onSelect(event.target.value)}
          >
            <option value="">{text('New project', 'Proiect nou')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.options?.brief?.slice(0, 40) ||
                  project.assets?.[0]?.name ||
                  text('Untitled project', 'Proiect fără titlu')}
              </option>
            ))}
          </select>
        )}
        {id && (
          <Button
            variant="outline"
            aria-label={text('New project', 'Proiect nou')}
            disabled={disabled}
            onClick={() => onSelect('')}
          >
            <Plus />
            <span className="story-new-project-label">
              {text('New project', 'Proiect nou')}
            </span>
          </Button>
        )}
      </div>
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
  const text = useStoryLanguage()
  if (project.status === 'draft') return null
  const hasResult = project.versions.some(
    (version) => version.number === project.current_version
  )
  if (hasResult) {
    const failed =
      project.status === 'failed' || project.operation_status === 'failed'
    if (!active && !failed && project.status !== 'cancelled')
      return null
    return (
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
        role={failed ? 'alert' : 'status'}
        data-testid="story-operation"
      >
        <span className="flex items-center gap-2">
          {(active || busy) && <LoadingIndicator className="size-4" />}
          {active || busy
            ? text('Processing…', 'Se procesează…')
            : failed
              ? text(
                  'The last update did not finish. Open your saved video in Studio to continue.',
                  'Ultima modificare nu s-a finalizat. Deschide videoul salvat în Studio pentru a continua.'
                )
              : project.status === 'cancelled'
                ? text(
                    'Cancelled. Your previous video is still available.',
                    'Anulat. Videoul anterior este disponibil.'
                  )
                : text(
                    'Your saved video is available in Studio.',
                    'Videoul salvat este disponibil în Studio.'
                  )}
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
  return (
    <StoryProcessing
      project={project}
      active={active}
      busy={busy}
      onCancel={onCancel}
    />
  )
}

interface DeleteProps {
  disabled: boolean
  onDelete: () => Promise<void>
}

export function StoryProjectDelete({ disabled, onDelete }: DeleteProps) {
  const text = useStoryLanguage()
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="w-full space-y-2">
      {confirming ? (
        <Card className="block space-y-3 p-4">
          <p className="text-sm">
            {text(
              'Delete this project and its source files, previews, and saved versions?',
              'Ștergi proiectul, fișierele sursă, previzualizările și versiunile salvate?'
            )}
          </p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={disabled}
              onClick={() => void onDelete()}
            >
              {text('Delete permanently', 'Șterge definitiv')}
            </Button>
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={() => setConfirming(false)}
            >
              {text('Keep', 'Păstrează')}
            </Button>
          </div>
        </Card>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => setConfirming(true)}
        >
          {text('Delete project', 'Șterge proiectul')}
        </Button>
      )}
    </div>
  )
}
