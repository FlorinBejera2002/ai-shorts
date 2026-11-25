'use client'

import type { VideoAspectRatio } from '@/lib/platform-formats'
import { AdvancedOptions } from './advanced-options'
import { AspectRatioField } from './aspect-ratio-field'
import { BrandKitSelector } from './brand-kit-selector'
import { ClipCountField } from './clip-count-field'
import { SubtitleField } from './subtitle-field'

export type AspectRatio = VideoAspectRatio
export type SubtitleStyle = 'clean' | 'bold' | 'caption-box' | 'none'

export interface CreateSettings {
  reduceBackgroundNoise?: boolean
  /** 0 = Auto (the backend decides), otherwise 1..30. */
  clips: number
  aspectRatio: AspectRatio
  subtitleStyle: SubtitleStyle
  includeBrand: boolean
  /** Kit applied to the video; null uses the default kit. */
  brandKitId?: string | null
  language: string
  smartCrop: boolean
}

interface SettingsPanelProps {
  settings: CreateSettings
  onChange: (settings: CreateSettings) => void
}

/** Inspector for the YouTube path. Sections are separated by spacing only. */
export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  return (
    <div className="yt-inspector-sections">
      <ClipCountField clips={settings.clips} onChange={(clips) => onChange({ ...settings, clips })} />
      <AspectRatioField
        value={settings.aspectRatio}
        onChange={(aspectRatio) => onChange({ ...settings, aspectRatio })}
      />
      <SubtitleField
        style={settings.subtitleStyle}
        onChange={(subtitleStyle) => onChange({ ...settings, subtitleStyle })}
      />
      <BrandKitSelector
        enabled={settings.includeBrand}
        onChange={(includeBrand) => onChange({ ...settings, includeBrand })}
        kitId={settings.brandKitId ?? null}
        onKitChange={(brandKitId) => onChange({ ...settings, includeBrand: brandKitId !== null, brandKitId })}
      />
      <AdvancedOptions settings={settings} onChange={onChange} />
    </div>
  )
}
