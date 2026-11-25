import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Music2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import pill from './story-pill-buttons.module.css'
import type { MusicTrack, StoryMusicOptions } from './types'
import { StoryMusicPicker } from './story-music-picker'
import { StoryMusicPreview } from './story-music-preview'
import type { MusicUpload } from './story-music-upload'
import { StoryMusicSelection } from './story-music-selection'
import { useStoryMusicTrack } from './use-story-music'
import { useStoryLanguage } from './use-story-language'
import styles from './story-options.module.css'

type PreviewTrack = Pick<MusicTrack, 'id' | 'title' | 'preview_url'>

/** The selected track's preview, remembered with the selection it belongs to. */
interface SelectedPreview {
  track: PreviewTrack
  selection?: string
}

interface Props {
  value?: StoryMusicOptions | null
  disabled: boolean
  active: boolean
  narration?: boolean
  onChange: (music: StoryMusicOptions | null) => void
  onPending?: (pending: boolean) => void
}

/** The "Muzică de fundal" card: the row with "Alege muzică", then the selected track's controls. */
export function StoryMusic({ value, disabled, active, narration = false, onChange, onPending }: Props) {
  const text = useStoryLanguage()
  const queryClient = useQueryClient()
  const selected = useStoryMusicTrack(value?.upload_reference ? undefined : value?.track_id)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<SelectedPreview | null>(null)
  const selectionKey = value?.upload_reference || value?.track_id
  const currentName = value
    ? value.upload_reference
      ? value.title || text('Uploaded music', 'Muzică încărcată')
      : (selected.data?.title ?? text('Selected music', 'Muzica selectată'))
    : text('No music', 'Fără muzică')

  /** Carries the current levels over to a newly chosen source. */
  function nextSelection(source: Pick<StoryMusicOptions, 'track_id' | 'upload_reference' | 'title'>): StoryMusicOptions {
    return {
      ...source,
      track_id: source.track_id,
      volume: value?.volume ?? 0.18,
      sync: value?.sync ?? true,
      source_audio: value?.source_audio ?? 'preserve',
      loop: true
    }
  }

  function select(track: MusicTrack) {
    queryClient.setQueryData(['music-track', track.id], track)
    setPreview(null)
    setPickerOpen(false)
    onChange(nextSelection({ track_id: track.id, upload_reference: undefined }))
  }

  function selectUpload(upload: MusicUpload) {
    if (upload.url) queryClient.setQueryData(['uploaded-music-preview', upload.file_path], { url: upload.url })
    setPreview(null)
    setPickerOpen(false)
    onChange(
      nextSelection({
        track_id: '',
        upload_reference: upload.file_path,
        title: upload.file_name
      })
    )
  }

  return (
    <fieldset disabled={disabled} className={`${styles.card} ${styles.fieldsetCard}`} data-testid="story-music">
      <legend className="sr-only">{text('Background music', 'Muzică de fundal')}</legend>
      <div className={styles.cardHeader}>
        <div className={styles.headerLead}>
          <span className={styles.iconTile} aria-hidden="true">
            <Music2 className="size-5" />
          </span>
          <div className={styles.headerText}>
            <h3 className={styles.cardTitle}>{text('Background music', 'Muzică de fundal')}</h3>
            <p className={styles.subtle}>{currentName}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`${pill.pill} ${pill.outline} ${styles.pickButton}`}
          disabled={uploading}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={() => {
            setPreview(null)
            setPickerOpen(true)
          }}
        >
          {text('Choose music', 'Alege muzică')}
        </Button>
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
          onPreview={(track) => setPreview({ track, selection: selectionKey })}
        />
      )}
      {value && preview && preview.selection === selectionKey && (
        <StoryMusicPreview
          key={preview.track.id}
          track={preview.track}
          active={active && !disabled && !uploading && !pickerOpen}
          startSeconds={value.start_seconds}
          endSeconds={value.end_seconds}
          onClose={() => setPreview(null)}
        />
      )}
      <StoryMusicPicker
        open={pickerOpen}
        selectedID={value?.track_id}
        uploading={uploading}
        onOpenChange={setPickerOpen}
        onSelect={select}
        onUpload={selectUpload}
        onPending={(pending) => {
          setUploading(pending)
          onPending?.(pending)
        }}
      />
    </fieldset>
  )
}
