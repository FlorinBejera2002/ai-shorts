'use client'

import { Check, Search } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import Image from 'next/image'
import { useId, useRef, type KeyboardEvent } from 'react'

import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { formatDuration } from '@/lib/youtube'
import {
  isRefusedVideo,
  isSelectableVideo,
  nextVisibilityFilterIndex,
  VISIBILITY_FILTERS,
  type LibraryVisibilityFilter
} from './youtube-creation-model'
import type { YouTubeChannelVideo, YouTubeLibrary } from './use-youtube-channel'

interface SourceYouTubeLibraryProps {
  library: YouTubeLibrary
  selectedIds: readonly string[]
  /** Videos the backend refused, with the visibility they had then; see `isRefusedVideo`. */
  refusedVideos: ReadonlyMap<string, string>
  /** True once the selection holds the maximum, so unchosen rows cannot be added. */
  selectionFull: boolean
  onToggle: (video: YouTubeChannelVideo) => void
}

/** Live list of the connected channel's videos: search, visibility filter, paging and multi-select. */
export function SourceYouTubeLibrary({ library, selectedIds, refusedVideos, selectionFull, onToggle }: SourceYouTubeLibraryProps) {
  const t = useTranslations('create.youtubeLibrary')
  const searchId = useId()
  const listLabelId = useId()
  const selectedSet = new Set(selectedIds)

  return (
    <div className="yt-library">
      <div className="yt-library__controls">
        <label className="yt-field yt-library__search" htmlFor={searchId}>
          <Search className="yt-field__icon" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            className="yt-field__input"
            aria-label={t('searchLabel')}
            placeholder={t('searchPlaceholder')}
            value={library.searchText}
            onChange={(event) => library.setSearchText(event.target.value)}
          />
        </label>
        <VisibilityFilter
          value={library.visibility}
          label={t('visibilityLabel')}
          onChange={library.setVisibility}
        />
      </div>

      {library.isPending && (
        <p role="status" className="yt-library__status"><LoadingIndicator className="size-4" />{t('loading')}</p>
      )}

      {library.isError && (
        <div className="yt-library__notice" role="alert">
          <p>{library.notConnected ? t('notConnected') : t('loadFailed')}</p>
          {!library.notConnected && (
            <button type="button" className="yt-ghost-button" onClick={library.retry}>{t('retry')}</button>
          )}
        </div>
      )}

      {!library.isPending && !library.isError && library.videos.length === 0 && (
        <p className="yt-library__empty" role="status">{library.query.trim() ? t('noResults') : t('empty')}</p>
      )}

      {library.videos.length > 0 && (
        <>
          <span id={listLabelId} className="sr-only">{t('listLabel')}</span>
          <div className="yt-library__list" role="group" aria-labelledby={listLabelId}>
            {library.videos.map((video) => {
              const selected = selectedSet.has(video.id)
              const refused = isRefusedVideo(refusedVideos.get(video.id), video.visibility)
              const disabled = !isSelectableVideo(video.visibility) || refused || (selectionFull && !selected)
              return (
                <LibraryVideoRow
                  key={video.id}
                  video={video}
                  selected={selected}
                  disabled={disabled}
                  onToggle={() => onToggle(video)}
                />
              )
            })}
          </div>
        </>
      )}

      {library.hasMore && (
        <button type="button" className="yt-secondary-button yt-library__more" onClick={library.loadMore} disabled={library.loadingMore}>
          {library.loadingMore && <LoadingIndicator className="size-4" />}
          {t('loadMore')}
        </button>
      )}
    </div>
  )
}

interface VisibilityFilterProps {
  value: LibraryVisibilityFilter
  label: string
  onChange: (value: LibraryVisibilityFilter) => void
}

/**
 * Visibility tabs as a radio group: one tab stop, arrow keys (and Home/End) move and select.
 * The focused button is the checked one, so the roving tab stop always lands on the selection.
 */
function VisibilityFilter({ value, label, onChange }: VisibilityFilterProps) {
  const t = useTranslations('create.youtubeLibrary')
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextVisibilityFilterIndex(index, event.key)
    if (next === null) return
    event.preventDefault()
    onChange(VISIBILITY_FILTERS[next])
    buttons.current[next]?.focus()
  }

  return (
    <div className="yt-segment yt-library__filter" role="radiogroup" aria-label={label}>
      {VISIBILITY_FILTERS.map((filter, index) => {
        const checked = value === filter
        return (
          <button
            key={filter}
            ref={(node) => {
              buttons.current[index] = node
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(filter)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {t(`filter.${filter}`)}
          </button>
        )
      })}
    </div>
  )
}

const publishedDateFormatters = new Map<string, Intl.DateTimeFormat>()

/** Short publish date in the viewer's locale; one formatter per locale, reused across rows. */
function formatPublishedDate(locale: string, publishedAt: string): string {
  let formatter = publishedDateFormatters.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
    publishedDateFormatters.set(locale, formatter)
  }
  return formatter.format(new Date(publishedAt))
}

interface LibraryVideoRowProps {
  video: YouTubeChannelVideo
  selected: boolean
  disabled: boolean
  onToggle: () => void
}

/** One channel video as a multi-select row: 16:9 thumbnail (neutral tile when none), title, meta and mark. */
function LibraryVideoRow({ video, selected, disabled, onToggle }: LibraryVideoRowProps) {
  const t = useTranslations('create.youtubeLibrary')
  const locale = useLocale()

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      disabled={disabled}
      className="yt-library-row"
      data-selected={selected || undefined}
      data-disabled={disabled || undefined}
      onClick={onToggle}
    >
      <span className="yt-library-row__thumb">
        {video.thumbnail_url && <Image src={video.thumbnail_url} alt="" fill sizes="128px" unoptimized className="object-cover" />}
      </span>
      <span className="yt-library-row__body">
        <span className="yt-library-row__title">{video.title}</span>
        <span className="yt-library-row__meta">
          <span>{formatPublishedDate(locale, video.published_at)}</span>
          <span>{formatDuration(video.duration_seconds)}</span>
          <span className={`yt-chip yt-chip--${video.visibility}`}>{t(`visibility.${video.visibility}`)}</span>
        </span>
      </span>
      <span className="yt-check-mark" aria-hidden="true">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </button>
  )
}
