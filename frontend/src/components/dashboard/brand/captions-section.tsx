import { useTranslations } from 'next-intl'
import { CaptionStyleEditor } from './caption-style-editor'
import { legacyCaptionStyle } from './caption-style'
import type { CaptionEditorSection } from './caption-editor-types'
import type { BrandKit, BrandKitUpdate } from './types'

export function CaptionsSection({
  kit,
  update,
  section,
  onSectionChange,
  onBusyChange
}: {
  kit: BrandKit
  update: BrandKitUpdate
  section?: CaptionEditorSection
  onSectionChange?: (section: CaptionEditorSection) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const t = useTranslations('brand')
  return (
    <section id="brand-captions" aria-label={t('subtitleStyle')}>
      <CaptionStyleEditor
        value={legacyCaptionStyle(kit)}
        onChange={value => update('captionStyle', value)}
        section={section}
        onSectionChange={onSectionChange}
        onBusyChange={onBusyChange}
      />
    </section>
  )
}
