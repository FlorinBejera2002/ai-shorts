import { useState } from 'react'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import theme from '@/components/calendar/publishing-theme.module.css'
import type { MusicTrack } from './types'
import { StoryMusicCatalog } from './story-music-catalog'
import { StoryMusicPreview } from './story-music-preview'
import { StoryMusicUpload, type MusicUpload } from './story-music-upload'
import { useStoryLanguage } from './use-story-language'
import styles from './story-options.module.css'

type PreviewTrack = Pick<MusicTrack, 'id' | 'title' | 'preview_url'>

interface Props {
  open: boolean
  selectedID?: string
  /** True while a music file uploads; the dialog then cannot be dismissed. */
  uploading: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (track: MusicTrack) => void
  onUpload: (upload: MusicUpload) => void
  onPending: (pending: boolean) => void
}

/**
 * The music chooser: the catalog search and the "De pe dispozitiv" upload live in one dialog,
 * so the music row only offers "Alege muzică".
 */
export function StoryMusicPicker({
  open,
  selectedID,
  uploading,
  onOpenChange,
  onSelect,
  onUpload,
  onPending
}: Props) {
  const text = useStoryLanguage()
  const [preview, setPreview] = useState<PreviewTrack | null>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!uploading) onOpenChange(next)
      }}
    >
      <DialogContent
        className={`${theme.surface} ${styles.dialog}`}
        overlayClassName={theme.overlay}
        data-reference-surface=""
        aria-describedby={undefined}
      >
        <DialogHeader className={styles.dialogHeader}>
          <div className={styles.dialogHeading}>
            <DialogTitle className={styles.dialogTitle}>
              {text('Background music', 'Muzică de fundal')}
            </DialogTitle>
          </div>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={styles.dialogClose}
              aria-label={text('Close', 'Închide')}
            >
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </DialogHeader>
        <StoryMusicCatalog selectedID={selectedID} onSelect={onSelect} onPreview={setPreview} />
        {preview && (
          <StoryMusicPreview
            key={preview.id}
            track={preview}
            active={open && !uploading}
            onClose={() => setPreview(null)}
          />
        )}
        <StoryMusicUpload disabled={false} onPending={onPending} onSelect={onUpload} />
      </DialogContent>
    </Dialog>
  )
}
