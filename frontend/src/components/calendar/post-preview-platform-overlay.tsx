'use client'

import type { ContentPlatform } from '@/lib/content-calendar'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { PreviewIcon, type PreviewGlyph } from './post-preview-platform-glyphs'
import styles from './post-preview-platform-overlay.module.css'

export type PreviewPlatform = Extract<ContentPlatform, 'instagram' | 'facebook' | 'tiktok' | 'youtube'>

type OverlayProps = {
  accountName?: string
  caption: string
  /** Shows the phone status bar and the platform navigation bar (expanded preview). */
  chrome: boolean
}

type NavItem = {
  key: string
  label?: string
  glyph?: PreviewGlyph
  node?: ReactNode
  active?: boolean
  dimmed?: boolean
}

function StatusBar({ signal = true }: { signal?: boolean }) {
  return (
    <div className={styles.status}>
      <span>9:41</span>
      <span className={styles.statusIcons}>
        {signal && <PreviewIcon name="cellular" size={18} />}
        <PreviewIcon name="wifi" size={16} />
        <PreviewIcon name="battery" size={24} />
      </span>
    </div>
  )
}

function Nav({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <nav aria-label={label} className={styles.nav}>
      {items.map(item => (
        <span key={item.key} className={styles.navItem} data-active={item.active ? 'on' : undefined} data-dimmed={item.dimmed ? 'on' : undefined}>
          {item.node ?? (item.glyph && <PreviewIcon name={item.glyph} size={26} />)}
          {item.label && <span>{item.label}</span>}
        </span>
      ))}
      <span className={styles.homeIndicator} />
    </nav>
  )
}

function Avatar({ className }: { className?: string }) {
  return <span className={`${styles.avatar} ${className ?? ''}`} />
}

function Count({ glyph, label, count, size }: { glyph: PreviewGlyph; label?: string; count?: string; size?: number }) {
  return (
    <span className={styles.railItem}>
      <span className={styles.railIcon}><PreviewIcon name={glyph} size={size ?? 28} /></span>
      {count !== undefined && <span>{count}</span>}
      {label && <span>{label}</span>}
    </span>
  )
}

function InstagramOverlay({ accountName, caption, chrome }: OverlayProps) {
  const t = useTranslations('contentCalendar.platformPreview')
  const navItems: NavItem[] = [
    { key: 'home', glyph: 'home' },
    { key: 'reels', glyph: 'reels' },
    { key: 'send', glyph: 'send' },
    { key: 'search', glyph: 'search' },
    { key: 'profile', node: <Avatar className={styles.navAvatar} /> }
  ]
  return (
    <>
      {chrome && <StatusBar />}
      <div className={styles.reelsTabs}>
        <span>{t('reels')}</span>
        <span className={styles.dimmed}>{t('friends')}</span>
      </div>
      <div className={styles.rail}>
        <Count glyph="heart" />
        <Count glyph="comment" />
        <Count glyph="repost" />
        <Count glyph="send" />
        <PreviewIcon name="dots" size={24} />
        <span className={styles.audioCover} />
      </div>
      <div className={styles.meta}>
        <span className={styles.accountRow}>
          <Avatar />
          {accountName && <b>{accountName}</b>}
          <span className={styles.outlineButton}>{t('follow')}</span>
        </span>
        <span className={styles.caption}>{caption}</span>
        <span className={styles.sound}><PreviewIcon name="note" size={12} />{t('instagramAudio', { account: accountName ?? '' })}</span>
      </div>
      {chrome && <Nav label={t('navigationInstagram')} items={navItems} />}
    </>
  )
}

function FacebookOverlay({ accountName, caption, chrome }: OverlayProps) {
  const t = useTranslations('contentCalendar.platformPreview')
  const navItems: NavItem[] = [
    { key: 'home', glyph: 'home', label: t('home'), dimmed: true },
    { key: 'friends', glyph: 'friends', label: t('friends'), dimmed: true },
    { key: 'reels', glyph: 'reels', label: 'Reels', active: true },
    { key: 'marketplace', glyph: 'marketplace', label: t('marketplace'), dimmed: true },
    { key: 'bell', glyph: 'bell', label: t('notifications'), dimmed: true },
    { key: 'menu', glyph: 'menu', label: t('menu'), dimmed: true }
  ]
  return (
    <>
      {chrome && <StatusBar signal={false} />}
      <div className={styles.topRow}>
        <span className={styles.pill}>{t('forYou')}</span>
        <span className={styles.explore}>{t('explore')}</span>
        <span className={styles.topIcons}>
          <PreviewIcon name="person" size={26} />
          <PreviewIcon name="search" size={26} />
        </span>
      </div>
      <div className={styles.rail}>
        <Count glyph="thumbsUp" />
        <Count glyph="bubble" size={28} />
        <Count glyph="share" />
      </div>
      <div className={styles.meta}>
        <span className={styles.accountRow}>
          <Avatar />
          {accountName && <b>{accountName}</b>}
          <PreviewIcon name="globe" size={13} />
          <span className={styles.outlineButton}>{t('follow')}</span>
        </span>
        <span className={styles.captionRow}>
          <span className={styles.caption}>{caption}</span>
          <PreviewIcon name="dots" size={22} />
        </span>
      </div>
      {chrome && <Nav label={t('navigationFacebook')} items={navItems} />}
    </>
  )
}

