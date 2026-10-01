import {
  AudioLines,
  Check,
  CircleAlert,
  Clock3,
  Film,
  ListVideo,
  Pause,
  SearchCheck,
  Sparkles,
  type LucideIcon
} from 'lucide-react'
import {
  ProcessingPipeline,
  type ProcessingStage
} from '@/components/jobs/processing-pipeline'
import { Button } from '@/components/ui/button'
import type { StoryProject } from './types'
import { useStoryLanguage } from './use-story-language'
import './story-processing.css'

const checkpointKeys = [
  'pending',
  'analyzing',
  'building_story',
  'editing',
  'reviewing'
] as const
const runningPhases = new Set<string>([...checkpointKeys, 'improving'])

interface Props {
  project: StoryProject
  active: boolean
  busy: boolean
  onCancel: () => void
}

function displayPhase(project: StoryProject) {
  if (project.status === 'queued') return 'pending'
  if (project.status === 'rendering') return 'editing'
  if (
    project.status === 'processing' &&
    project.stage &&
    runningPhases.has(project.stage)
  )
    return project.stage
  return project.status
}

function checkpointState(
  key: string,
  index: number,
  phase: string
): ProcessingStage['state'] {
  if (phase === 'ready') return 'done'
  if (phase === 'needs_review') return key === 'reviewing' ? 'attention' : 'done'
  // Repairs can precede the first render. Their position is not a completion count.
  if (phase === 'improving') return index < 2 ? 'done' : 'waiting'
  const current = checkpointKeys.findIndex((checkpoint) => checkpoint === phase)
  if (current < 0) return 'waiting'
  return index < current ? 'done' : index === current ? 'active' : 'waiting'
}

export function StoryProcessing({ project, active, busy, onCancel }: Props) {
  const text = useStoryLanguage()
  const phase = displayPhase(project)
  const message =
    phase === 'pending' && project.message?.trim().toLowerCase() === 'queued'
      ? ''
      : (project.message ?? '')
  const copy: Record<string, { label: string; detail: string; icon: LucideIcon }> = {
    pending: {
      label: text('Queued', 'În așteptare'),
      detail: text(
        'Your files are saved. Your story is waiting to start.',
        'Fișierele sunt salvate. Povestea așteaptă să înceapă.'
      ),
      icon: Clock3
    },
    analyzing: {
      label: text('Understanding your clips', 'Analizăm filmările'),
      detail: text(
        'Checking speech and footage for your story.',
        'Analizăm vorbirea și imaginile pentru povestea ta.'
      ),
      icon: AudioLines
    },
    building_story: {
      label: text('Building your story', 'Construim povestea'),
      detail: text(
        'Choosing moments and arranging the story.',
        'Alegem momentele și construim firul poveștii.'
      ),
      icon: ListVideo
    },
    editing: {
      label: text('Editing your story', 'Montăm povestea'),
      detail: text(
        'Putting the selected moments together.',
        'Punem împreună momentele selectate.'
      ),
      icon: Film
    },
    reviewing: {
      label: text('Checking your edit', 'Verificăm montajul'),
      detail: text(
        'Reviewing the picture, sound and story.',
        'Verificăm imaginea, sunetul și povestea.'
      ),
      icon: SearchCheck
    },
    improving: {
      label: text('Improving your story', 'Îmbunătățim povestea'),
      detail: text(
        'Refining the story or edit before another check.',
        'Ajustăm povestea sau montajul înaintea unei noi verificări.'
      ),
      icon: Sparkles
    },
    ready: {
      label: text('Ready', 'Pregătit'),
      detail: text(
        'Your reviewed version is available below.',
        'Versiunea verificată este disponibilă mai jos.'
      ),
      icon: Check
    },
    needs_review: {
      label: text('Needs review', 'Necesită revizie'),
      detail: text(
        'Some checks or issues in this draft still need your attention.',
        'Unele verificări sau probleme ale acestui draft necesită atenția ta.'
      ),
      icon: CircleAlert
    },
    failed: {
      label: text('Processing failed', 'Procesarea a eșuat'),
      detail: text(
        'Processing stopped. Your source files remain available.',
        'Procesarea s-a oprit. Fișierele originale rămân disponibile.'
      ),
      icon: CircleAlert
    },
    cancelled: {
      label: text('Cancelled', 'Anulat'),
      detail: text(
        'Processing stopped. Your source files remain available.',
        'Procesarea s-a oprit. Fișierele originale rămân disponibile.'
      ),
      icon: Pause
    },
    cancelling: {
      label: text('Cancelling', 'Se anulează'),
      detail: text('Waiting for processing to stop.', 'Așteptăm oprirea procesării.'),
      icon: Pause
    },
    deleting: {
      label: text('Deleting project', 'Se șterge proiectul'),
      detail: text(
        'Removing this project and its files.',
        'Ștergem proiectul și fișierele sale.'
      ),
      icon: Clock3
    }
  }
  const focus = copy[phase] ?? {
    label: text('Processing', 'Se procesează'),
    detail: text('Waiting for the next update.', 'Așteptăm următoarea actualizare.'),
    icon: Clock3
  }
  const labels = [
    text('Queued', 'În așteptare'),
    text('Analyze', 'Analiză'),
    text('Story', 'Poveste'),
    text('Edit', 'Montaj'),
    text('Review', 'Verificare')
  ]
  const current = checkpointKeys.findIndex((key) => key === phase)
  const running = active && runningPhases.has(phase)
  const stageLabel =
    current >= 0 ? `${String(current + 1).padStart(2, '0')} / 05` : undefined
  const countLabel =
    current >= 0
      ? `${text('Step', 'Pasul')} ${current + 1} ${text('of', 'din')} 5`
      : undefined
  const tone =
    phase === 'failed'
      ? 'error'
      : phase === 'ready'
        ? 'success'
        : running
          ? 'active'
          : 'idle'
  const states = {
    done: text('Completed', 'Finalizat'),
    active: text('In progress', 'În lucru'),
    waiting: text('Not confirmed', 'Neconfirmat'),
    attention: text('Needs review', 'Necesită revizie')
  }

  return (
    <ProcessingPipeline
      className="story-processing"
      testID="story-processing"
      status={project.status}
      title={text('Your story', 'Povestea ta')}
      eyebrow={
        phase === 'pending'
          ? text('Waiting to start', 'În așteptarea pornirii')
          : running
            ? text('Working on your story', 'Pregătim povestea')
            : focus.label
      }
      countLabel={countLabel}
      stage={{ key: phase, ...focus }}
      stageLabel={stageLabel}
    message={message}
      running={running}
      tone={tone}
      progress={
        running
          ? {
              label:
                phase === 'pending'
                  ? text('Waiting to start', 'În așteptarea pornirii')
                  : text('In progress', 'În lucru'),
              ariaLabel: text('Story processing', 'Procesarea poveștii')
            }
          : undefined
      }
      stages={checkpointKeys.map((key, index) => {
        const state = checkpointState(key, index, phase)
        return { key, label: labels[index], state, stateLabel: states[state] }
      })}
    >
      {(project.error || active) && (
        <div className="job-processing-result story-processing-actions">
          {project.error && (
            <p role="alert" className="break-words text-sm text-destructive">
              {project.error}
            </p>
          )}
          {active && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy || phase === 'cancelling'}
              onClick={onCancel}
            >
              {text('Cancel processing', 'Anulează procesarea')}
            </Button>
          )}
        </div>
      )}
    </ProcessingPipeline>
  )
}
