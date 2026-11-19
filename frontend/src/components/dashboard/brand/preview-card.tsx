'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import type { ContentPlatform } from '@/lib/content-calendar'
import { Crop, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Segmented } from './editor-controls'
import { moveRadio } from './editor-utils'
import { PreviewStage } from './preview-stage'
import type { BrandKit, BrandKitUpdate, PreviewRatio } from './types'
import type { useBrandPreviewMedia } from './use-brand-preview-media'
import type { useBrandPreviewPlayer } from './use-brand-preview-player'
import editor from './brand-editor.module.css'
import styles from './preview-card.module.css'

type Display = 'canvas' | ContentPlatform
const DISPLAYS: Display[] = ['canvas', 'instagram', 'facebook', 'tiktok', 'youtube']
const RATIOS: PreviewRatio[] = ['9:16', '1:1', '16:9']

/** "Afișează pe": the plain clip, or the clip inside each platform's player. */
function DisplayTargets({ value, onChange }: { value: Display; onChange: (value: Display) => void }) {
  const t = useTranslations('brand')
  return (
    <div role="radiogroup" aria-label={t('editor.showOn')} className={styles.targets} onKeyDown={(event) => moveRadio(event, DISPLAYS, value, onChange)}>
      {DISPLAYS.map((display) => {
        const name = display === 'canvas' ? t('previewDesign.canvas') : t(`previewDesign.platforms.${display}`)
        return [
          <button
            key={display}
            type="button"
            role="radio"
            aria-checked={value === display}
            aria-label={name}
            title={name}
            tabIndex={value === display ? 0 : -1}
            className={styles.target}
            onClick={() => onChange(display)}
            data-brand-display={display}
          >
            {display === 'canvas' ? (
              <span className={styles.canvasIcon}>
                <Crop aria-hidden="true" />
              </span>
            ) : (
              <PlatformBrandIcon provider={display} />
            )}
          </button>,
          display === 'canvas' && <span key="divider" className={styles.divider} aria-hidden="true" />
        ]
      })}
    </div>
  )
}

/** Canvas Br-NoClip: no library clip yet — choose a local video or photo for the preview. */
function NoClip({ failed, onChoose, onRetry }: { failed: boolean; onChoose: (file: File) => void; onRetry: () => void }) {
  const t = useTranslations('brand')
  return (
    <div className={styles.noClip} data-brand-no-clip="">
      <img src="/illustrations/brand-noclip.webp" alt={t('editor.noClipIllustration')} width={140} height={140} />
      <b>{t('editor.noClipTitle')}</b>
      <small className={editor.muted}>{t('editor.noClipText')}</small>
      <label className={`${editor.button} ${editor.primary} ${editor.fileButton} ${styles.noClipButton}`}>
        <Upload aria-hidden="true" />
        {t('editor.chooseMedia')}
        <input
          type="file"
          accept="video/*,image/*"
          className={editor.fileInput}
          aria-label={t('editor.chooseMedia')}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) onChoose(file)
          }}
        />
      </label>
      {failed && (
        <button type="button" className={`${editor.button} ${editor.ghost} ${editor.smallButton}`} onClick={onRetry}>
          {t('retry')}
        </button>
      )}
    </div>
  )
}

export function PreviewCard({
  kit,
  logoUrl,
  update,
  accountName,
  safeZone,
  source,
  player
}: {
  kit: BrandKit
  logoUrl: string | null
  update: BrandKitUpdate
  accountName?: string
  safeZone: boolean
  source: ReturnType<typeof useBrandPreviewMedia>
  player: ReturnType<typeof useBrandPreviewPlayer>
}) {
  const t = useTranslations('brand')
  const [ratio, setRatio] = useState<PreviewRatio>('9:16')
  const [display, setDisplay] = useState<Display>('canvas')
  const social = display === 'canvas' ? undefined : display
  return (
    <section className={`${editor.card} ${styles.card}`} aria-label={t('preview')} data-brand-preview="" data-display={display}>
      <div className={styles.top}>
        {social ? (
          <span className={styles.chip}>{t('previewDesign.simulation')}</span>
        ) : (
          <Segmented
            label={t('previewDesign.aspectRatio')}
            className={styles.ratios}
            value={ratio}
            options={RATIOS.map((value) => ({ value, label: value }))}
            onChange={setRatio}
          />
        )}
      </div>
      <DisplayTargets value={display} onChange={setDisplay} />
      {social && <span className={styles.placement}>{t(`editor.placements.${social}`)}</span>}
      {source.media || source.loading ? (
        <PreviewStage
          kit={kit}
          logoUrl={logoUrl}
          update={update}
          ratio={social ? '9:16' : ratio}
          safeZone={safeZone}
          socialPlatform={social}
          accountName={accountName}
          source={source}
          player={player}
        />
      ) : (
        <NoClip failed={source.failed} onChoose={source.chooseFile} onRetry={source.retry} />
      )}
      {player.state.failed && (
        <p role="alert" className={styles.alert}>
          {t('previewDesign.playbackError')}
          <button type="button" onClick={player.reload}>
            {t('retry')}
          </button>
        </p>
      )}
    </section>
  )
}
