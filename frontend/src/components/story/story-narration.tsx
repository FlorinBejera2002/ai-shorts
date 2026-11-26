import { useEffect, useId, useRef } from 'react'
import { Check, Mic, Upload } from 'lucide-react'
import { useLocale } from 'next-intl'
import { Button } from '@/components/ui/button'
import { formatBytes, formatDuration } from '@/lib/youtube'
import type { StoryAsset, StoryProject } from './types'
import { useStoryLanguage } from './use-story-language'
import { useNarrationRecorder } from './use-narration-recorder'
import { useNarrationSave } from './use-narration-save'
import { narrationErrorMessages } from './narration-messages'
import { NarrationPreview, NarrationRecording } from './narration-controls'
import pill from './story-pill-buttons.module.css'
import styles from './story-options.module.css'

interface Props {
  projectID: string
  asset?: StoryAsset
  disabled: boolean
  onSaved: (project: StoryProject) => Promise<unknown>
  onPending: (pending: boolean) => void
  onRemove: (id: string) => void
}

/** The "Narațiunea ta" card: record or choose a voice track, then save it to the project. */
export function StoryNarration({ projectID, asset, disabled, onSaved, onPending, onRemove }: Props) {
  const text = useStoryLanguage()
  const titleID = useId()
  const containerRef = useRef<HTMLElement>(null)
  const recorder = useNarrationRecorder(containerRef)
  const input = useRef<HTMLInputElement>(null)
  const narrationSave = useNarrationSave({ projectID, asset, onSaved })
  const recording = recorder.phase !== 'idle'
  const pending = recording || Boolean(recorder.draft) || Boolean(narrationSave.saving)

  useEffect(() => {
    onPending(pending)
    return () => onPending(false)
  }, [pending, onPending])

  function discard() {
    recorder.cancel()
    narrationSave.forget()
  }

  /** Choosing a file during a recording discards the recording first, as the canvas link does. */
  function chooseFile() {
    if (recording) discard()
    input.current?.click()
  }

  async function save() {
    const draft = recorder.draft
    if (!draft || disabled) return
    if (await narrationSave.save(draft.file)) recorder.cancel()
  }

  return (
    <section ref={containerRef} className={styles.card} data-testid="story-narration" aria-labelledby={titleID}>
      <div className={styles.cardHeader}>
        <h2 id={titleID} className={styles.cardTitle}>
          {text('Your narration', 'Narațiunea ta')}
        </h2>
        <p className={styles.subtle}>
          {text('Up to 3 minutes · 32 MB', 'Maximum 3 minute · 32 MB')}
        </p>
      </div>
      {asset && <SavedNarration asset={asset} locked={disabled || pending} onRemove={onRemove} />}
      {!disabled && (
        <>
          {!recording && !recorder.draft && (
            <div className={styles.actionRow}>
              <Button
                type="button"
                className={`${pill.pill} ${pill.primary}`}
                onClick={() => {
                  narrationSave.clearFailure()
                  void recorder.start()
                }}
              >
                <Mic />
                {text(
                  asset ? 'Record a replacement' : 'Record narration',
                  asset ? 'Înregistrează din nou' : 'Înregistrează narațiunea',
                  asset ? 'Grabar de nuevo' : 'Grabar narración'
                )}
              </Button>
            </div>
          )}
          <input
            ref={input}
            type="file"
            className="hidden"
            accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg"
            aria-label={text('Upload narration audio', 'Încarcă narațiunea audio')}
            disabled={Boolean(narrationSave.saving)}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) {
                narrationSave.clearFailure()
                narrationSave.forget()
                recorder.choose(file)
              }
            }}
          />
          {recording && <NarrationRecording recorder={recorder} onDiscard={discard} />}
          {!recorder.draft && (
            <div className={styles.centered}>
              <Button
                type="button"
                variant="ghost"
                className={`${pill.pill} ${pill.ghost}`}
                onClick={chooseFile}
              >
                <Upload />
                {text('Choose audio file', 'Alege un fișier audio')}
              </Button>
            </div>
          )}
          {recorder.draft && (
            <NarrationPreview
              draft={recorder.draft}
              replacing={Boolean(asset)}
              saving={narrationSave.saving}
              failed={narrationSave.saveFailed}
              onDuration={recorder.inspectDuration}
              onSave={() => void save()}
              onRecord={() => {
                discard()
                void recorder.start()
              }}
              onDiscard={discard}
            />
          )}
        </>
      )}
      {recorder.error && (
        <p role="alert" className="text-sm text-destructive">
          {narrationErrorMessages(text)[recorder.error]}
        </p>
      )}
    </section>
  )
}

function SavedNarration({
  asset,
  locked,
  onRemove
}: {
  asset: StoryAsset
  locked: boolean
  onRemove: (id: string) => void
}) {
  const text = useStoryLanguage()
  const locale = useLocale()
  return (
    <div className={styles.recording} data-testid="saved-narration">
      <p className="flex items-start gap-2 break-words text-sm font-medium">
        <Check className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0 break-words">{asset.name}</span>
      </p>
      <p className={styles.subtle}>
        {text('Saved narration', 'Narațiune salvată')} · {formatDuration(asset.duration)} ·{' '}
        {formatBytes(asset.size, locale)}
      </p>
      {asset.source_url && (
        <audio
          controls
          preload="metadata"
          src={asset.source_url}
          className="w-full"
          aria-label={text('Saved narration playback', 'Ascultă narațiunea salvată')}
        />
      )}
      {!locked && (
        <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => onRemove(asset.id)}>
          {text('Remove narration', 'Elimină narațiunea')}
        </Button>
      )}
    </div>
  )
}
