'use client'

import { X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import theme from '@/components/calendar/publishing-theme.module.css'
import { formatDuration } from '@/lib/youtube'
import type { StoryAsset } from './types'
import { StoryFootagePlayer } from './story-footage-player'
import { useStoryLanguage } from './use-story-language'
import pill from './story-pill-buttons.module.css'
import styles from './story-options.module.css'

interface Props {
  /** The footage being previewed, or null when the dialog is closed. */
  asset: StoryAsset | null
  number: number
  onClose: () => void
  onRemove: (assetID: string) => void
}

/** Plays a footage tag's clip, with actions to drop it from the description. */
export function StoryFootageTagDialog({ asset, number, onClose, onRemove }: Props) {
  const text = useStoryLanguage()
  const source = asset?.proxy_url || asset?.source_url
  const label = `${text('Footage', 'Filmarea')} ${number}`
  return (
    <Dialog open={Boolean(asset)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={`${theme.surface} ${styles.dialog}`}
        overlayClassName={theme.overlay}
        data-reference-surface=""
        aria-describedby={undefined}
      >
        {asset && (
          <>
            <span className={styles.grabber} aria-hidden="true" />
            <DialogHeader className={styles.dialogHeader}>
              <div className={styles.dialogHeading}>
                <DialogTitle className={styles.dialogTitle}>{label}</DialogTitle>
                <DialogDescription className={`truncate ${styles.dialogSubtitle}`}>
                  {asset.name} · {formatDuration(asset.duration)}
                </DialogDescription>
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
            {source ? (
              <StoryFootagePlayer
                src={source}
                poster={asset.thumbnail_url ?? undefined}
                label={label}
                duration={asset.duration}
              />
            ) : (
              <div className={styles.player} role="img" aria-label={asset.name} />
            )}
            <div className={styles.dialogActions}>
              <Button
                type="button"
                variant="outline"
                className={`${pill.pill} ${pill.outline}`}
                onClick={() => onRemove(asset.id)}
              >
                {text('Remove from description', 'Elimină din descriere')}
              </Button>
              <DialogClose asChild>
                <Button type="button" className={`${styles.dialogDone} ${pill.pill} ${pill.primary}`}>
                  {text('Done', 'Gata')}
                </Button>
              </DialogClose>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
