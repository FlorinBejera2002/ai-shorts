'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import type { CalendarClipOption, PublishingMedia } from '@/lib/content-calendar'
import { formatDuration } from '@/lib/utils'
import { Check, ChevronLeft, ChevronRight, Film, Search, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { PublishingMediaPicker } from './publishing-media-picker'
import styles from './post-media-dialog.module.css'
import theme from './publishing-theme.module.css'

type PostMediaSelection = {
  clipId: string
  media: PublishingMedia[]
}

type PostMediaDialogProps = {
  clips: CalendarClipOption[]
  clipId: string
  media: PublishingMedia[]
  disabled: boolean
  instagramEnabled: boolean
  facebookEnabled: boolean
  tiktokEnabled: boolean
  onConfirm: (selection: PostMediaSelection) => void
  onClose: () => void
  onUploadingChange: (uploading: boolean) => void
}

export function PostMediaDialog({
  clips,
  clipId,
  media,
  disabled,
  instagramEnabled,
  facebookEnabled,
  tiktokEnabled,
  onConfirm,
  onClose,
  onUploadingChange
}: PostMediaDialogProps) {
  const t = useTranslations('contentCalendar.composer')
  const actionsT = useTranslations('contentCalendar.actions')
  const isMobile = useIsMobile()
  const [source, setSource] = useState(media.length ? 'device' : 'clips')
  const [selectedClipId, setSelectedClipId] = useState(clipId)
  const [selectedMedia, setSelectedMedia] = useState(media)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string>()
  const pageSize = isMobile ? 4 : 6
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredClips = clips.filter(clip =>
    clip.title.toLocaleLowerCase().includes(normalizedSearch)
  )
  const pageCount = Math.max(1, Math.ceil(filteredClips.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visibleClips = filteredClips.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const selectedClip = clips.find(clip => clip.id === selectedClipId)
  const canConfirm = !disabled && !uploading && (
    source === 'clips' ? Boolean(selectedClip) : selectedMedia.length > 0
  )

  function confirmSelection() {
    if (!canConfirm) return
    onConfirm(source === 'clips'
      ? { clipId: selectedClipId, media: [] }
      : { clipId: '', media: selectedMedia })
  }

  return (
    <Dialog open={true} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className={`${theme.surface} ${styles.dialog}`} overlayClassName={theme.overlay} aria-describedby={undefined} data-publish-surface="" data-post-media-dialog="">
        <header className={styles.header}>
          <DialogTitle className={styles.title}>{t('mediaTitle')}</DialogTitle>
          <Button type="button" variant="ghost" size="icon" className={styles.close} onClick={onClose} aria-label={t('closeMedia')}>
            <X aria-hidden="true" />
          </Button>
        </header>
        <Tabs value={source} onValueChange={setSource} className={styles.tabs}>
          <TabsList className={styles.tabList} aria-label={t('changeMedia')}>
            <TabsTrigger className={styles.tab} value="clips" disabled={uploading}>{t('myClips')}</TabsTrigger>
            <TabsTrigger className={styles.tab} value="device" disabled={uploading}>{t('fromDevice')}</TabsTrigger>
          </TabsList>
          <div className={styles.body}>
            <TabsContent value="clips" forceMount={true} hidden={source !== 'clips'} className={styles.pane}>
              <div className={styles.search}>
                <Search aria-hidden="true" />
                <Input
                  value={search}
                  type="search"
                  placeholder={t('searchClips')}
                  aria-label={t('searchClips')}
                  onChange={event => { setSearch(event.target.value); setPage(0) }}
                />
              </div>
              {visibleClips.length ? (
                <div className={styles.grid}>
                  {visibleClips.map(clip => (
                    <button
                      key={clip.id}
                      type="button"
                      className={styles.clip}
                      aria-pressed={clip.id === selectedClipId}
                      disabled={disabled}
                      onClick={() => setSelectedClipId(clip.id === selectedClipId ? '' : clip.id)}
                    >
                      <span className={styles.thumbnail}>
                        {clip.thumbnailUrl
                          ? <img src={clip.thumbnailUrl} alt="" loading="lazy" />
                          : <Film className={styles.thumbnailFallback} aria-hidden="true" />}
                        {clip.tiktokEligible && (
                          <span className={styles.platform}><PlatformBrandIcon provider="tiktok" className="size-7" /></span>
                        )}
                        {clip.id === selectedClipId && (
                          <span className={styles.selected}><Check aria-hidden="true" /></span>
                        )}
                        <span className={styles.duration}>{formatDuration(clip.duration)}</span>
                      </span>
                      <span className={styles.clipTitle}>{clip.title}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.empty} role="status">{t(search.trim() ? 'noMatchingClips' : 'noClips')}</p>
              )}
            </TabsContent>
            <TabsContent value="device" forceMount={true} hidden={source !== 'device'} className={styles.pane}>
              <PublishingMediaPicker
                presentation="dialog"
                media={selectedMedia}
                disabled={disabled || uploading}
                instagramEnabled={instagramEnabled}
                facebookEnabled={facebookEnabled}
                tiktokEnabled={tiktokEnabled}
                error={uploadError}
                onChange={setSelectedMedia}
                onError={setUploadError}
                onUploadingChange={value => { setUploading(value); onUploadingChange(value) }}
              />
            </TabsContent>
          </div>
          <footer className={styles.footer}>
            {source === 'clips' && (
              <>
                <span className="sr-only" role="status">{t('selectedClips', { count: selectedClip ? 1 : 0 })}</span>
                <div className={styles.pagination}>
                  <Button type="button" variant="outline" size="icon" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label={t('previousPage')}>
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <span aria-live="polite">{t('pagePosition', { current: currentPage + 1, count: pageCount })}</span>
                  <Button type="button" variant="outline" size="icon" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} aria-label={t('nextPage')}>
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              </>
            )}
            <div className={`${styles.actions} ${source === 'device' ? styles.deviceActions : ''}`}>
              <Button type="button" variant="outline" onClick={onClose}>{actionsT('cancel')}</Button>
              <Button type="button" className={styles.confirm} disabled={!canConfirm} onClick={confirmSelection}>
                {t(source === 'clips' ? 'useClip' : 'useMedia')}
              </Button>
            </div>
          </footer>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
