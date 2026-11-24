'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useAudioCleanupAvailability } from '@/hooks/use-audio-cleanup-availability'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { CreateSettings } from './settings-panel'

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

interface AdvancedOptionsProps {
  settings: CreateSettings
  onChange: (settings: CreateSettings) => void
}

/** Collapsed "Opțiuni avansate": language, smart crop and background noise reduction. */
export function AdvancedOptions({ settings, onChange }: AdvancedOptionsProps) {
  const t = useTranslations('create')
  const audio = useTranslations('audioCleanup')
  const cleanup = useAudioCleanupAvailability()
  const noiseOn = settings.reduceBackgroundNoise ?? false

  return (
    <details className="yt-advanced">
      <summary>
        {t('advanced')}
        <ChevronDown className="size-4" aria-hidden="true" />
      </summary>
      <div className="yt-advanced__fields">
        <div className="yt-field-group">
          <label htmlFor="create-language">{t('language')}</label>
          <Select
            value={settings.language || 'auto'}
            onValueChange={(value) => onChange({ ...settings, language: value === 'auto' ? '' : value })}
          >
            <SelectTrigger id="create-language" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.value || 'auto'} value={lang.value || 'auto'}>
                  {'labelKey' in lang ? t(lang.labelKey) : lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="yt-switch-row">
          <label htmlFor="create-smart-crop">{t('smartCrop')}</label>
          <Switch
            id="create-smart-crop"
            checked={settings.smartCrop}
            onCheckedChange={(smartCrop) => onChange({ ...settings, smartCrop })}
          />
        </div>
        <div className="yt-field-group">
          <div className="yt-switch-row">
            <label htmlFor="create-noise-reduction">{audio('title')}</label>
            <Switch
              id="create-noise-reduction"
              aria-describedby="create-noise-availability"
              disabled={!cleanup.available && !noiseOn}
              checked={noiseOn}
              onCheckedChange={(reduceBackgroundNoise) => {
                if (!reduceBackgroundNoise || cleanup.available) onChange({ ...settings, reduceBackgroundNoise })
              }}
            />
          </div>
          <p id="create-noise-availability" className="yt-help">
            {cleanup.available
              ? audio('help')
              : audio(cleanup.loading ? 'checkingAvailability' : noiseOn ? 'unavailableSelected' : 'unavailableOption')}
          </p>
        </div>
      </div>
    </details>
  )
}