function TikTokOverlay({ accountName, caption, chrome }: OverlayProps) {
  const t = useTranslations('contentCalendar.platformPreview')
  const navItems: NavItem[] = [
    { key: 'home', glyph: 'home', label: t('home') },
    { key: 'friends', glyph: 'friends', label: t('friends'), dimmed: true },
    { key: 'create', node: <span className={styles.createTile}>+</span> },
    { key: 'inbox', glyph: 'inbox', label: t('inbox'), dimmed: true },
    { key: 'profile', glyph: 'profile', label: t('profile'), dimmed: true }
  ]
  return (
    <>
      {chrome && <StatusBar />}
      <div className={styles.topBar}>
        <PreviewIcon name="live" size={24} />
        <span className={styles.ttTabs}>
          <span className={styles.dimmed}>{t('explore')}</span>
          <span className={styles.dimmed}>{t('following')}</span>
          <span className={styles.activeTab}>{t('forYou')}<i /></span>
        </span>
        <PreviewIcon name="search" size={24} />
      </div>
      <div className={styles.rail}>
        <span className={styles.creatorAvatar}>
          <Avatar />
          <span className={styles.followBadge}>+</span>
        </span>
        <Count glyph="heart" count="0" size={36} />
        <Count glyph="bubble" count="0" size={34} />
        <Count glyph="bookmark" count="0" size={32} />
        <Count glyph="share" count="0" size={34} />
        <span className={styles.disc}><Avatar className={styles.discAvatar} /></span>
      </div>
      <div className={styles.meta}>
        {accountName && <b>{accountName}</b>}
        <span className={styles.caption}>{caption}</span>
        <span className={styles.sound}><PreviewIcon name="note" size={13} />{t('tiktokAudio', { account: accountName ?? '' })}</span>
      </div>
      {chrome && <Nav label={t('navigationTikTok')} items={navItems} />}
    </>
  )
}

function YouTubeOverlay({ accountName, caption, chrome }: OverlayProps) {
  const t = useTranslations('contentCalendar.platformPreview')
  const navItems: NavItem[] = [
    { key: 'home', glyph: 'home', label: t('home') },
    { key: 'shorts', glyph: 'shorts', label: 'Shorts' },
    { key: 'create', node: <span className={styles.createCircle}>+</span> },
    { key: 'subscriptions', glyph: 'subscriptions', label: t('subscriptions'), dimmed: true },
    { key: 'you', node: <Avatar className={styles.navAvatar} />, label: t('you'), dimmed: true }
  ]
  return (
    <>
      {chrome && <StatusBar />}
      <div className={styles.youtubeTopIcons}>
        <PreviewIcon name="search" size={24} />
        <PreviewIcon name="dots" size={24} />
      </div>
      <div className={styles.rail}>
        <Count glyph="thumbsUp" label={t('like')} size={26} />
        <Count glyph="thumbsDown" label={t('dislike')} size={26} />
        <Count glyph="bubble" count="0" size={26} />
        <Count glyph="share" label={t('share')} size={26} />
        <Count glyph="remix" label="Remix" size={26} />
        <span className={styles.audioCover} />
      </div>
      <div className={styles.meta}>
        <span className={styles.accountRow}>
          <Avatar />
          {accountName && <b>{accountName}</b>}
          <span className={styles.subscribeButton}>{t('subscribe')}</span>
        </span>
        <span className={styles.caption}>{caption}</span>
      </div>
      <span className={styles.progress}><span /></span>
      {chrome && <Nav label={t('navigationYouTube')} items={navItems} />}
    </>
  )
}

const overlays: Record<PreviewPlatform, (props: OverlayProps) => ReactNode> = {
  instagram: InstagramOverlay,
  facebook: FacebookOverlay,
  tiktok: TikTokOverlay,
  youtube: YouTubeOverlay
}

/**
 * Native-interface overlay for one platform. It sits above the real media in the
 * same stage; pointer events pass through so the media controls keep working.
 */
export function PlatformPreviewOverlay({ platform, ...props }: OverlayProps & { platform: PreviewPlatform }) {
  const Overlay = overlays[platform]
  return (
    <div className={styles.overlay} data-platform-overlay={platform} data-chrome={props.chrome ? 'on' : 'off'} aria-hidden="true">
      <span className={styles.shadeTop} />
      <span className={styles.shadeBottom} />
      <Overlay {...props} />
    </div>
  )
}
