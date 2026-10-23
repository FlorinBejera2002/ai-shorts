'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogClose } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ContentPlatform, ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingData } from '@/lib/publishing'
import { Expand, Film, Play, Upload, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { CalendarPostMedia, CalendarPostThumbnail } from './calendar-post-media'
import styles from './post-composer.module.css'

export function PostComposerPreview({ post, publishingClips, disabled, onChangeMedia }: {
  post: ScheduledPostRecord
  publishingClips: PublishingData['clips']
  disabled: boolean
  onChangeMedia: () => void
}) {
  const t = useTranslations('contentCalendar')
  const [activePlatform, setActivePlatform] = useState<ContentPlatform | undefined>(post.platforms[0])
  const [expanded, setExpanded] = useState(false)
  const previewOpener = useRef<HTMLElement | null>(null)
  const selectedPlatform = post.platforms.includes(activePlatform!) ? activePlatform : post.platforms[0]
  const hasMedia = Boolean(post.clip || post.media.length)

  function openExpanded() {
    previewOpener.current = document.activeElement as HTMLElement | null
    setExpanded(true)
  }

  function changeExpanded(open: boolean) {
    setExpanded(open)
    if (!open) requestAnimationFrame(() => previewOpener.current?.focus())
  }

  return (
    <aside className={styles.previewPane} data-composer-preview="">
      <div className={styles.desktopPreview}>
        {post.platforms.length > 0 && (
          <Tabs value={selectedPlatform} onValueChange={value => setActivePlatform(value as ContentPlatform)} className="gap-0">
            <TabsList className={styles.previewTabs} aria-label={t('composer.previewPlatform')}>
              {post.platforms.map(platform => (
                <TabsTrigger key={platform} value={platform} className={styles.previewTab} aria-label={t(`platforms.${platform}`)}>
                  <PlatformBrandIcon provider={platform} className="size-8" />
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <div className={styles.previewPlayer}>
          {hasMedia ? <CalendarPostMedia key={post.clip?.id || post.media.map(item => item.reference).join(',')} post={post} publishingClips={publishingClips} /> : (
            <button type="button" className={styles.emptyPreview} onClick={onChangeMedia} disabled={disabled}>
              <Film className="size-9" />
              <span>{t('composer.chooseMedia')}</span>
            </button>
          )}
        </div>
      </div>
      <div className={styles.mobileThumbnail}>
        <button type="button" onClick={() => hasMedia ? openExpanded() : onChangeMedia()} aria-label={t('composer.expandPreview')} disabled={disabled} className={styles.thumbnailButton}>
          <CalendarPostThumbnail post={post} />
          {hasMedia && <span className={styles.playBadge}><Play className="size-5 fill-current" /></span>}
        </button>
      </div>
      <Button type="button" variant="outline" className={styles.changeMedia} onClick={onChangeMedia} disabled={disabled}>
        <Upload className="size-4" />{t('composer.changeMedia')}
      </Button>
      <Button type="button" variant="outline" className={styles.expandMedia} onClick={openExpanded} disabled={disabled || !hasMedia} aria-label={t('composer.expandPreview')}>
        <Expand className="size-5" />
      </Button>
      <Dialog open={expanded} onOpenChange={changeExpanded}>
        <DialogContent className="max-w-md rounded-md p-4">
          <DialogTitle className="sr-only">{t('publishing.previewLabel')}</DialogTitle>
          <DialogClose asChild><Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label={t('actions.close')}><X /></Button></DialogClose>
          <CalendarPostMedia post={post} publishingClips={publishingClips} />
        </DialogContent>
      </Dialog>
    </aside>
  )
}
