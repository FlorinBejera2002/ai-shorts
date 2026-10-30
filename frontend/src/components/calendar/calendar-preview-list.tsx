'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingData } from '@/lib/publishing'
import { AlertCircle, ImageOff, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarPostThumbnail } from './calendar-post-media'
import { CalendarPostPreview } from './calendar-post-preview'
import {
  readPublishingView,
  savePublishingView
} from './calendar-publishing-state'
import styles from './calendar-publishing.module.css'
import {
  getPublishingPosts,
  groupPublishingPosts,
  type PublishingTab
} from './calendar-publishing-utils'

const tabs: PublishingTab[] = ['all', 'scheduled', 'drafts', 'published']

type CalendarPreviewListProps = {
  posts: ScheduledPostRecord[]
  publishingClips: PublishingData['clips']
  month: Date
  locale: string
  toolbar: ReactNode
  onCreatePost: () => void
  onOpenPost: (post: ScheduledPostRecord) => void
  onPublishPost: (post: ScheduledPostRecord) => void
  onDeletePost: (post: ScheduledPostRecord) => void
  onViewStatus: (post: ScheduledPostRecord) => void
}

export function CalendarPreviewList({
  posts,
  publishingClips,
  month,
  locale,
  toolbar,
  onCreatePost,
  onOpenPost,
  onPublishPost,
  onDeletePost,
  onViewStatus
}: CalendarPreviewListProps) {
  const t = useTranslations('contentCalendar')
  const [saved] = useState(readPublishingView)
  const [tab, setTab] = useState<PublishingTab>(saved.tab ?? 'all')
  const [selectedId, setSelectedId] = useState<string | null>(
    saved.selectedId ?? null
  )
  const [mobileDetail, setMobileDetail] = useState(saved.mobileDetail ?? false)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const detailRef = useRef<HTMLDivElement>(null)
  const listScroll = useRef(saved.listScrollY ?? 0)
  const orderedPosts = useMemo(
    () => getPublishingPosts(posts, tab, month),
    [posts, tab, month]
  )
  const groups = useMemo(
    () => groupPublishingPosts(orderedPosts),
    [orderedPosts]
  )
  const failedPosts = useMemo(
    () =>
      getPublishingPosts(posts, 'all', month).filter(
        (post) => post.status === 'failed'
      ),
    [posts, month]
  )
  const selectedPost =
    orderedPosts.find((post) => post.id === selectedId) ?? orderedPosts[0]
  const time = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }),
    [locale]
  )
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'short'
      }),
    [locale]
  )

  function groupTitle(value: Date | null) {
    if (!value) return t('publishing.undated')
    const today = new Date()
    const tomorrow = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 1
    )
    if (value.toDateString() === today.toDateString()) return t('actions.today')
    if (value.toDateString() === tomorrow.toDateString())
      return t('publishing.tomorrow')
    return date.format(value)
  }

  function selectPost(post: ScheduledPostRecord) {
    listScroll.current = window.scrollY
    setSelectedId(post.id)
    setMobileDetail(true)
    savePublishingView({
      selectedId: post.id,
      mobileDetail: true,
      listScrollY: listScroll.current
    })
    if (window.matchMedia('(max-width: 1099px)').matches) {
      requestAnimationFrame(() => {
        detailRef.current?.focus({ preventScroll: true })
        detailRef.current?.scrollIntoView({
          block: 'start',
          behavior: 'instant'
        })
      })
    }
  }

  function changeTab(value: PublishingTab) {
    setTab(value)
    setSelectedId(null)
    setMobileDetail(false)
    savePublishingView({
      tab: value,
      selectedId: null,
      mobileDetail: false,
      scrollY: 0
    })
  }

  function backToList() {
    setMobileDetail(false)
    savePublishingView({ mobileDetail: false, scrollY: listScroll.current })
    requestAnimationFrame(() => {
      if (selectedPost)
        rowRefs.current.get(selectedPost.id)?.focus({ preventScroll: true })
      window.scrollTo({ top: listScroll.current, behavior: 'instant' })
    })
  }

  return (
    <div
      className={styles.splitView}
      data-mobile-detail={mobileDetail && Boolean(selectedPost)}
    >
      {failedPosts.length > 0 && (
        <div className={styles.failureBanner} role="status">
          <AlertCircle className="size-4" aria-hidden="true" />
          <span>
            {t('publishing.failedCount', { count: failedPosts.length })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              changeTab('all')
              selectPost(failedPosts[0])
            }}
          >
            {t('publishing.resolve')}
          </Button>
        </div>
      )}
      <Tabs
        value={tab}
        onValueChange={(value) => changeTab(value as PublishingTab)}
        className={styles.listPane}
      >
        <div className={styles.listControls}>
          <TabsList
            aria-label={t('publishing.tabsLabel')}
            className={styles.tabs}
          >
            {tabs.map((value) => (
              <TabsTrigger key={value} value={value} className={styles.tab}>
                {t(`publishing.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
          {toolbar}
        </div>
        {tabs.map((value) => (
          <TabsContent key={value} value={value} className={styles.tabPanel}>
            {orderedPosts.length === 0 ? (
              <div className={styles.emptyState}>
                <ImageOff
                  aria-hidden="true"
                  className="size-7 text-muted-foreground"
                />
                <h3>{t(`publishing.empty.${tab}`)}</h3>
                <Button onClick={onCreatePost}>
                  <Plus />
                  {t('actions.newPost')}
                </Button>
              </div>
            ) : (
              <div className={styles.postList}>
                {groups.map((group) => (
                  <section
                    key={group.key}
                    className={styles.dayGroup}
                    aria-label={groupTitle(group.date)}
                  >
                    <h2 className={styles.dayHeading}>
                      {groupTitle(group.date)}
                    </h2>
                    <div className={styles.dayPosts}>
                      {group.posts.map((post) => (
                        <button
                          key={post.id}
                          ref={(node) => {
                            if (node) rowRefs.current.set(post.id, node)
                            else rowRefs.current.delete(post.id)
                          }}
                          type="button"
                          data-publishing-post={post.id}
                          aria-label={t('preview.openAria', {
                            title: post.title
                          })}
                          aria-pressed={post.id === selectedPost?.id}
                          onClick={() => selectPost(post)}
                          className={styles.postRow}
                        >
                          <span className={styles.postTime}>
                            {post.status === 'draft'
                              ? '—'
                              : time.format(new Date(post.scheduledAt))}
                          </span>
                          <span className={styles.rowThumbnail}>
                            <CalendarPostThumbnail post={post} />
                          </span>
                          <span className={styles.postInfo}>
                            <span className={styles.postTitle}>
                              {post.title}
                            </span>
                            <span className={styles.platforms}>
                              {post.platforms.map((platform) => (
                                <span
                                  key={platform}
                                  title={t(`platforms.${platform}`)}
                                >
                                  <PlatformBrandIcon
                                    provider={platform}
                                    className="size-4"
                                  />
                                  <span className="sr-only">
                                    {t(`platforms.${platform}`)}
                                  </span>
                                </span>
                              ))}
                            </span>
                          </span>
                          <span
                            className={styles.rowStatus}
                            data-status={post.status}
                          >
                            <span
                              className={styles.statusDot}
                              aria-hidden="true"
                            />
                            {t(`statuses.${post.status}`)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
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
            onPublish={onPublishPost}
            onDelete={onDeletePost}
            onStatus={onViewStatus}
            onBack={backToList}
            backLabel={t(`publishing.back.${tab}`)}
          />
        ) : (
          <div className={styles.emptyPreview}>
            <ImageOff aria-hidden="true" className="size-7" />
            <p>{t('publishing.selectPost')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
