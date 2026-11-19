'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { ScheduledPostRecord } from '@/lib/content-calendar'
import type { PublishingData } from '@/lib/publishing'
import { useTranslations } from 'next-intl'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarPostThumbnail } from './calendar-post-media'
import { CalendarStatusBadge } from './calendar-status-badge'
import { CalendarPostPreview } from './calendar-post-preview'
import { type PublishingPeriod, periodLabel } from './calendar-period'
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

const tabs: PublishingTab[] = [
  'all',
  'scheduled',
  'drafts',
  'published',
  'failed'
]

type CalendarPreviewListProps = {
  posts: ScheduledPostRecord[]
  publishingClips: PublishingData['clips']
  period: PublishingPeriod
  locale: string
  periodControl: ReactNode
  onCreatePost: () => void
  onChooseAnotherPeriod: () => void
  onOpenPost: (post: ScheduledPostRecord) => void
  onPublishPost: (post: ScheduledPostRecord) => void
  onDeletePost: (post: ScheduledPostRecord) => void
  onViewStatus: (post: ScheduledPostRecord) => void
}

export function CalendarPreviewList({
  posts,
  publishingClips,
  period,
  locale,
  periodControl,
  onCreatePost,
  onChooseAnotherPeriod,
  onOpenPost,
  onPublishPost,
  onDeletePost,
  onViewStatus
}: CalendarPreviewListProps) {
  const t = useTranslations('contentCalendar')
  const [saved] = useState(readPublishingView)
  const [tab, setTab] = useState<PublishingTab>(saved.tab ?? 'scheduled')
  const [selectedId, setSelectedId] = useState<string | null>(
    saved.selectedId ?? null
  )
  const [mobileDetail, setMobileDetail] = useState(saved.mobileDetail ?? false)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())
  const detailRef = useRef<HTMLDivElement>(null)
  const listScroll = useRef(saved.listScrollY ?? 0)
  const orderedPosts = useMemo(
    () => getPublishingPosts(posts, tab, period),
    [posts, tab, period]
  )
  const groups = useMemo(
    () => groupPublishingPosts(orderedPosts),
    [orderedPosts]
  )
  const failedCount = useMemo(
    () => getPublishingPosts(posts, 'failed', period).length,
    [posts, period]
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
  const weekday = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'long' }),
    [locale]
  )
  const dayMonth = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }),
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
    const weekdayLabel = weekday.format(value)
    return `${weekdayLabel.charAt(0).toLocaleUpperCase(locale)}${weekdayLabel.slice(1)}, ${dayMonth.format(value)}`
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
    <Tabs
      value={tab}
      onValueChange={(value) => changeTab(value as PublishingTab)}
      className={styles.splitView}
      data-mobile-detail={mobileDetail && Boolean(selectedPost)}
    >
        <div className={styles.listControls}>
          <TabsList
            aria-label={t('publishing.tabsLabel')}
            className={styles.tabs}
          >
            {tabs.map((value) => (
              <TabsTrigger key={value} value={value} className={styles.tab}>
                {t(`publishing.${value}`)}
                {value === 'failed' && failedCount > 0 && (
                  <span
                    className={styles.failedCount}
                    aria-label={t('publishing.failedCount', {
                      count: failedCount
                    })}
                  >
                    {failedCount}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className={styles.periodRow}>
            {periodControl}
            <span className={styles.postCount}>
              {t('postCount', { count: orderedPosts.length })}
            </span>
          </div>
        </div>
        <div className={styles.listPane}>
        {tabs.map((value) => (
          <TabsContent key={value} value={value} className={styles.tabPanel}>
            {orderedPosts.length === 0 ? (
              <EmptyList
                tab={tab}
                period={period}
                locale={locale}
                onCreatePost={onCreatePost}
                onChooseAnotherPeriod={onChooseAnotherPeriod}
              />
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
                            <span className={styles.postMeta}>
                              {post.status !== 'draft' && (
                                <span className={styles.metaTime}>
                                  {time.format(new Date(post.scheduledAt))}
                                </span>
                              )}
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
                          </span>
                          <CalendarStatusBadge
                            status={post.status}
                            className={styles.rowStatus}
                          />
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
        </div>
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
            <h3>{t('publishing.previewEmptyTitle')}</h3>
            <p>{t('publishing.previewEmptyBody')}</p>
            <div className={styles.previewPlaceholders} aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <span key={index} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Tabs>
  )
}

function EmptyList({
  tab,
  period,
  locale,
  onCreatePost,
  onChooseAnotherPeriod
}: {
  tab: PublishingTab
  period: PublishingPeriod
  locale: string
  onCreatePost: () => void
  onChooseAnotherPeriod: () => void
}) {
  const t = useTranslations('contentCalendar')
  return (
    <div className={styles.emptyState}>
      <img
        src="/illustrations/library-empty.webp"
        alt=""
        width={220}
        height={220}
        className={styles.emptyIllustration}
      />
      <h3>
        {t('publishing.emptyPeriod.' + tab, {
          period: periodLabel(period, locale)
        })}
      </h3>
      <p>{t('publishing.emptyHint')}</p>
      <div className={styles.emptyActions}>
        <Button type="button" variant="outline" onClick={onChooseAnotherPeriod}>
          {t('publishing.chooseAnotherPeriod')}
        </Button>
        <Button type="button" onClick={onCreatePost}>
          {t('actions.newPost')}
        </Button>
      </div>
    </div>
  )
}
