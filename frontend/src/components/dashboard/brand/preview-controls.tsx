import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Button } from '@/components/ui/button'
import type { ContentPlatform } from '@/lib/content-calendar'
import { Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { PreviewRatio } from './types'
import styles from './preview-panel.module.css'

export function PreviewRatioControls({ ratio, onChange, expanded = false }: {
  ratio: PreviewRatio
  onChange: (ratio: PreviewRatio) => void
  expanded?: boolean
}) {
  const t = useTranslations('brand.previewDesign')
  return (
    <div className={`${styles.ratios} ${expanded ? styles.expandedRatios : ''}`} aria-label={t('aspectRatio')}>
      {(['9:16', '1:1', '16:9'] as const).map(value => (
        <Button type="button" key={value} variant="outline" aria-pressed={ratio === value} data-brand-ratio={value} onClick={() => onChange(value)}>
          {value}
        </Button>
      ))}
    </div>
  )
}

export function PreviewModeControls({ mode, onChange }: {
  mode: 'canvas' | 'social'
  onChange: (mode: 'canvas' | 'social') => void
}) {
  const t = useTranslations('brand.previewDesign')
  return (
    <div className={styles.modes} aria-label={t('mode')}>
      {(['canvas', 'social'] as const).map(value => (
        <Button type="button" key={value} variant="outline" aria-pressed={mode === value} data-brand-preview-mode={value} onClick={() => onChange(value)}>
          {t(value)}
        </Button>
      ))}
    </div>
  )
}

export function SocialPlatformControls({ platform, onChange }: {
  platform: ContentPlatform
  onChange: (platform: ContentPlatform) => void
}) {
  const t = useTranslations('brand.previewDesign')
  const platforms: ContentPlatform[] = ['instagram', 'tiktok', 'youtube', 'facebook']
  return (
    <div className={styles.platforms} aria-label={t('platform')}>
      {platforms.map(value => (
        <button type="button" key={value} className={styles.platform} aria-pressed={platform === value} data-brand-social-platform={value} onClick={() => onChange(value)}>
          <span>
            <PlatformBrandIcon provider={value} className="size-8" />
            {platform === value && <Check className={styles.platformCheck} />}
          </span>
          <small>{t(`platforms.${value}`)}</small>
        </button>
      ))}
    </div>
  )
}
