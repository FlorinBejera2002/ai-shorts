'use client'

import { ChevronDown, RectangleHorizontal, RectangleVertical, Square, Type } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAudioCleanupAvailability } from '@/hooks/use-audio-cleanup-availability'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import type { VideoAspectRatio } from '@/lib/platform-formats'
import { BrandKitSelector } from './brand-kit-selector'

export type AspectRatio = VideoAspectRatio
export type SubtitleStyle = 'clean' | 'bold' | 'caption-box' | 'none'

export interface CreateSettings {
  reduceBackgroundNoise?: boolean
  clips: number
  aspectRatio: AspectRatio
  subtitleStyle: SubtitleStyle
  includeBrand: boolean
  language: string
  smartCrop: boolean
}

const LANGUAGES = [
  { value: '', labelKey: 'languageAuto' },
  { value: 'en', label: 'English' },
  { value: 'ro', label: 'Română' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
  { value: 'pl', label: 'Polski' }
] as const

const ASPECT_RATIOS = [
  { value: '9:16', Icon: RectangleVertical },
  { value: '1:1', Icon: Square },
  { value: '16:9', Icon: RectangleHorizontal }
] as const

interface SettingsPanelProps {
  settings: CreateSettings
  onChange: (settings: CreateSettings) => void
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const t = useTranslations('create')
  const audio = useTranslations('audioCleanup')
  const cleanup = useAudioCleanupAvailability()

  return (
    <div className="creation-settings">
      <section className="creation-settings-clips">
        <h2>{t('clipsPerVideo')}</h2>
        <div className="creation-clips-row">
          <div className="min-w-0">
            <Slider
              id="create-clips-count"
              aria-label={t('clipsPerVideo')}
              min={1}
              max={15}
              value={[settings.clips]}
              onValueChange={([clips = settings.clips]) => onChange({ ...settings, clips })}
            />
            <div className="creation-slider-limits" aria-hidden="true"><span>1</span><span>15</span></div>
          </div>
          <output className="creation-clip-count" htmlFor="create-clips-count">{settings.clips}</output>
        </div>
      </section>

      <section className="creation-settings-ratios">
        <h2>{t('aspectRatio')}</h2>
        <div className="creation-ratio-choices">
          {ASPECT_RATIOS.map(({ value, Icon }) => (
            <button
              key={value}
              type="button"
              aria-label={value}
              aria-pressed={settings.aspectRatio === value}
              onClick={() => onChange({ ...settings, aspectRatio: value })}
            >
              <Icon className="size-6" aria-hidden="true" strokeWidth={1.5} />
              <span>{value}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="creation-settings-subtitles">
        <div className="creation-setting-heading">
          <Label htmlFor="create-subtitles">{t('subtitles')}</Label>
          <Switch
            id="create-subtitles"
            checked={settings.subtitleStyle !== 'none'}
            onCheckedChange={(enabled) => onChange({ ...settings, subtitleStyle: enabled ? 'clean' : 'none' })}
          />
        </div>
        <Select
          value={settings.subtitleStyle === 'none' ? '' : settings.subtitleStyle}
          onValueChange={(subtitleStyle: SubtitleStyle) => onChange({ ...settings, subtitleStyle })}
        >
          <SelectTrigger aria-label={t('subtitles')} className="w-full">
            <Type className="size-4" aria-hidden="true" />
            <SelectValue placeholder={t('subtitleNone')} />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="clean">{t('subtitleClean')}</SelectItem>
            <SelectItem value="bold">{t('subtitleBold')}</SelectItem>
            <SelectItem value="caption-box">{t('subtitleCaptionBox')}</SelectItem>
          </SelectContent>
        </Select>
      </section>

      <BrandKitSelector
        enabled={settings.includeBrand}
        onChange={(includeBrand) => onChange({ ...settings, includeBrand })}
      />

      <details className="creation-advanced">
        <summary>{t('advanced')}<ChevronDown className="size-4" aria-hidden="true" /></summary>
        <div className="creation-advanced-fields">
          <div className="space-y-2">
            <Label htmlFor="create-language">{t('language')}</Label>
            <Select
              value={settings.language || 'auto'}
              onValueChange={(value) => onChange({ ...settings, language: value === 'auto' ? '' : value })}
            >
              <SelectTrigger id="create-language" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent position="popper" align="start">
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value || 'auto'} value={lang.value || 'auto'}>
                    {'labelKey' in lang ? t(lang.labelKey) : lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="creation-setting-heading">
            <Label htmlFor="create-smart-crop">{t('smartCrop')}</Label>
            <Switch
              id="create-smart-crop"
              checked={settings.smartCrop}
              onCheckedChange={(smartCrop) => onChange({ ...settings, smartCrop })}
            />
          </div>
          <div className="space-y-2">
            <div className="creation-setting-heading">
              <Label htmlFor="create-noise-reduction">{audio('title')}</Label>
              <Switch
                id="create-noise-reduction"
                aria-describedby="create-noise-availability"
                disabled={!cleanup.available && !settings.reduceBackgroundNoise}
                checked={settings.reduceBackgroundNoise ?? false}
                onCheckedChange={(reduceBackgroundNoise) => {
                  if (!reduceBackgroundNoise || cleanup.available) onChange({ ...settings, reduceBackgroundNoise })
                }}
              />
            </div>
            <p id="create-noise-availability" className="text-xs leading-5 text-muted-foreground">
              {cleanup.available
                ? audio('help')
                : audio(cleanup.loading ? 'checkingAvailability' : settings.reduceBackgroundNoise ? 'unavailableSelected' : 'unavailableOption')}
            </p>
          </div>
        </div>
      </details>
    </div>
  )
}
