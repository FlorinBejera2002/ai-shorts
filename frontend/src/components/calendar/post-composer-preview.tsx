'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/use-mobile'
import type { ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingData } from '@/lib/publishing'
import { Expand, Film, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type ReactNode, useRef, useState, useSyncExternalStore } from 'react'
import { CalendarPostMedia } from './calendar-post-media'
import { PostPreviewDevice, type PreviewDeviceSize } from './post-preview-device'
import type { PreviewPlatform } from './post-preview-platform-overlay'
import styles from './post-composer-preview.module.css'
import theme from './publishing-theme.module.css'

// Platform order is fixed across the composer: Instagram, Facebook, TikTok, YouTube.
const previewPlatformOrder: PreviewPlatform[] = ['instagram', 'facebook', 'tiktok', 'youtube']

// The inline pane switches to its phone layout at the same breakpoint as its stylesheet.
const phoneQuery = '(max-width: 767px)'
function subscribePhoneQuery(callback: () => void) {
  const media = window.matchMedia(phoneQuery)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}
function usePhoneLayout() {
  return useSyncExternalStore(
    subscribePhoneQuery,
    () => window.matchMedia(phoneQuery).matches,
    () => false
  )
}

type PostComposerPreviewProps = {
  post: ScheduledPostRecord
  accountNames: Partial<Record<PreviewPlatform, string>>
  publishingClips: PublishingData['clips']
  disabled: boolean
  onChangeMedia: () => void
}

