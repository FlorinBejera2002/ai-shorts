'use client'

import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'

import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  ChevronDown,
  Languages,
  Linkedin,
  Smartphone,
  Sparkles,
  Youtube
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

export type AspectRatio = '9:16' | '1:1' | '16:9'
export type SubtitleStyle = 'clean' | 'bold' | 'caption-box' | 'none'

export interface CreateSettings {
  clips: number
  aspectRatio: AspectRatio
  subtitleStyle: SubtitleStyle
  includeBrand: boolean
  language: string
  smartCrop: boolean
}

export const platformPresets = [
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: Smartphone,
    clips: 8,
    aspectRatio: '9:16' as AspectRatio,
    subtitleStyle: 'bold' as SubtitleStyle
  },
  {
    id: 'reels',
    label: 'Reels',
    icon: Smartphone,
    clips: 6,
    aspectRatio: '9:16' as AspectRatio,
    subtitleStyle: 'caption-box' as SubtitleStyle
  },
  {
    id: 'shorts',
    label: 'Shorts',
    icon: Youtube,
    clips: 5,
    aspectRatio: '9:16' as AspectRatio,
    subtitleStyle: 'clean' as SubtitleStyle
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: Linkedin,
    clips: 3,
    aspectRatio: '1:1' as AspectRatio,
    subtitleStyle: 'clean' as SubtitleStyle
  }
] as const

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

const RATIO_FRAMES: Record<AspectRatio, { w: number; h: number }> = {
  '9:16': { w: 12, h: 21 },
  '1:1': { w: 18, h: 18 },
  '16:9': { w: 26, h: 15 }
}

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
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const activePreset = platformPresets.find(
    (p) =>
      p.clips === settings.clips &&
      p.aspectRatio === settings.aspectRatio &&
      p.subtitleStyle === settings.subtitleStyle
  )

  function applyPreset(preset: (typeof platformPresets)[number]) {
    onChange({
      ...settings,
      clips: preset.clips,
      aspectRatio: preset.aspectRatio,
      subtitleStyle: preset.subtitleStyle,
      smartCrop: preset.aspectRatio !== '16:9'
    })
  }

  return (
    <Card className="block gap-0 py-0 divide-y divide-border overflow-hidden">
      {/* Platform preset */}
      <section className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="section-label">{t('platformPreset')}</h3>
          {!activePreset && (
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
              {t('customPreset')}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {platformPresets.map((preset) => {
            const Icon = preset.icon
            const isActive = activePreset?.id === preset.id
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                aria-pressed={isActive}
                className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-2.5 py-3 text-[11px] font-medium transition-all ${
                  isActive
                    ? 'border-primary/30 bg-primary/10 text-primary shadow-sm'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} />
                <span>{preset.label}</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {preset.clips} · {preset.aspectRatio}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Clips per video */}
      <section className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">
            {t('clipsPerVideo')}
          </span>
          <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-xs font-semibold tabular-nums text-primary">
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
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>1</span>
          <span>15</span>
        </div>
      </section>

      {/* Aspect ratio */}
      <section className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {t('aspectRatio')}
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(RATIO_FRAMES) as AspectRatio[]).map((ratio) => {
            const frame = RATIO_FRAMES[ratio]
            const isActive = settings.aspectRatio === ratio
            return (
              <button
                key={ratio}
                type="button"
                onClick={() => onChange({ ...settings, aspectRatio: ratio })}
                aria-pressed={isActive}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'border-primary/35 bg-primary/10 text-primary shadow-sm'
                    : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
              >
                <span
                  className={`rounded-[3px] border-[1.5px] ${
                    isActive ? 'border-primary' : 'border-muted-foreground/50'
                  }`}
                  style={{ width: frame.w, height: frame.h }}
                />
                {ratio}
              </button>
            )
          })}
        </div>
      </section>

      {/* Subtitle style */}
      <section className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {t('subtitles')}
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              ['clean', t('subtitleClean')],
              ['bold', t('subtitleBold')],
              ['caption-box', t('subtitleCaptionBox')],
              ['none', t('subtitleNone')]
            ] as [SubtitleStyle, string][]
          ).map(([style, label]) => {
            const isActive = settings.subtitleStyle === style
            return (
              <button
                key={style}
                type="button"
                onClick={() => onChange({ ...settings, subtitleStyle: style })}
                aria-pressed={isActive}
                className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2.5 transition-all ${
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

      {/* Brand kit */}
      <section className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold text-foreground">
              {t('brandKit')}
            </span>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t('brandKitHint')}
            </p>
          </div>
          <Toggle
            checked={settings.includeBrand}
            onChange={(v) => onChange({ ...settings, includeBrand: v })}
            label={t('brandKit')}
          />
        </div>
      </section>

      {/* Advanced */}
      <section>
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          aria-expanded={advancedOpen}
          className="flex w-full items-center justify-between p-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/45"
        >
          {t('advanced')}
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              advancedOpen ? 'rotate-180' : ''
            }`}
            strokeWidth={1.75}
          />
        </button>
        {advancedOpen && (
          <div className="animate-slide-down space-y-4 border-t border-border p-4">
            <div>
              <Label
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
                htmlFor="create-language"
              >
                <Languages className="h-3.5 w-3.5" strokeWidth={1.75} />
                {t('language')}
              </Label>
              <NativeSelect
                id="create-language"
                value={settings.language}
                onChange={(e) =>
                  onChange({ ...settings, language: e.target.value })
                }
                className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] text-foreground transition-all outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {'labelKey' in lang ? t(lang.labelKey) : lang.label}
                  </option>
                ))}
              </NativeSelect>
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
        )}
      </section>
    </Card>
  )
}
