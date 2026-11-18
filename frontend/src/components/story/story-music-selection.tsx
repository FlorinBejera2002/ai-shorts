import { useId } from 'react'
import { Play, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MusicTrack, StoryMusicOptions } from './types'
import { StoryMusicRange } from './story-music-range'
import { useStoryMusicTrack, useUploadedMusicPreview } from './use-story-music'
import { useStoryLanguage } from './use-story-language'
import { StoryHelp } from './story-help'
import { StoryMusicSourceAudio } from './story-music-source-audio'

type PreviewTrack = Pick<MusicTrack, 'id' | 'title' | 'preview_url'>

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
  const id = useId()
  const selected = useStoryMusicTrack(value.track_id)
  const uploaded = useUploadedMusicPreview(value.upload_reference)
  const syncDescription = text(
    'Uses the song’s sections and mood to shape pacing and transitions. Does not snap cuts to exact beats. Complete actions and retained speech come first.',
    'Folosește secțiunile și atmosfera piesei pentru ritmul montajului și tranziții. Nu aliniază tăieturile exact pe bătăi. Acțiunile complete și vorbirea păstrată au prioritate.'
  )
  const selectedTrack = value.upload_reference
    ? uploaded.data
      ? {
          id: value.upload_reference,
          title: value.title || text('Uploaded music', 'Muzică încărcată'),
          preview_url: uploaded.data.url
        }
      : undefined
    : selected.data
  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-4 rounded-md border p-3"
      data-testid="selected-music"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="break-words text-sm font-medium">
            {value.upload_reference
              ? value.title || text('Uploaded music', 'Muzică încărcată')
              : (selected.data?.title ??
                text('Selected music', 'Muzica selectată'))}
          </p>
          {value.upload_reference && (
            <p className="text-xs text-muted-foreground">
              {text('Your uploaded audio', 'Fișierul tău audio')}
            </p>
          )}
          {!value.upload_reference && selected.data && (
            <p className="text-xs text-muted-foreground">
              {selected.data.artist} ·{' '}
              <a
                className="underline underline-offset-2"
                href={selected.data.license_url}
                target="_blank"
                rel="noreferrer"
              >
                {selected.data.license}
              </a>
            </p>
          )}

          {(value.upload_reference
            ? uploaded.isLoading
            : selected.isLoading) && (
            <p role="status" className="text-xs text-muted-foreground">
              {text('Loading track details…', 'Se încarcă detaliile piesei…')}
            </p>
          )}
          {(selected.isError || uploaded.isError) && (
            <div
              role="status"
              className="space-y-2 text-xs text-muted-foreground"
            >
              <p>
                {text(
                  'Track details are unavailable. Your choice is still saved.',
                  'Detaliile piesei nu sunt disponibile. Alegerea ta este salvată.'
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  void (value.upload_reference
                    ? uploaded.refetch()
                    : selected.refetch())
                }
              >
                {text('Retry track details', 'Reîncearcă detaliile piesei')}
              </Button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {selectedTrack && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={text(
                'Preview selected music',
                'Ascultă muzica selectată'
              )}
              onClick={() => onPreview(selectedTrack)}
            >
              <Play className="size-4" aria-hidden="true" />
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={text('Remove music', 'Elimină muzica')}
            onClick={onRemove}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <label
          htmlFor={`${id}-volume`}
          className="flex items-center justify-between gap-3 text-xs"
        >
          <span>{text('Music volume', 'Volumul muzicii')}</span>
          <span className="tabular-nums">
            {Math.round(value.volume * 100)}%
          </span>
        </label>
        <input
          id={`${id}-volume`}
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={value.volume}
          onChange={(event) =>
            onChange({ ...value, volume: Number(event.target.value) })
          }
          className="block w-full accent-foreground"
        />
      </div>
      <div className="flex items-start gap-2">
        <label className="flex flex-1 items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.sync}
            onChange={(event) =>
              onChange({ ...value, sync: event.target.checked })
            }
            className="mt-0.5 size-4 shrink-0 accent-foreground"
            aria-describedby={`${id}-sync-note`}
          />
          {text('Follow the music', 'Urmărește muzica')}
        </label>
        <span
          id={`${id}-sync-note`}
          className="sr-only"
        >
          {syncDescription}
        </span>
        <StoryHelp label={text('About music-guided pacing', 'Despre montajul ghidat de muzică')}>
          {syncDescription}
        </StoryHelp>
      </div>
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
      {value.volume === 0 && (
        <p role="status" className="text-xs leading-relaxed text-muted-foreground">
          {!narration && value.source_audio === 'mute'
            ? text(
                'Music is muted. With Music only, the video will have no sound.',
                'Volumul muzicii este zero. Cu Doar muzică, videoul nu va avea sunet.'
              )
            : text(
                'Music is muted. Music analysis and music-guided pacing are skipped.',
                'Volumul muzicii este zero. Analiza și montajul ghidat de muzică sunt omise.'
              )}
        </p>
      )}
    </fieldset>
  )
}
