import { CaseSensitive, ChevronDown, ChevronRight, LayoutTemplate, Palette, Subtitles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import type { CaptionStyle } from './caption-style'
import type { CaptionEditorSection } from './caption-editor-types'
import { CaptionPresetGrid } from './caption-preset-grid'
import { CaptionTypography } from './caption-typography'
import { CaptionColorSettings } from './caption-color-settings'
import { CaptionLayoutSettings } from './caption-layout-settings'
import { useCaptionFontLibrary } from './use-caption-font-library'
import styles from './caption-editor.module.css'

const detailSections = [
  { id: 'styles', label: 'styles', icon: Subtitles },
  { id: 'typography', label: 'typography', icon: CaseSensitive },
  { id: 'colors', label: 'colors', icon: Palette },
  { id: 'layout', label: 'layout', icon: LayoutTemplate }
] as const

export function CaptionStyleEditor({ value, onChange, section: controlledSection, onSectionChange, onBusyChange }: {
  value: CaptionStyle
  onChange: (value: CaptionStyle) => void
  section?: CaptionEditorSection
  onSectionChange?: (section: CaptionEditorSection) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const t = useTranslations('brand')
  const [localSection, setLocalSection] = useState<CaptionEditorSection>('overview')
  const section = controlledSection ?? localSection
  const library = useCaptionFontLibrary({ value, onChange, onBusyChange })
  const selectedFont = library.fonts.find(font => font.id === value.font_id)
  const fontFamily = selectedFont?.family ?? value.font_id.replace('builtin:', '').replaceAll('-', ' ')
  const overview = section === 'overview'
  function changeSection(next: CaptionEditorSection) {
    if (onSectionChange) onSectionChange(next)
    else setLocalSection(next)
  }
  return (
    <div className={styles.editor} data-caption-section={section}>
      <header className={styles.captionHeader}>
        <h2>{t('subtitleStyle')}</h2>
        {overview && <button type="button" data-brand-section-trigger="styles" onClick={() => changeSection('styles')}>
          {t('editorDesign.viewAllStyles')}<ChevronRight className="size-4" />
        </button>}
      </header>
      {overview && <CaptionPresetGrid value={value} onChange={onChange} compact />}
      <div className={styles.sectionList} data-overview={overview}>
        {detailSections.filter(detail => !overview || detail.id !== 'styles').map(({ id, label, icon: Icon }) => {
          const selected = section === id
          return (
            <section key={id} className={styles.detailSection} data-expanded={selected}>
              <button type="button" className={styles.sectionTrigger} data-brand-section-trigger={id}
                aria-expanded={selected} aria-controls={`caption-section-${id}`}
                onClick={() => changeSection(selected ? 'overview' : id)}>
                <Icon className="size-5" aria-hidden="true" />
                <span>{t(`editorDesign.${label}`)}</span>
                {overview && id === 'typography' && <small>{fontFamily} · {value.weight}</small>}
                {overview && id === 'colors' && <small className={styles.summarySwatches}>
                  <i style={{ backgroundColor: value.text_color }} /><i style={{ backgroundColor: value.highlight_color }} />
                </small>}
                {overview && id === 'layout' && <small>{t(`align_${value.align}`)} · {t('editorDesign.linesSummary', { count: value.max_lines })}</small>}
                {selected ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
              {selected && (
                <div id={`caption-section-${id}`} className={styles.sectionContent}>
                  {id === 'styles' && <CaptionPresetGrid value={value} onChange={onChange} />}
                  {id === 'typography' && <CaptionTypography value={value} onChange={onChange} library={library} />}
                  {id === 'colors' && <CaptionColorSettings value={value} onChange={onChange} />}
                  {id === 'layout' && <CaptionLayoutSettings value={value} onChange={onChange} />}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
