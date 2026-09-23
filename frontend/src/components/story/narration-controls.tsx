import { Pause, Play, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/youtube'
import { useStoryLanguage } from './use-story-language'
import type { useNarrationRecorder } from './use-narration-recorder'

type Recorder = ReturnType<typeof useNarrationRecorder>

export function NarrationRecording({
  recorder,
  onDiscard
}: {
  recorder: Recorder
  onDiscard: () => void
}) {
  const text = useStoryLanguage()
  const statuses = {
    idle: '',
    requesting: text(
      'Waiting for microphone permission…',
      'Se așteaptă permisiunea pentru microfon…'
    ),
    stopping: text('Preparing your recording…', 'Se pregătește înregistrarea…'),
    paused: text('Recording paused', 'Înregistrare întreruptă'),
    recording: text('Recording', 'Se înregistrează')
  }
  return (
    <div className="space-y-3 rounded-md bg-muted p-4">
      <p role="status" className="text-sm font-medium">
        {statuses[recorder.phase]}
      </p>
      {recorder.phase !== 'requesting' && (
        <p
          className="font-mono text-2xl tabular-nums"
          aria-label={text('Recording time', 'Durata înregistrării')}
        >
          {formatDuration(recorder.seconds)}{' '}
          <span className="text-sm text-muted-foreground">/ 3:00</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {['recording', 'paused'].includes(recorder.phase) && (
          <>
            <Button variant="outline" onClick={recorder.pause}>
              {recorder.phase === 'paused' ? <Play /> : <Pause />}
              {recorder.phase === 'paused'
                ? text('Resume recording', 'Continuă înregistrarea')
                : text('Pause recording', 'Pauză')}
            </Button>
            <Button onClick={recorder.stop}>
              <Square />
              {text('Stop recording', 'Oprește înregistrarea')}
            </Button>
          </>
        )}
        <Button variant="ghost" onClick={onDiscard}>
          {text('Cancel recording', 'Anulează înregistrarea')}
        </Button>
      </div>
    </div>
  )
}

interface PreviewProps {
  draft: NonNullable<Recorder['draft']>
  replacing: boolean
  saving: 'uploading' | 'validating' | null
  failed: boolean
  onDuration: (duration: number) => void
  onSave: () => void
  onRecord: () => void
  onDiscard: () => void
}

export function NarrationPreview({
  draft,
  replacing,
  saving,
  failed,
  onDuration,
  onSave,
  onRecord,
  onDiscard
}: PreviewProps) {
  const text = useStoryLanguage()
  return (
    <div className="space-y-3 rounded-md border p-4" data-testid="narration-draft">
      <p className="break-all text-sm font-medium">{draft.file.name}</p>
      <audio
        controls
        preload="metadata"
        src={draft.url}
        className="w-full"
        aria-label={text('Narration preview', 'Previzualizare narațiune')}
        onLoadedMetadata={(event) => onDuration(event.currentTarget.duration)}
      />
      <p className="text-xs text-muted-foreground">
        {text(
          'Listen before saving. Your audio stays on this device until you save it.',
          'Ascultă înainte de salvare. Sunetul rămâne pe acest dispozitiv până când îl salvezi.'
        )}
        {replacing &&
          ` ${text('Your saved narration stays available until the replacement is saved successfully.', 'Narațiunea salvată rămâne disponibilă până când înlocuirea este salvată cu succes.')}`}
      </p>
      {saving && (
        <p role="status" className="text-sm">
          {saving === 'uploading'
            ? text('Uploading narration…', 'Se încarcă narațiunea…')
            : text('Validating narration…', 'Se verifică narațiunea…')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={Boolean(saving)} onClick={onSave}>
          {text(
            failed ? 'Retry saving narration' : 'Save narration',
            failed ? 'Reîncearcă salvarea' : 'Salvează narațiunea'
          )}
        </Button>
        <Button variant="outline" disabled={Boolean(saving)} onClick={onRecord}>
          {text('Record again', 'Înregistrează din nou')}
        </Button>
        <Button variant="ghost" disabled={Boolean(saving)} onClick={onDiscard}>
          {text('Discard audio', 'Renunță la acest audio')}
        </Button>
      </div>
    </div>
  )
}
