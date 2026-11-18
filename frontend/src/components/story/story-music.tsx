import { useId, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Music2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MusicTrack, StoryMusicOptions } from './types'
import { StoryMusicCatalog } from './story-music-catalog'
import { StoryMusicPreview } from './story-music-preview'
import { StoryMusicUpload } from './story-music-upload'
import { StoryMusicSelection } from './story-music-selection'
import { useStoryLanguage } from './use-story-language'
import { StoryHelp } from './story-help'

export function StoryMusic({
  value,
  disabled,
  active,
  narration = false,
  onChange,
  onPending
}: {
  value?: StoryMusicOptions | null
  disabled: boolean
  active: boolean
  narration?: boolean
  onChange: (music: StoryMusicOptions | null) => void
  onPending?: (pending: boolean) => void
}) {
  const text = useStoryLanguage()
  const id = useId()
  const queryClient = useQueryClient()
  const [browsing, setBrowsing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<{
    track: Pick<MusicTrack, 'id' | 'title' | 'preview_url'>
    selection?: string
    selected?: boolean
  } | null>(null)
  const selectionKey = value?.upload_reference || value?.track_id

  function select(track: MusicTrack) {
    queryClient.setQueryData(['music-track', track.id], track)
    setPreview(null)
    onChange({
      track_id: track.id,
      volume: value?.volume ?? 0.18,
      sync: value?.sync ?? true,
      source_audio: value?.source_audio ?? 'preserve',
      loop: true
    })
  }

  return (
    <fieldset
      disabled={disabled}
      className="min-w-0 space-y-4 border-t pt-4"
      data-testid="story-music"
    >
      <legend className="sr-only">
        {text('Background music', 'Muzică de fundal')}
      </legend>
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Music2 className="size-4" aria-hidden="true" />
          {text('Background music', 'Muzică de fundal')}
          <StoryHelp label={text('Music credits', 'Creditele muzicale')}>
            {text(
              'Catalog music by Kevin MacLeod. Include the credits when publishing.',
              'Muzica din catalog este de Kevin MacLeod. Include creditele când publici.'
            )}
          </StoryHelp>
        </h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {text(
            'Choose free catalog music or upload your own audio.',
            'Alege muzică gratuită din catalog sau încarcă propriul fișier audio.'
          )}
        </p>
      </div>
      {value && (
        <StoryMusicSelection
          value={value}
          narration={narration}
          disabled={uploading}
          onChange={onChange}
          onRemove={() => {
            setPreview(null)
            onChange(null)
          }}
          onPreview={(track) =>
            setPreview({ track, selection: selectionKey, selected: true })
          }
        />
      )}
      {preview && preview.selection === selectionKey && (
        <StoryMusicPreview
          key={preview.track.id}
          track={preview.track}
          active={active && !disabled && !uploading}
          startSeconds={preview.selected ? value?.start_seconds : 0}
          endSeconds={preview.selected ? value?.end_seconds : 0}
          onClose={() => setPreview(null)}
        />
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between"
        disabled={uploading}
        aria-expanded={browsing}
        aria-controls={`${id}-catalog`}
        onClick={() => {
          setBrowsing(!browsing)
          setPreview(null)
        }}
      >
        {browsing
          ? text('Close music catalog', 'Închide catalogul muzical')
          : value
            ? text('Change music', 'Schimbă muzica')
            : text('Browse free music', 'Explorează muzica gratuită')}
        <ChevronDown
          className={`size-4 ${browsing ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </Button>
      <fieldset className="min-w-0" disabled={uploading} id={`${id}-catalog`}>
        {browsing && (
          <StoryMusicCatalog
            selectedID={value?.track_id}
            onSelect={select}
            onPreview={(track) =>
              setPreview({ track, selection: selectionKey })
            }
          />
        )}
      </fieldset>
      <StoryMusicUpload
        disabled={disabled}
        onPending={(pending) => {
          setUploading(pending)
          onPending?.(pending)
        }}
        onSelect={(upload) => {
          if (upload.url)
            queryClient.setQueryData(
              ['uploaded-music-preview', upload.file_path],
              { url: upload.url }
            )
          setPreview(null)
          setBrowsing(false)
          onChange({
            track_id: '',
            upload_reference: upload.file_path,
            title: upload.file_name,
            volume: value?.volume ?? 0.18,
            sync: value?.sync ?? true,
            source_audio: value?.source_audio ?? 'preserve',
            loop: true
          })
        }}
      />
    </fieldset>
  )
}
