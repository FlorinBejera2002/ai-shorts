import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold">
        {hasOutput
          ? text('Your story', 'Povestea ta')
          : text('Create a story', 'Creează o poveste')}
      </h1>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap">
        {projects.length > 0 && (
          <select
            className="story-select story-project-picker"
            aria-label={text('Open story project', 'Deschide proiectul')}
            value={id}
            disabled={disabled}
            onChange={(event) => onSelect(event.target.value)}
          >
            <option value="">{text('New story', 'Poveste nouă')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.options?.brief?.slice(0, 40) ||
                  project.assets?.[0]?.name ||
                  text('Untitled story', 'Poveste fără titlu')}
              </option>
            ))}
          </select>
        )}
        {id && (
          <Button variant="outline" disabled={disabled} onClick={() => onSelect('')}>
            <Plus />
            {text('New story', 'Poveste nouă')}
          </Button>
        )}
      </div>
      {unsavedChanges && (
        <p role="status" className="w-full text-sm text-muted-foreground">
          {text(
            'Continue to save your changes before switching projects.',
            'Continuă pentru a salva modificările înainte de a schimba proiectul.'
          )}
        </p>
      )}
    </div>
  )
}

interface StatusProps {
  project: StoryProject
  active: boolean
  busy: boolean
  onCancel: () => void
}

export function StoryProjectStatus({ project, active, busy, onCancel }: StatusProps) {
  if (project.status === 'draft') return null
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
              'Delete this story and its source files, previews, and saved versions?',
              'Ștergi povestea, fișierele sursă, previzualizările și versiunile salvate?'
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
