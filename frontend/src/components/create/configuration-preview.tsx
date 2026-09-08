'use client'

import { Captions, Scissors, Smartphone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { CreateSettings } from './settings-panel'

export function ConfigurationPreview({
  settings
}: { settings: CreateSettings }) {
  const t = useTranslations('create')
  const subtitle = {
    clean: t('subtitleClean'),
    bold: t('subtitleBold'),
    'caption-box': t('subtitleCaptionBox'),
    none: t('subtitleNone')
  }[settings.subtitleStyle]

  return (
    <aside className="creation-configuration" aria-live="polite">
      <div className="creation-configuration-heading">
        <h4>{t('configuration')}</h4>
        <span>{t('configurationReady')}</span>
      </div>
      <dl>
        {[
          {
            label: t('configurationClips'),
            value: settings.clips,
            icon: Scissors
          },
          {
            label: t('aspectRatio'),
            value: settings.aspectRatio,
            icon: Smartphone
          },
          { label: t('subtitles'), value: subtitle, icon: Captions }
        ].map(({ label, value, icon: Icon }) => (
          <div key={label}>
            <dt>
              <Icon aria-hidden="true" />
              {label}
            </dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
