'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingData } from '@/lib/publishing'
import { AlertCircle, CalendarDays, ChevronRight, ImageOff, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarPostThumbnail } from './calendar-post-media'
import { CalendarPostPreview } from './calendar-post-preview'
import styles from './calendar-publishing.module.css'
import { getPublishingPosts, type PublishingTab } from './calendar-publishing-utils'

const tabs: PublishingTab[] = ['scheduled', 'drafts', 'published']

type CalendarPreviewListProps = {
  posts: ScheduledPostRecord[]
  publishingClips: PublishingData['clips']
  month: Date
  locale: string
  toolbar: ReactNode
  onCreatePost: () => void
  onOpenPost: (post: ScheduledPostRecord) => void
}

export function CalendarPreviewList({
  posts,
  publishingClips,
  month,
  locale,
  toolbar,
  onCreatePost,
  onOpenPost
}: CalendarPreviewListProps) {
  const t = useTranslations('contentCalendar')
  const [tab, setTab] = useState<PublishingTab>('scheduled')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mobileDetail, setMobileDetail] = useState(false)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const detailRef = useRef<HTMLDivElement>(null)
  const orderedPosts = useMemo(
    () => getPublishingPosts(posts, tab, month),
    [posts, tab, month]
  )
  const selectedPost =
    orderedPosts.find(post => post.id === selectedId) ?? orderedPosts[0]
  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }),
    [locale]
  )

  function selectPost(post: ScheduledPostRecord) {
    setSelectedId(post.id)
    setMobileDetail(true)
    if (window.matchMedia('(max-width: 1099px)').matches) {
      requestAnimationFrame(() => {
        detailRef.current?.focus()
        detailRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
      })
    }
  }

  function backToList() {
    setMobileDetail(false)
    requestAnimationFrame(() => {
      if (selectedPost) rowRefs.current.get(selectedPost.id)?.focus()
    })
  }

  return (
    <div className={styles.splitView} data-mobile-detail={mobileDetail && Boolean(selectedPost)}>
      <Tabs
        value={tab}
        onValueChange={value => {
          setTab(value as PublishingTab)
          setSelectedId(null)
          setMobileDetail(false)
        }}
        className={styles.listPane}
      >
        <TabsList aria-label={t('publishing.tabsLabel')} className={styles.tabs}>
          {tabs.map(value => (
            <TabsTrigger key={value} value={value} className={styles.tab}>
              {t(`publishing.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        {toolbar}
        {tabs.map(value => (
          <TabsContent key={value} value={value} className={styles.tabPanel}>
            {orderedPosts.length === 0 ? (
              <div className={styles.emptyState}>
                <ImageOff aria-hidden="true" className="size-7 text-muted-foreground" />
                <h3>{t(`publishing.empty.${tab}`)}</h3>
                <p>{t('publishing.emptyDescription')}</p>
                <Button onClick={onCreatePost} className="mt-4 bg-foreground text-background hover:bg-foreground/85">
                  <Plus />{t('actions.newPost')}
                </Button>
              </div>
            ) : (
              <div className={styles.postList}>
                {orderedPosts.map(post => (
                  <button
                    key={post.id}
                    ref={node => {
                      if (node) rowRefs.current.set(post.id, node)
                      else rowRefs.current.delete(post.id)
                    }}
                    type="button"
                    data-publishing-post={post.id}
                    aria-label={t('preview.openAria', { title: post.title })}
                    aria-pressed={post.id === selectedPost?.id}
                    onClick={() => selectPost(post)}
                    className={styles.postRow}
                  >
                    <CalendarPostThumbnail post={post} />
                    <span className={styles.postInfo}>
                      <span className={styles.postTitle}>{post.title}</span>
                      <span className={styles.platforms}>
                        {post.platforms.map(platform => (
                          <span key={platform} className={styles.platform} title={t(`platforms.${platform}`)}>
                            <PlatformBrandIcon provider={platform} className="size-6" />
                            <span className={styles.platformName}>{t(`platforms.${platform}`)}</span>
                          </span>
                        ))}
                      </span>
                      <span className={styles.postDate}>
                        {post.status === 'failed' ? <AlertCircle aria-hidden="true" /> : <CalendarDays aria-hidden="true" />}
                        <span className={post.status === 'failed' ? 'text-destructive' : undefined}>
                          {post.status === 'draft' || post.status === 'failed' || post.status === 'publishing'
                            ? t(`statuses.${post.status}`)
                            : dateTime.format(new Date(post.status === 'published' ? post.updatedAt : post.scheduledAt))}
                        </span>
                      </span>
                    </span>
                    <ChevronRight aria-hidden="true" className={styles.rowArrow} />
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
      <div
        ref={detailRef}
        tabIndex={-1}
        className={styles.detailPane}
        data-publishing-preview=""
        aria-label={t('publishing.previewLabel')}
      >
        {selectedPost ? (
          <CalendarPostPreview
            key={selectedPost.id}
            post={selectedPost}
            publishingClips={publishingClips}
            locale={locale}
            onEdit={onOpenPost}
            onBack={backToList}
            backLabel={t(`publishing.back.${tab}`)}
          />
        ) : (
          <div className={styles.emptyPreview}>
            <ImageOff aria-hidden="true" className="size-8" />
            <p>{t('publishing.selectPost')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
