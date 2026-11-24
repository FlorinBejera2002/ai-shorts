'use client'

import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Link } from '@/i18n/navigation'
import type { useYouTubeChannel } from './use-youtube-channel'
import { YouTubeConnectGate } from './youtube-connect-gate'

interface YouTubeAccessStateProps {
  channel: ReturnType<typeof useYouTubeChannel>
  onConnect: () => void
}

/**
 * Body of the YouTube source card until a channel is connected: loading, a failed status check,
 * the unavailable notice, or the connect gate. Shown under either source tab.
 */
export function YouTubeAccessState({ channel, onConnect }: YouTubeAccessStateProps) {
  const t = useTranslations('create')

  if (channel.isPending) {
    return <p role="status" className="yt-status"><LoadingIndicator className="size-4" />{t('youtubeChannelLoading')}</p>
  }
  if (channel.isError) {
    return (
      <div className="yt-notice" role="alert">
        <p>{t('youtubeChannelLoadFailed')}</p>
        <Button type="button" variant="outline" onClick={() => void channel.refetch()}>{t('retry')}</Button>
      </div>
    )
  }
  if (!channel.status.enabled) {
    return (
      <div className="yt-notice" role="status">
        <p>{t('youtubeUnavailable')}</p>
        <Link href="/dashboard/create?mode=upload" className="yt-secondary-button">{t('uploadInstead')}</Link>
      </div>
    )
  }
  return <YouTubeConnectGate connecting={channel.connecting} onConnect={onConnect} />
}
