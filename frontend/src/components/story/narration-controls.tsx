import { Pause, Play, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/youtube'
import { useStoryLanguage } from './use-story-language'
import type { useNarrationRecorder } from './use-narration-recorder'
import pill from './story-pill-buttons.module.css'
import styles from './story-options.module.css'

type Recorder = ReturnType<typeof useNarrationRecorder>

/**
 * The live recording band holds only the status, timer and a cancel control. Pauză and Oprește sit
 * below the band, as on the canvas. The canvas has no waveform and no helper text.
 */
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
    requesting: text('Waiting for microphone permission…', 'Se așteaptă permisiunea pentru microfon…'),
    stopping: text('Preparing your recording…', 'Se pregătește înregistrarea…'),
    paused: text('Recording paused', 'Înregistrare întreruptă'),
    recording: text('Recording', 'Se înregistrează')
  }
  const live = ['recording', 'paused'].includes(recorder.phase)
  return (
    <>
      <div className={`${styles.recording} ${styles.recordingLive}`} data-testid="narration-recording">
        <div className={styles.recordingHead}>
          <p role="status" className={styles.recordingStatus}>
            {recorder.phase === 'recording' && (
              <span className={styles.recordingDot} aria-hidden="true" />
            )}
            {statuses[recorder.phase]}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`${pill.pill} ${pill.ghost} ${styles.recordingCancel}`}
            aria-label={text('Cancel recording', 'Anulează înregistrarea')}
            title={text('Cancel recording', 'Anulează înregistrarea')}
            onClick={onDiscard}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        {recorder.phase !== 'requesting' && (
          <p
            className={styles.recordingTime}
            aria-label={text('Recording time', 'Durata înregistrării')}
          >
            {formatDuration(recorder.seconds)}
          </p>
        )}
      </div>
      {live && (
        <div className={styles.actionRow}>
          <Button type="button" className={`${pill.pill} ${pill.outline}`} onClick={recorder.pause}>
            {recorder.phase === 'paused' ? <Play /> : <Pause />}
            {recorder.phase === 'paused'
              ? text('Resume recording', 'Continuă înregistrarea')
              : text('Pause', 'Pauză')}
          </Button>
          <Button type="button" className={`${pill.pill} ${pill.primary}`} onClick={recorder.stop}>
            <Square />
            {text('Stop', 'Oprește')}
          </Button>
        </div>
      )}
    </>
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
    <div className={styles.recording} data-testid="narration-draft">
      <p className="break-all text-sm font-medium">{draft.file.name}</p>
      <audio
        controls
        preload="metadata"
        src={draft.url}
        className="w-full"
        aria-label={text('Narration preview', 'Previzualizare narațiune')}
        onLoadedMetadata={(event) => onDuration(event.currentTarget.duration)}
      />
      <p className={styles.note}>
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
      <div className={styles.actionRow}>
        <Button
          type="button"
          className={`${pill.pill} ${pill.primary}`}
          disabled={Boolean(saving)}
          onClick={onSave}
        >
          {text(
            failed ? 'Retry saving narration' : 'Save narration',
            failed ? 'Reîncearcă salvarea' : 'Salvează narațiunea'
          )}
        </Button>
        <Button
          type="button"
          className={`${pill.pill} ${pill.outline}`}
          disabled={Boolean(saving)}
          onClick={onRecord}
        >
          {text('Record again', 'Înregistrează din nou')}
        </Button>
        <Button
          type="button"
          className={`${pill.pill} ${pill.ghost}`}
          disabled={Boolean(saving)}
          onClick={onDiscard}
        >
          {text('Discard audio', 'Renunță la acest audio')}
        </Button>
      </div>
    </div>
  )
}
