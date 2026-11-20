'use client'

import { FileVideo, Link2Off, RefreshCw, Trash2, Youtube } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Link } from '@/i18n/navigation'
import {
  isActiveYouTubeImport,
  type YouTubeImport,
  type YouTubeImportLibrary,
  type YouTubeVisibility
} from './use-youtube-import'

function ImportConsent({ library }: { library: YouTubeImportLibrary }) {
  const t = useTranslations('create.youtubeImport')
  const id = useId()
  const [visibilities, setVisibilities] = useState<YouTubeVisibility[]>(['public'])
  const [consent, setConsent] = useState(false)
  const importing = library.imports.some((item) => isActiveYouTubeImport(item.status))

  function toggleVisibility(value: YouTubeVisibility, checked: boolean) {
    setVisibilities((current) =>
      checked ? [...current, value] : current.filter((item) => item !== value)
    )
  }

  return (
    <div className="youtube-import-consent">
      <div>
        <h2 className="text-lg font-semibold">{t('title')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('description')}</p>
      </div>
      <fieldset disabled={library.connecting || importing} className="space-y-2">
        <legend className="mb-2 text-sm font-medium">{t('visibilityLabel')}</legend>
        <div className="youtube-import-visibilities">
          {(['public', 'unlisted', 'private'] as const).map((value) => (
            <label key={value} className="youtube-import-checkbox">
              <input
                type="checkbox"
                checked={visibilities.includes(value)}
                onChange={(event) => toggleVisibility(value, event.target.checked)}
              />
              <span>{t(`visibility.${value}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="youtube-import-disclosure">
        <p id={`${id}-disclosure`} className="text-sm leading-relaxed">{t('disclosure')}</p>
        <label className="youtube-import-checkbox mt-3 items-start">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            aria-describedby={`${id}-disclosure`}
            disabled={library.connecting || importing}
          />
          <span>{t('consent')}</span>
        </label>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-6 text-xs text-muted-foreground">
          <Link href="/privacy" className="underline underline-offset-2">{t('privacy')}</Link>
          <a
            href="https://myaccount.google.com/connections"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {t('googlePermissions')}
          </a>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={!consent || visibilities.length === 0 || library.connecting || importing}
          onClick={() => library.connect(visibilities)}
          aria-busy={library.connecting}
        >
          {library.connecting
            ? <LoadingIndicator className="size-4" />
            : <Youtube className="size-4" aria-hidden="true" />}
          {t(library.connecting ? 'connecting' : 'connect')}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('exportTime')}</p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t('eligibility')}</p>
    </div>
  )
}

function ImportStatus({ item, library }: { item: YouTubeImport; library: YouTubeImportLibrary }) {
  const t = useTranslations('create.youtubeImport')
  const active = isActiveYouTubeImport(item.status)
  return (
    <div className="youtube-import-status">
      <div className="min-w-0 space-y-1" role="status">
        <p className="flex items-center gap-2 text-sm font-medium">
          {active && <LoadingIndicator className="size-4 shrink-0" />}
          {t(`status.${item.status}`)}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.visibilities.map((value) => t(`visibility.${value}`)).join(' · ')}
        </p>
        {active && <p className="text-xs leading-relaxed text-muted-foreground">{t('continuesInBackground')}</p>}
        {item.status === 'failed' && <p className="text-xs leading-relaxed text-destructive">{t('importFailed')}</p>}
        {item.status === 'ready' && <p className="text-xs text-muted-foreground">{t('importedCount', { count: item.video_count })}</p>}
      </div>
      {active && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => library.remove(item.id, 'import')}
          disabled={library.removing}
          className="shrink-0"
        >
          <Link2Off className="size-4" aria-hidden="true" />
          {t('stopImport')}
        </Button>
      )}
    </div>
  )
}

export function SourceYouTubeLibrary({ library }: { library: YouTubeImportLibrary }) {
  const t = useTranslations('create.youtubeImport')
  const locale = useLocale()
  const selectionName = useId()
  const importing = library.imports.some((item) => isActiveYouTubeImport(item.status))

  if (library.loading) {
    return <p role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><LoadingIndicator className="size-4" />{t('loading')}</p>
  }

  return (
    <div className="youtube-import-library" data-testid="youtube-import-library">
      {library.loadFailed && (
        <div className="youtube-import-notice" role="alert">
          <p>{t('loadFailed')}</p>
          <Button type="button" variant="outline" onClick={() => void library.refresh()} disabled={library.refreshing}>
            <RefreshCw className="size-4" aria-hidden="true" />{t('retry')}
          </Button>
        </div>
      )}
      {!library.loadFailed && !library.enabled && (
        <div className="youtube-import-notice">
          <p role="status">{t('unavailable')}</p>
          <Button variant="outline" asChild>
            <Link href="/dashboard/create?mode=upload">{t('uploadOriginal')}</Link>
          </Button>
        </div>
      )}
      {library.enabled && !importing && library.videos.length === 0 && <ImportConsent library={library} />}
      {library.imports.length > 0 && (
        <section className="space-y-2" aria-label={t('importsLabel')}>
          {library.imports.map((item) => <ImportStatus key={item.id} item={item} library={library} />)}
          <p className="text-xs leading-relaxed text-muted-foreground">{t('disconnectHelp')}</p>
        </section>
      )}
      <section className="space-y-3" aria-label={t('libraryLabel')}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t('libraryLabel')}</h2>
          <Button
            type="button"
            variant="ghost"
            aria-label={t('refresh')}
            disabled={library.refreshing}
            onClick={() => void library.refresh()}
          >
            {library.refreshing ? <LoadingIndicator className="size-4" /> : <RefreshCw className="size-4" aria-hidden="true" />}
          </Button>
        </div>
        {library.videos.length === 0 ? (
          <div className="youtube-import-empty">
            <FileVideo className="size-7" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{t('selectVideo')}</p>
            <div className="youtube-import-videos">
              {library.videos.map((video) => (
                <div key={video.id} className="youtube-import-video" data-selected={library.selectedVideo?.id === video.id || undefined}>
                  <label className="youtube-import-video-choice">
                    <input
                      type="radio"
                      name={selectionName}
                      checked={library.selectedVideo?.id === video.id}
                      onChange={() => library.selectVideo(video.id)}
                    />
                    <FileVideo className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 space-y-1">
                      <span className="block break-words text-sm font-medium">{video.title || video.file_name}</span>
                      <span className="block text-xs text-muted-foreground">{(video.file_size / 1024 ** 2).toLocaleString(locale, { maximumFractionDigits: 1 })} MB</span>
                    </span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={t('deleteVideo', { title: video.title || video.file_name })}
                    disabled={library.removing}
                    onClick={() => library.remove(video.id, 'video')}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{t('deleteHelp')}</p>
          </>
        )}
      </section>
      {library.enabled && !importing && library.videos.length > 0 && (
        <details className="youtube-import-more">
          <summary>{t('importMore')}</summary>
          <ImportConsent library={library} />
        </details>
      )}
    </div>
  )
}
