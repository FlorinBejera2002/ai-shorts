import { useEffect, useRef, useState } from 'react'
import { Check, Mic, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatBytes, formatDuration } from '@/lib/youtube'
import { storyRequest, uploadNarration } from './api'
import type { StoryAsset, StoryProject } from './types'
import { useStoryLanguage } from './use-story-language'
import { useNarrationRecorder, type RecordingError } from './use-narration-recorder'
import { NarrationPreview, NarrationRecording } from './narration-controls'
import { StoryHelp } from './story-help'

interface Props {
  projectID: string
  asset?: StoryAsset
  disabled: boolean
  onSaved: (project: StoryProject) => Promise<unknown>
  onPending: (pending: boolean) => void
  onRemove: (id: string) => void
}

export function StoryNarration({
  projectID,
  asset,
  disabled,
  onSaved,
  onPending,
  onRemove
}: Props) {
  const text = useStoryLanguage()
  const containerRef = useRef<HTMLDivElement>(null)
  const recorder = useNarrationRecorder(containerRef)
  const input = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState<'uploading' | 'validating' | null>(null)
  const [error, setError] = useState('')
  const operation = useRef<AbortController | null>(null)
  const uploaded = useRef<{
    file: File
    id: string
    reference?: string
  } | null>(null)
  const mounted = useRef(true)
  const recording = recorder.phase !== 'idle'
  const pending = recording || Boolean(recorder.draft) || Boolean(saving)

  useEffect(() => {
    onPending(pending)
    return () => onPending(false)
  }, [pending, onPending])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      queueMicrotask(() => {
        if (!mounted.current) operation.current?.abort()
      })
    }
  }, [])

  const errors: Record<RecordingError, string> = {
    unsupported: text(
      'Recording is unavailable in this browser. Choose an audio file instead.',
      'Înregistrarea nu este disponibilă în acest browser. Alege un fișier audio.'
    ),
    permission: text(
      'Microphone permission was denied. Allow access in your browser, or choose an audio file.',
      'Accesul la microfon a fost refuzat. Permite accesul din browser sau alege un fișier audio.'
    ),
    device: text(
      'The microphone is unavailable or in use. Check your device, or choose an audio file.',
      'Microfonul nu este disponibil sau este ocupat. Verifică dispozitivul sau alege un fișier audio.'
    ),
    recording: text(
      'Recording stopped unexpectedly. Please record again or choose an audio file.',
      'Înregistrarea s-a oprit neașteptat. Înregistrează din nou sau alege un fișier audio.'
    ),
    empty: text(
      'The audio is empty. Record a longer message or choose another file.',
      'Fișierul audio este gol. Înregistrează un mesaj mai lung sau alege alt fișier.'
    ),
    size: text(
      'Narration must be no larger than 32 MB. Choose a smaller file or record a shorter message.',
      'Narațiunea trebuie să aibă cel mult 32 MB. Alege un fișier mai mic sau înregistrează un mesaj mai scurt.'
    ),
    duration: text(
      'Narration can be up to 3 minutes. Choose a shorter recording.',
      'Narațiunea poate avea cel mult 3 minute. Alege o înregistrare mai scurtă.'
    ),
    format: text(
      'Choose an M4A, MP3, WAV, WebM or Ogg audio file.',
      'Alege un fișier audio M4A, MP3, WAV, WebM sau Ogg.'
    )
  }

  async function save() {
    const draft = recorder.draft
    if (!draft || operation.current || disabled) return
    const controller = new AbortController()
    operation.current = controller
    if (uploaded.current?.file !== draft.file)
      uploaded.current = { file: draft.file, id: crypto.randomUUID() }
    const attempt = uploaded.current
    setError('')
    setSaving(attempt.reference ? 'validating' : 'uploading')
    try {
      if (!attempt.reference)
        attempt.reference = await uploadNarration(draft.file, controller.signal)
      if (!mounted.current) return
      setSaving('validating')
      const updated = await storyRequest<StoryProject>(
        `/api/stories/${projectID}/assets`,
        'POST',
        {
          id: attempt.id,
          reference: attempt.reference,
          name: draft.file.name,
          kind: 'narration',
          ...(asset ? { replace_asset_id: asset.id } : {})
        },
        controller.signal
      )
      await onSaved(updated)
      if (mounted.current) {
        recorder.cancel()
        uploaded.current = null
      }
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : text(
                'Could not save narration. Try again.',
                'Narațiunea nu a putut fi salvată. Încearcă din nou.'
              )
        )
    } finally {
      operation.current = null
      if (mounted.current) setSaving(null)
    }
  }

  function discard() {
    recorder.cancel()
    uploaded.current = null
    setError('')
  }

  return (
    <div
      ref={containerRef}
      className="space-y-4 border-t pt-5"
      data-testid="story-narration"
    >
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium">
          {text('Your narration', 'Narațiunea ta')}
          <StoryHelp label={text('Your narration', 'Narațiunea ta')}>
            {text(
              'Add your voice. We match your footage to your words and keep the full narration. Your voice replaces the clip audio.',
              'Adaugă vocea ta. Potrivim imaginile cu ce spui și păstrăm întreaga narațiune. Vocea ta înlocuiește sunetul filmărilor.'
            )}
          </StoryHelp>
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">
          {text('Up to 3 minutes · 32 MB', 'Maximum 3 minute · 32 MB')}
        </p>
      </div>
      {asset && (
        <div className="space-y-2 rounded-md border p-3" data-testid="saved-narration">
          <p className="flex items-start gap-2 break-words text-sm font-medium">
            <Check className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 break-words">{asset.name}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {text('Saved narration', 'Narațiune salvată')} ·{' '}
            {formatDuration(asset.duration)} · {formatBytes(asset.size)}
          </p>
          {asset.source_url && (
            <audio
              controls
              preload="metadata"
              src={asset.source_url}
              className="w-full"
              aria-label={text(
                'Saved narration playback',
                'Ascultă narațiunea salvată'
              )}
            />
          )}
          {!disabled && !pending && (
            <Button variant="ghost" size="sm" onClick={() => onRemove(asset.id)}>
              {text('Remove narration', 'Elimină narațiunea')}
            </Button>
          )}
        </div>
      )}
      {!disabled && (
        <>
          {!recording && !recorder.draft && (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setError('')
                  void recorder.start()
                }}
              >
                <Mic />
                {text(
                  asset ? 'Record a replacement' : 'Record narration',
                  asset ? 'Înregistrează din nou' : 'Înregistrează narațiunea'
                )}
              </Button>
              <Button variant="outline" onClick={() => input.current?.click()}>
                <Upload />
                {text('Choose audio file', 'Alege un fișier audio')}
              </Button>
            </div>
          )}
          <input
            ref={input}
            type="file"
            className="hidden"
            accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg"
            aria-label={text('Upload narration audio', 'Încarcă narațiunea audio')}
            disabled={recording || Boolean(saving)}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) {
                setError('')
                uploaded.current = null
                recorder.choose(file)
              }
            }}
          />
          {recording && <NarrationRecording recorder={recorder} onDiscard={discard} />}
          {recorder.draft && (
            <NarrationPreview
              draft={recorder.draft}
              replacing={Boolean(asset)}
              saving={saving}
              failed={Boolean(error)}
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
      {(error || recorder.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || (recorder.error && errors[recorder.error])}
        </p>
      )}
    </div>
  )
}
