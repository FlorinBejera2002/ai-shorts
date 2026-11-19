import type { ContentPlatform } from '@/lib/content-calendar'
import { useTranslations } from 'next-intl'
import { useRef, useState, type PointerEvent } from 'react'
import { CaptionPreview } from './caption-preview'
import { legacyCaptionStyle, type CaptionStyle } from './caption-style'
import { LogoPreview } from './logo-preview'
import { PreviewGuides } from './preview-guides'
import { PreviewMediaLayer } from './preview-media'
import { PreviewPlayback } from './preview-playback'
import { CAPTION_TARGETS, NO_GUIDES, snapAxis, type SnapGuides } from './preview-snap'
import { SocialPreviewOverlay } from './social-preview-overlay'
import type { BrandKit, BrandKitUpdate, PreviewRatio } from './types'
import type { useBrandPreviewMedia } from './use-brand-preview-media'
import type { useBrandPreviewPlayer } from './use-brand-preview-player'
import styles from './preview-card.module.css'

type Dragging = 'caption' | 'logo' | null

function dragTarget(event: PointerEvent<HTMLElement>): Dragging {
  const target = event.target as Element
  if (target.closest('[data-brand-caption]')) return 'caption'
  if (target.closest('[data-brand-logo-preview]')) return 'logo'
  return null
}

/** The clip with captions and logo: drag either one (guides and snapping), player bar, social simulation. */
export function PreviewStage({
  kit,
  logoUrl,
  update,
  ratio,
  safeZone,
  socialPlatform,
  accountName,
  source,
  player
}: {
  kit: BrandKit
  logoUrl: string | null
  update: BrandKitUpdate
  ratio: PreviewRatio
  safeZone: boolean
  socialPlatform?: ContentPlatform
  accountName?: string
  source: ReturnType<typeof useBrandPreviewMedia>
  player: ReturnType<typeof useBrandPreviewPlayer>
}) {
  const t = useTranslations('brand')
  const frame = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<Dragging>(null)
  const [guides, setGuides] = useState<SnapGuides>(NO_GUIDES)
  const style = legacyCaptionStyle(kit)
  const video = source.media?.type === 'video'

  function moveCaption(position: CaptionStyle['position'], size: number) {
    const x = snapAxis(position.x, 0, CAPTION_TARGETS.x)
    const y = snapAxis(position.y, 0, CAPTION_TARGETS.y)
    setGuides({ x: x.guide, y: y.guide })
    update('captionStyle', { ...style, size, position: { ...position, x: x.value, y: y.value } })
  }

  function endDrag() {
    setDragging(null)
    setGuides(NO_GUIDES)
  }

  return (
    <div
      ref={frame}
      className={styles.stageWrap}
      data-ratio={ratio}
      data-drag={dragging ?? undefined}
      data-social={socialPlatform ? '' : undefined}
      onPointerDownCapture={(event) => setDragging(dragTarget(event))}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      <CaptionPreview
        style={style}
        ratio={ratio}
        className={styles.stage}
        fitWidth={true}
        safeGuides={false}
        showSelection={false}
        // Captions follow the clip while it plays; otherwise the sample phrase keeps looping.
        playbackTime={video && player.state.playing ? player.state.time : undefined}
        playing={true}
        onPositionChange={(position) => update('captionStyle', { ...style, position })}
        onTransformChange={moveCaption}
        underlay={
          <>
            <PreviewMediaLayer
              media={source.media}
              video={player.video}
              muted={player.state.muted}
              loading={source.loading}
              label={t('editor.clipLabel')}
              onMediaChange={player.readMedia}
              onMediaError={player.failMedia}
            />
            <span className={styles.dim} aria-hidden="true" />
            <PreviewGuides safeZone={safeZone || dragging !== null} grid={dragging !== null} active={guides} />
          </>
        }
        overlay={socialPlatform ? <SocialPreviewOverlay platform={socialPlatform} accountName={accountName} /> : undefined}
      >
        {logoUrl && kit.watermarkEnabled && (
          <LogoPreview kit={kit} src={logoUrl} label={t('yourLogo')} ratio={ratio} selected={dragging === 'logo'} update={update} onGuides={setGuides} />
        )}
      </CaptionPreview>
      {video && !socialPlatform && (
        <PreviewPlayback
          state={player.state}
          onTogglePlayback={() => void player.togglePlayback()}
          onSeek={player.seek}
          onToggleMute={player.toggleMute}
          onFullscreen={() => void frame.current?.requestFullscreen?.().catch(() => {})}
        />
      )}
    </div>
  )
}
