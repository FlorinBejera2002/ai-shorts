'use client'

import { ChevronDown, Youtube } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import theme from '@/components/calendar/publishing-theme.module.css'
import { useYouTubeChannel } from './use-youtube-channel'
import './youtube-path.css'

/**
 * Connected YouTube account as a pill with a menu to switch or disconnect it. Renders nothing
 * until a channel is connected, so the page shell can place it unconditionally.
 */
export function YouTubeAccountPill({ className = '' }: { className?: string }) {
  const t = useTranslations('create.youtubeChannel')
  const channel = useYouTubeChannel()
  const account = channel.status.connected ? channel.status.account : null
  if (!account) return null

  const initial = account.title.trim().charAt(0).toUpperCase() || 'Y'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`yt-account-pill ${className}`.trim()}
          aria-label={t('accountLabel', { title: account.title })}
        >
          <span className="yt-account-pill__avatar" aria-hidden="true">
            {account.avatar_url ? <img src={account.avatar_url} alt="" /> : initial}
          </span>
          <span className="yt-account-pill__text">
            <span className="yt-account-pill__name">{account.title}</span>
            <span className="yt-account-pill__status">
              <Youtube className="size-3" aria-hidden="true" />
              {t('connectedStatus')}
            </span>
          </span>
          <ChevronDown className="yt-account-pill__chevron" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={`yt-account-menu ${theme.overlay}`} data-reference-surface="">
        <DropdownMenuItem onSelect={() => channel.connect()} disabled={channel.connecting}>
          {t('switchAccount')}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => channel.disconnect()}
          disabled={channel.disconnecting}
        >
          {t('disconnect')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
