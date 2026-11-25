import { useId } from 'react'
import { Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MusicTrack, StoryMusicOptions } from './types'
import { StoryMusicRange } from './story-music-range'
import { useStoryMusicTrack, useUploadedMusicPreview } from './use-story-music'
import { useStoryLanguage } from './use-story-language'
import { StoryMusicSourceAudio } from './story-music-source-audio'

type PreviewTrack = Pick<MusicTrack, 'id' | 'title' | 'preview_url'>
type Text = ReturnType<typeof useStoryLanguage>

const SYNC_NOTE = (text: Text) =>
  text(
    'Uses the song’s sections and mood to shape pacing and transitions. Does not snap cuts to exact beats. Complete actions and retained speech come first.',
    'Folosește secțiunile și atmosfera piesei pentru ritmul montajului și tranziții. Nu aliniază tăieturile exact pe bătăi. Acțiunile complete și vorbirea păstrată au prioritate.'
  )

/**
 * The chosen track: its name, load status, volume, follow-the-music switch, excerpt and the
 * source audio controls. Credits are shown where the track is chosen, in the music picker.
 */
export function StoryMusicSelection({
  value,
  disabled,
  narration = false,
  onChange,
  onRemove,
  onPreview
}: {
  value: StoryMusicOptions
  disabled: boolean
  narration?: boolean
  onChange: (music: StoryMusicOptions) => void
  onRemove: () => void
  onPreview: (track: PreviewTrack) => void
}) {
  const text = useStoryLanguage()
  const track = useSelectedMusic(value)
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4 rounded-md border p-3" data-testid="selected-music">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="break-words text-sm font-medium">{track.title}</p>
          {value.upload_reference && (
            <p className="text-xs text-muted-foreground">{text('Your uploaded audio', 'Fișierul tău audio')}</p>
          )}
          <SelectedTrackStatus status={track.status} onRetry={track.retry} />
        </div>
        <div className="flex shrink-0 gap-1">
          {track.preview && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={text('Preview selected music', 'Ascultă muzica selectată')}
              onClick={() => track.preview && onPreview(track.preview)}
            >
              <Play className="size-4" aria-hidden="true" />
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon" aria-label={text('Remove music', 'Elimină muzica')} onClick={onRemove}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <MusicVolumeField value={value} onChange={onChange} />
      <MusicFollowField value={value} onChange={onChange} />
      <StoryMusicRange value={value} onChange={onChange} />
      {narration ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {text(
            'Your full recorded narration stays audible. Original video sound is not used.',
            'Narațiunea înregistrată rămâne integrală și audibilă. Sunetul original al filmărilor nu este folosit.'
          )}
        </p>
      ) : (
        <StoryMusicSourceAudio value={value} onChange={onChange} />
      )}
      {value.volume === 0 && <MutedMusicNotice value={value} narration={narration} />}
    </fieldset>
  )
}

/** Resolves the display name, preview and load state of the selected track or uploaded file. */
function useSelectedMusic(value: StoryMusicOptions) {
  const text = useStoryLanguage()
  const selected = useStoryMusicTrack(value.track_id)
  const uploaded = useUploadedMusicPreview(value.upload_reference)
  const uploadedTitle = value.title || text('Uploaded music', 'Muzică încărcată')

  if (value.upload_reference) {
    return {
      title: uploadedTitle,
      preview: uploaded.data
        ? { id: value.upload_reference, title: uploadedTitle, preview_url: uploaded.data.url }
        : undefined,
      status: uploaded.isLoading ? 'loading' : uploaded.isError ? 'error' : 'ready',
      retry: () => void uploaded.refetch()
    } as const
  }
  return {
    title: selected.data?.title ?? text('Selected music', 'Muzica selectată'),
    preview: selected.data,
    status: selected.isLoading ? 'loading' : selected.isError ? 'error' : 'ready',
    retry: () => void selected.refetch()
  } as const
}

function SelectedTrackStatus({ status, onRetry }: { status: 'loading' | 'error' | 'ready'; onRetry: () => void }) {
  const text = useStoryLanguage()
  if (status === 'loading')
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {text('Loading track details…', 'Se încarcă detaliile piesei…')}
      </p>
    )
  if (status === 'error')
    return (
      <div role="status" className="space-y-2 text-xs text-muted-foreground">
        <p>
          {text(
            'Track details are unavailable. Your choice is still saved.',
            'Detaliile piesei nu sunt disponibile. Alegerea ta este salvată.'
          )}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {text('Retry track details', 'Reîncearcă detaliile piesei')}
        </Button>
      </div>
    )
  return null
}

function MusicVolumeField({ value, onChange }: { value: StoryMusicOptions; onChange: (music: StoryMusicOptions) => void }) {
  const text = useStoryLanguage()
  const id = useId()
  return (
    <div className="space-y-2">
      <label htmlFor={`${id}-volume`} className="flex items-center justify-between gap-3 text-xs">
        <span>{text('Music volume', 'Volumul muzicii')}</span>
        <span className="tabular-nums">{Math.round(value.volume * 100)}%</span>
      </label>
      <input
        id={`${id}-volume`}
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value.volume}
        onChange={(event) => onChange({ ...value, volume: Number(event.target.value) })}
        className="block w-full accent-foreground"
      />
    </div>
  )
}

function MusicFollowField({ value, onChange }: { value: StoryMusicOptions; onChange: (music: StoryMusicOptions) => void }) {
  const text = useStoryLanguage()
  const id = useId()
  return (
    <div className="flex items-start gap-2">
      <label className="flex flex-1 items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.sync}
          onChange={(event) => onChange({ ...value, sync: event.target.checked })}
          className="mt-0.5 size-4 shrink-0 accent-foreground"
          aria-describedby={`${id}-sync-note`}
        />
        {text('Follow the music', 'Urmărește muzica')}
      </label>
      <span id={`${id}-sync-note`} className="sr-only">
        {SYNC_NOTE(text)}
      </span>
    </div>
  )
}

function MutedMusicNotice({ value, narration }: { value: StoryMusicOptions; narration: boolean }) {
  const text = useStoryLanguage()
  const onlyMusic = !narration && value.source_audio === 'mute'
  return (
    <p role="status" className="text-xs leading-relaxed text-muted-foreground">
      {onlyMusic
        ? text(
            'Music is muted. With Music only, the video will have no sound.',
            'Volumul muzicii este zero. Cu Doar muzică, videoul nu va avea sunet.'
          )
        : text(
            'Music is muted. Music analysis and music-guided pacing are skipped.',
            'Volumul muzicii este zero. Analiza și montajul ghidat de muzică sunt omise.'
          )}
    </p>
  )
}
