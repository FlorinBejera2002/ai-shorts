'use client'

import { PlatformBrandIcon } from '@/components/publishing/platform-brand-icon'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { BrandKitSelector } from './brand-kit-selector'

import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  SOCIAL_PLATFORMS,
  VIDEO_FORMATS,
  type VideoAspectRatio
} from '@/lib/platform-formats'
import { Languages, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

export type AspectRatio = VideoAspectRatio
export type SubtitleStyle = 'clean' | 'bold' | 'caption-box' | 'none'

export interface CreateSettings {
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

const ASPECT_RATIOS: AspectRatio[] = ['9:16', '1:1', '16:9']

const SUBTITLE_PREVIEWS: Record<SubtitleStyle, string> = {
  clean: 'font-medium text-foreground',
  bold: 'font-black uppercase text-foreground [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]',
  'caption-box': 'font-semibold text-white bg-black/80 px-1.5 py-0.5 rounded',
  none: 'text-muted-foreground/40 line-through'
}

function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <Switch checked={checked} aria-label={label} onCheckedChange={onChange} />
  )
}

interface SettingsPanelProps {
  settings: CreateSettings
  onChange: (settings: CreateSettings) => void
}

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const t = useTranslations('create')

  return (
    <Card className="creation-settings block gap-0 py-0 overflow-hidden">
      {/* Clips per video */}
      <section className="creation-settings-clips p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">
            {t('clipsPerVideo')}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold tabular-nums text-primary">
            {settings.clips}
          </span>
        </div>
        <Slider
          aria-label={t('clipsPerVideo')}
          min={1}
          max={15}
          value={[settings.clips]}
          onValueChange={([clips = settings.clips]) =>
            onChange({ ...settings, clips })
          }
          className="w-full"
        />
        <div className="sr-only">
          <span>1</span>
          <span>15</span>
        </div>
      </section>

      {/* Aspect ratio */}
      <section className="creation-settings-ratios p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {t('aspectRatio')}
        </h3>
        <p className="mb-3 text-[11px] leading-4 text-muted-foreground">
          {t('formatCompatibilityHint')}
        </p>
        <div className="grid grid-cols-1 gap-2">
          {ASPECT_RATIOS.map((ratio) => {
            const isActive = settings.aspectRatio === ratio
            const format = VIDEO_FORMATS[ratio]
            return (
              <button
                key={ratio}
                type="button"
                onClick={() => onChange({ ...settings, aspectRatio: ratio })}
                aria-pressed={isActive}
                className={`flex min-h-0 flex-col items-stretch gap-2 rounded-md border px-3 py-3 text-left text-xs font-medium transition-all ${
                  isActive
                    ? 'border-primary/35 bg-primary/10 text-primary shadow-sm'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block font-semibold text-foreground">
                      {t(`formats.${ratio}.name`)}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {ratio} · {format.resolution}
                    </span>
                  </span>
                  {ratio === '9:16' && (
                    <span className="rounded-sm bg-muted px-2 py-1 text-[9px] font-semibold text-foreground">
                      {t('formatDefault')}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5" aria-label={t('compatibleWith')}>
                  {SOCIAL_PLATFORMS.map((platform) => {
                    const status = format.compatibility[platform]
                    return (
                      <span
                        key={platform}
                        className={`relative rounded-md border p-0.5 ${
                          status === 'adaptation'
                            ? 'border-warning/50 opacity-65'
                            : 'border-transparent'
                        }`}
                        title={`${platform}: ${t(`compatibility.${status}`)}`}
                      >
                        <PlatformBrandIcon className="size-5" provider={platform} />
                        {status === 'recommended' && (
                          <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-success ring-1 ring-background" />
                        )}
                      </span>
                    )
                  })}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Subtitle style */}
      <section className="creation-settings-subtitles p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">
            {t('subtitles')}
          </h3>
          <Toggle
            checked={settings.subtitleStyle !== 'none'}
            onChange={(enabled) =>
              onChange({
                ...settings,
                subtitleStyle: enabled ? 'clean' : 'none'
              })
            }
            label={t('subtitles')}
          />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              ['clean', t('subtitleClean')],
              ['bold', t('subtitleBold')],
              ['caption-box', t('subtitleCaptionBox')]
            ] as [SubtitleStyle, string][]
          ).map(([style, label]) => {
            const isActive = settings.subtitleStyle === style
            return (
              <button
                key={style}
                type="button"
                onClick={() => onChange({ ...settings, subtitleStyle: style })}
                aria-pressed={isActive}
                className={`flex flex-col items-center gap-1.5 rounded-md border px-2 py-2.5 transition-all ${
                  isActive
                    ? 'border-primary/35 bg-primary/10 shadow-sm'
                    : 'border-border bg-background hover:border-primary/40'
                }`}
              >
                <span
                  className={`text-[13px] leading-4 ${SUBTITLE_PREVIEWS[style]}`}
                >
                  Abc
                </span>
                <span
                  className={`text-[11px] font-medium ${
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <BrandKitSelector
        enabled={settings.includeBrand}
        onChange={(includeBrand) => onChange({ ...settings, includeBrand })}
      />
      <section className="creation-settings-processing">
        <div className="creation-processing-options">
          <div className="creation-language-row">
            <Label
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
              htmlFor="create-language"
            >
              <Languages className="h-3.5 w-3.5" strokeWidth={1.75} />
              {t('language')}
            </Label>
            <Select
              value={settings.language || 'auto'}
              onValueChange={(value) =>
                onChange({
                  ...settings,
                  language: value === 'auto' ? '' : value
                })
              }
            >
              <SelectTrigger
                id="create-language"
                className="w-full min-w-0 rounded-md text-[13px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {LANGUAGES.map((lang) => (
                  <SelectItem
                    key={lang.value || 'auto'}
                    value={lang.value || 'auto'}
                  >
                    {'labelKey' in lang ? t(lang.labelKey) : lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Sparkles
                  className="h-3.5 w-3.5 text-primary"
                  strokeWidth={1.75}
                />
                {t('smartCrop')}
              </span>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {t('smartCropHint')}
              </p>
            </div>
            <Toggle
              checked={settings.smartCrop}
              onChange={(v) => onChange({ ...settings, smartCrop: v })}
              label={t('smartCrop')}
            />
          </div>
        </div>
      </section>
    </Card>
  )
}
