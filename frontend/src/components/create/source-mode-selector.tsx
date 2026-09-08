'use client'

import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Check, Layers, Upload, Youtube } from 'lucide-react'
import { useTranslations } from 'next-intl'

const SOURCE_OPTIONS = [
  { id: 'youtube', icon: Youtube, description: 'youtubeSourceDescription' },
  { id: 'upload', icon: Upload, description: 'uploadSourceDescription' },
  { id: 'batch', icon: Layers, description: 'batchSourceDescription' }
] as const

/** Source choices within the workflow's controlled Tabs root. */
export function SourceModeSelector() {
  const t = useTranslations('create')

  return (
    <TabsList aria-label={t('stepSource')} className="source-mode-selector">
      {SOURCE_OPTIONS.map(({ id, icon: Icon, description }) => (
        <TabsTrigger
          key={id}
          value={id}
          aria-label={t(id)}
          className="source-mode-option"
        >
          <span className="source-mode-icon">
            <Icon aria-hidden="true" strokeWidth={1.75} />
          </span>
          <span className="source-mode-copy">
            <span className="source-mode-title">{t(id)}</span>
            <span className="source-mode-description">{t(description)}</span>
          </span>
          <Check
            aria-hidden="true"
            className="source-mode-check"
            strokeWidth={2}
          />
        </TabsTrigger>
      ))}
    </TabsList>
  )
}
