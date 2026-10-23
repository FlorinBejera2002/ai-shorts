import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { ContentPlatform } from '@/lib/content-calendar'
import { RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PreviewModeControls, PreviewRatioControls, SocialPlatformControls } from './preview-controls'
import { PreviewMediaPicker } from './preview-media'
import type { PreviewRatio } from './types'
import type { useBrandPreviewMedia } from './use-brand-preview-media'
import type { useBrandPreviewPlayer } from './use-brand-preview-player'
import styles from './preview-panel.module.css'

export function PreviewPanelControls({ presentation, mode, platform, ratio, wideCompact, onModeChange, onPlatformChange, onRatioChange }: {
  presentation: 'panel' | 'compact' | 'expanded'
  mode: 'canvas' | 'social'
  platform: ContentPlatform
  ratio: PreviewRatio
  wideCompact: boolean
  onModeChange: (mode: 'canvas' | 'social') => void
  onPlatformChange: (platform: ContentPlatform) => void
  onRatioChange: (ratio: PreviewRatio) => void
}) {
  const t = useTranslations('brand')
  const compact = presentation === 'compact'
  const social = !compact && mode === 'social'
  return (
    <>
      {presentation !== 'expanded' && (
        <header className={styles.header}>
          <h2>{t('preview')}</h2>
          {!social && !wideCompact && <PreviewRatioControls ratio={ratio} onChange={onRatioChange} />}
        </header>
      )}
      {!compact && <PreviewModeControls mode={mode} onChange={onModeChange} />}
      {social && <SocialPlatformControls platform={platform} onChange={onPlatformChange} />}
      {presentation === 'expanded' && !social && <PreviewRatioControls ratio={ratio} onChange={onRatioChange} expanded={true} />}
      {social && <p className={styles.socialLabel}>{t(`previewDesign.contexts.${platform}`)}</p>}
    </>
  )
}

export function PreviewPanelFooter({ compact, social, guides, source, player, onGuidesChange }: {
  compact: boolean
  social: boolean
  guides: boolean
  source: ReturnType<typeof useBrandPreviewMedia>
  player: ReturnType<typeof useBrandPreviewPlayer>
  onGuidesChange: (guides: boolean) => void
}) {
  const t = useTranslations('brand')
  return (
    <>
      {player.state.failed && (
        <div className={styles.previewError} role="alert">
          {t('previewDesign.playbackError')}
          <Button type="button" variant="ghost" size="sm" onClick={player.reload}><RotateCcw className="size-3" />{t('retry')}</Button>
        </div>
      )}
      {!compact && (
        <>
          <div className={styles.guideRow}>
            <label><Switch checked={guides} onCheckedChange={onGuidesChange} aria-label={t('previewDesign.safeGuides')} data-brand-safe-guides="" />{t('previewDesign.safeGuides')}</label>
            {social && <span>{t('previewDesign.simulation')}</span>}
          </div>
          <p className={styles.hint}>{social ? t('previewDesign.socialHint') : t('dragCaptionHint')}</p>
        </>
      )}
      <PreviewMediaPicker failed={source.failed && !source.media} onChoose={source.chooseFile} onRetry={source.retry} />
    </>
  )
}
