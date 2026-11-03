'use client'

import { SocialPreviewOverlay } from '@/components/dashboard/brand/social-preview-overlay'
import { PublishingPlatformIcon } from '@/components/publishing/publishing-platform-icon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogClose } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ContentPlatform, ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingData } from '@/lib/publishing'
import { Expand, Film, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { CalendarPostMedia } from './calendar-post-media'
import styles from './post-composer.module.css'
import theme from './publishing-theme.module.css'

export function PostComposerPreview({ post, accountNames, publishingClips, disabled, onChangeMedia }: {
  post: ScheduledPostRecord
  accountNames: Partial<Record<ContentPlatform, string>>
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
  const mediaKey = post.clip?.id || post.media.map(item => item.reference).join(',')

  function openExpanded() {
    previewOpener.current = document.activeElement as HTMLElement | null
    setExpanded(true)
  }

  function changeExpanded(open: boolean) {
    setExpanded(open)
    if (!open) requestAnimationFrame(() => previewOpener.current?.focus())
  }

  const overlay = selectedPlatform && hasMedia && (
    <SocialPreviewOverlay platform={selectedPlatform} accountName={accountNames[selectedPlatform]} caption={post.caption ?? ''} />
  )

  return (
    <aside className={styles.previewPane} data-composer-preview="" aria-label={t('publishing.previewLabel')}>
      <div className={styles.desktopPreview}>
        {post.platforms.length > 0 && (
          <Tabs value={selectedPlatform} onValueChange={value => setActivePlatform(value as ContentPlatform)} className="gap-0">
            <TabsList className={styles.previewTabs} aria-label={t('composer.previewPlatform')}>
              {post.platforms.map(platform => (
                <TabsTrigger key={platform} value={platform} className={styles.previewTab} data-provider={platform} aria-label={t(`platforms.${platform}`)}>
                  <PublishingPlatformIcon platform={platform} />
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}
        <div className={styles.previewPlayer}>
          {hasMedia ? <CalendarPostMedia key={mediaKey} post={post} publishingClips={publishingClips} overlay={<>{overlay}<Button type="button" variant="ghost" className={styles.expandMedia} onClick={openExpanded} disabled={disabled} aria-label={t('composer.expandPreview')}><Expand className="size-4" /></Button></>} /> : (
            <button type="button" className={styles.emptyPreview} onClick={onChangeMedia} disabled={disabled}>
              <Film className="size-7" />
              <span>{t('composer.chooseMedia')}</span>
            </button>
          )}
        </div>
      </div>
      <Button type="button" variant="outline" className={styles.changeMedia} onClick={onChangeMedia} disabled={disabled}>
        {t('composer.changeMedia')}
      </Button>
      <Dialog open={expanded} onOpenChange={changeExpanded}>
        <DialogContent className={`${theme.surface} ${styles.expandedDialog}`} overlayClassName={theme.overlay} data-publish-surface="" aria-describedby={undefined}>
          <DialogTitle className="sr-only">{t('publishing.previewLabel')}</DialogTitle>
          <DialogClose asChild><Button type="button" variant="ghost" size="icon" className={styles.expandedClose} aria-label={t('actions.close')}><X /></Button></DialogClose>
          <div className={`${styles.previewPlayer} ${styles.expandedPlayer}`}>
            <CalendarPostMedia post={post} publishingClips={publishingClips} overlay={overlay} />
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
