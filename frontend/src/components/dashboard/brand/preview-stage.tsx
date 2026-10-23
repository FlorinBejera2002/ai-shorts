import { Button } from '@/components/ui/button'
import type { ContentPlatform } from '@/lib/content-calendar'
import { Expand } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef } from 'react'
import { CaptionPreview } from './caption-preview'
import { legacyCaptionStyle } from './caption-style'
import { LogoPreview } from './logo-preview'
import { PreviewMediaLayer } from './preview-media'
import { PreviewPlayback } from './preview-playback'
import { SocialPreviewOverlay } from './social-preview-overlay'
import type { BrandKit, BrandKitUpdate, PreviewRatio } from './types'
import type { useBrandPreviewMedia } from './use-brand-preview-media'
import type { useBrandPreviewPlayer } from './use-brand-preview-player'
import styles from './preview-panel.module.css'

export function PreviewStage({ kit, logoUrl, canWhiteLabel, update, ratio, compact, wideCompact, showSelection, guides, socialPlatform, source, player, onExpand }: {
  kit: BrandKit
  logoUrl: string | null
  canWhiteLabel: boolean
  update: BrandKitUpdate
  ratio: PreviewRatio
  compact: boolean
  wideCompact: boolean
  showSelection: boolean
  guides: boolean
  socialPlatform?: ContentPlatform
  source: ReturnType<typeof useBrandPreviewMedia>
  player: ReturnType<typeof useBrandPreviewPlayer>
  onExpand?: () => void
}) {
  const t = useTranslations('brand')
  const frame = useRef<HTMLDivElement>(null)
  const style = legacyCaptionStyle(kit)

  function expand() {
    if (compact && onExpand) { onExpand(); return }
    if (frame.current?.requestFullscreen) {
      void frame.current.requestFullscreen().catch(() => onExpand?.())
    } else onExpand?.()
  }

  return (
    <div ref={frame} className={styles.stageWrap} data-ratio={ratio} data-compact={compact} data-wide={wideCompact} data-social={Boolean(socialPlatform)}>
      <CaptionPreview
        style={style}
        ratio={ratio}
        className={styles.stage}
        fitWidth={true}
        safeGuides={guides}
        showSelection={showSelection}
        playbackTime={source.media?.type === 'video' ? player.state.time : undefined}
        playing={source.media?.type !== 'video'}
        onPositionChange={position => update('captionStyle', { ...style, position })}
        onTransformChange={(position, size) => update('captionStyle', { ...style, position, size })}
        underlay={<PreviewMediaLayer media={source.media} video={player.video} muted={player.state.muted} loading={source.loading} failed={source.failed} onMediaChange={player.readMedia} onMediaError={player.failMedia} />}
        overlay={socialPlatform ? <SocialPreviewOverlay platform={socialPlatform} /> : undefined}
      >
        {logoUrl && kit.watermarkEnabled && <LogoPreview kit={kit} src={logoUrl} label={t('yourLogo')} ratio={ratio} update={update} />}
        {(!canWhiteLabel || !kit.hidePlatformBadge) && <img src="/logo-icon.svg" className={styles.platformBadge} alt={t('platformBadge')} aria-label={t('platformBadge')} data-brand-platform-badge="" />}
      </CaptionPreview>
      {source.media?.type === 'video' ? (
        <PreviewPlayback state={player.state} compact={compact} onExpand={expand} onTogglePlayback={() => void player.togglePlayback()} onSeek={player.seek} onToggleMute={player.toggleMute} />
      ) : (
        <Button type="button" size="icon" variant="ghost" className={styles.imageExpand} onClick={expand} aria-label={t('previewDesign.expand')} data-brand-preview-expand=""><Expand className="size-4" /></Button>
      )}
    </div>
  )
}
