import { useState } from 'react'
import type { ContentPlatform } from '@/lib/content-calendar'
import { PreviewPanelControls, PreviewPanelFooter } from './preview-panel-controls'
import { PreviewStage } from './preview-stage'
import { useBrandPreviewMedia } from './use-brand-preview-media'
import { useBrandPreviewPlayer } from './use-brand-preview-player'
import type { BrandKit, BrandKitUpdate, PreviewRatio } from './types'
import styles from './preview-panel.module.css'

type PreviewPresentation = 'panel' | 'compact' | 'expanded'
type PreviewSection = 'overview' | 'logo' | 'styles' | 'typography' | 'colors' | 'layout' | 'preview'

export function PreviewPanel({
  kit, logoUrl, canWhiteLabel, update, presentation = 'panel', section = 'overview',
  onExpand, ratio: controlledRatio, onRatioChange
}: {
  kit: BrandKit
  logoUrl: string | null
  canWhiteLabel: boolean
  update: BrandKitUpdate
  presentation?: PreviewPresentation
  section?: PreviewSection
  onExpand?: () => void
  ratio?: PreviewRatio
  onRatioChange?: (ratio: PreviewRatio) => void
}) {
  const [localRatio, setLocalRatio] = useState<PreviewRatio>('9:16')
  const [mode, setMode] = useState<'canvas' | 'social'>('canvas')
  const [platform, setPlatform] = useState<ContentPlatform>('instagram')
  const [guides, setGuides] = useState(true)
  const source = useBrandPreviewMedia()
  const player = useBrandPreviewPlayer(source.media?.url)
  const ratio = controlledRatio ?? localRatio
  const compact = presentation === 'compact'
  const wideCompact = compact && ['styles', 'typography', 'colors'].includes(section)
  const social = !compact && mode === 'social'
  const stageRatio = social ? '9:16' : wideCompact ? '16:9' : ratio

  function changeRatio(next: PreviewRatio) {
    if (onRatioChange) onRatioChange(next)
    else setLocalRatio(next)
  }

  return (
    <aside className={styles.panel} data-brand-preview="" data-presentation={presentation} data-section={section}>
      <PreviewPanelControls presentation={presentation} mode={mode} platform={platform} ratio={ratio} wideCompact={wideCompact} onModeChange={setMode} onPlatformChange={setPlatform} onRatioChange={changeRatio} />
      <PreviewStage
        kit={kit}
        logoUrl={logoUrl}
        canWhiteLabel={canWhiteLabel}
        update={update}
        ratio={stageRatio}
        compact={compact}
        wideCompact={wideCompact}
        showSelection={section === 'layout'}
        guides={guides}
        socialPlatform={social ? platform : undefined}
        source={source}
        player={player}
        onExpand={onExpand}
      />
      <PreviewPanelFooter compact={compact} social={social} guides={guides} source={source} player={player} onGuidesChange={setGuides} />
    </aside>
  )
}