function PreviewPlatformTabs({ platforms, value, onValueChange }: {
  platforms: PreviewPlatform[]
  value: PreviewPlatform
  onValueChange: (platform: PreviewPlatform) => void
}) {
  const t = useTranslations('contentCalendar')
  return (
    <Tabs value={value} onValueChange={next => onValueChange(next as PreviewPlatform)} className={styles.tabs}>
      <TabsList className={styles.tabList} aria-label={t('composer.previewPlatform')}>
        {platforms.map(platform => (
          <TabsTrigger
            key={platform}
            value={platform}
            className={styles.tab}
            data-provider={platform}
            aria-label={t(`platforms.${platform}`)}
          >
            <span className={styles.tabLogo}>
              <PlatformBrandIcon provider={platform} className={styles.tabLogoImage} />
            </span>
            <span className={styles.tabIndicator} aria-hidden='true' />
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

type PreviewDeviceProps = {
  post: ScheduledPostRecord
  accountNames: Partial<Record<PreviewPlatform, string>>
  publishingClips: PublishingData['clips']
}

/** Platform selection stays inside the pane; only the visual context changes, never the post. */
function usePreviewPlatformSelection(post: ScheduledPostRecord) {
  const [activePlatform, setActivePlatform] = useState<PreviewPlatform>()
  const platforms = previewPlatformOrder.filter(platform => post.platforms.includes(platform))
  const selectedPlatform = platforms.find(platform => platform === activePlatform) ?? platforms[0]
  return { platforms, selectedPlatform, setActivePlatform }
}

function ExpandPreviewButton({ compact, disabled, onOpen }: { compact: boolean; disabled: boolean; onOpen: () => void }) {
  const t = useTranslations('contentCalendar')
  const platformT = useTranslations('contentCalendar.platformPreview')
  return (
    <button
      type='button'
      className={compact ? styles.expandIcon : styles.expandText}
      onClick={onOpen}
      disabled={disabled}
      aria-label={t('composer.expandPreview')}
    >
      <Expand className='size-4' aria-hidden='true' />
      {!compact && <span>{platformT('expand')}</span>}
    </button>
  )
}

/** Inline phone: the device for the selected platform, or the bare media when no destination is selected. */
function InlinePreviewMedia({ post, accountNames, publishingClips, platform, size }: PreviewDeviceProps & {
  platform?: PreviewPlatform
  size: PreviewDeviceSize
}) {
  const mediaKey = post.clip?.id || post.media.map(item => item.reference).join(',')
  if (!platform) {
    return (
      <div className={styles.plainMedia}>
        <CalendarPostMedia key={mediaKey} post={post} publishingClips={publishingClips} />
      </div>
    )
  }
  return (
    <PostPreviewDevice
      key={mediaKey}
      size={size}
      platform={platform}
      accountName={accountNames[platform]}
      post={post}
      publishingClips={publishingClips}
    />
  )
}

function ExpandedPreviewDialog({ open, onOpenChange, isMobile, tabs, device }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isMobile: boolean
  tabs: ReactNode
  device: ReactNode
}) {
  const t = useTranslations('contentCalendar')
  const platformT = useTranslations('contentCalendar.platformPreview')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${theme.surface} ${styles.expandedDialog}`}
        overlayClassName={theme.overlay}
        data-publish-surface=''
        aria-describedby={undefined}
      >
        <div className={styles.expandedHeader}>
          <DialogTitle className={isMobile ? styles.visuallyHidden : styles.expandedTitle}>
            {platformT('title')}
          </DialogTitle>
          {isMobile && <span className={styles.headerTabs}>{tabs}</span>}
          <DialogClose asChild>
            <button type='button' className={styles.expandedClose} aria-label={t('actions.close')}>
              <X className='size-5' aria-hidden='true' />
            </button>
          </DialogClose>
        </div>
        {!isMobile && tabs}
        {device}
      </DialogContent>
    </Dialog>
  )
}

export function PostComposerPreview({ post, accountNames, publishingClips, disabled, onChangeMedia }: PostComposerPreviewProps) {
  const t = useTranslations('contentCalendar')
  const platformT = useTranslations('contentCalendar.platformPreview')
  const isMobile = useIsMobile()
  const isPhone = usePhoneLayout()
  const [expanded, setExpanded] = useState(false)
  const previewOpener = useRef<HTMLElement | null>(null)
  const { platforms, selectedPlatform, setActivePlatform } = usePreviewPlatformSelection(post)
  const hasMedia = Boolean(post.clip || post.media.length)
  const inlineSize: PreviewDeviceSize = isPhone ? 'inline-mobile' : 'inline-desktop'
  const expandedSize: PreviewDeviceSize = isMobile ? 'expanded-mobile' : 'expanded-desktop'

  function openExpanded() {
    previewOpener.current = document.activeElement as HTMLElement | null
    setExpanded(true)
  }

  function changeExpanded(open: boolean) {
    setExpanded(open)
    if (!open) requestAnimationFrame(() => previewOpener.current?.focus())
  }

  const tabs = selectedPlatform && (
    <PreviewPlatformTabs platforms={platforms} value={selectedPlatform} onValueChange={setActivePlatform} />
  )
  const expandedDevice = hasMedia && selectedPlatform && (
    <PostPreviewDevice
      key={`${post.clip?.id || post.media.map(item => item.reference).join(',')}-expanded`}
      size={expandedSize}
      platform={selectedPlatform}
      accountName={accountNames[selectedPlatform]}
      post={post}
      publishingClips={publishingClips}
    />
  )

  return (
    <aside className={styles.pane} data-composer-preview='' aria-label={t('publishing.previewLabel')}>
      {isPhone && (
        <div className={styles.paneHeader}>
          <span className={styles.paneTitle}>{platformT('title')}</span>
          {hasMedia && <ExpandPreviewButton compact disabled={disabled} onOpen={openExpanded} />}
        </div>
      )}
      {tabs}
      {hasMedia ? (
        <>
          <InlinePreviewMedia post={post} accountNames={accountNames} publishingClips={publishingClips} platform={selectedPlatform} size={inlineSize} />
          {!isPhone && <ExpandPreviewButton compact={false} disabled={disabled} onOpen={openExpanded} />}
        </>
      ) : (
        <button type='button' className={styles.emptyPreview} onClick={onChangeMedia} disabled={disabled}>
          <Film className='size-7' aria-hidden='true' />
          <span>{t('composer.chooseMedia')}</span>
        </button>
      )}
      <ExpandedPreviewDialog open={expanded} onOpenChange={changeExpanded} isMobile={isMobile} tabs={tabs} device={expandedDevice} />
    </aside>
  )
}
