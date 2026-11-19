'use client'

import { useIsMobile } from '@/hooks/use-mobile'
import { Check, ChevronDown, Search, Trash2, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Popover } from 'radix-ui'
import { useId, useState, type KeyboardEvent } from 'react'
import { browserFontFamily, loadCaptionFont } from './caption-fonts'
import type { CaptionFont, CaptionStyle } from './caption-style'
import { brandPortal, fontWeightFor } from './editor-utils'
import { FontUploadDialog } from './font-upload-dialog'
import type { useCaptionFontLibrary } from './use-caption-font-library'
import editor from './brand-editor.module.css'
import styles from './caption-card.module.css'

type FontLibrary = ReturnType<typeof useCaptionFontLibrary>

function focusOption(event: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
  if (!options.length) return
  const current = options.findIndex((option) => option === document.activeElement)
  const last = options.length - 1
  const next =
    event.key === 'Home' ? 0 : event.key === 'End' ? last : event.key === 'ArrowDown' ? (current + 1) % options.length : (current - 1 + options.length) % options.length
  event.preventDefault()
  options[next]?.focus()
}

/** Font select (canvas Br-Fonts): search, the font list in its own typeface and "Încarcă fontul tău". */
export function CaptionFontField({
  value,
  library,
  className,
  onChange
}: {
  value: CaptionStyle
  library: FontLibrary
  className?: string
  onChange: (value: CaptionStyle) => void
}) {
  const t = useTranslations('brand')
  const mobile = useIsMobile()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const selected = library.fonts.find((font) => font.id === value.font_id)
  const family = selected?.family ?? value.font_id.replace('builtin:', '').replaceAll('-', ' ')
  const query = search.trim().toLowerCase()
  const fonts = library.fonts.filter(
    (font) => (!font.archived || font.id === value.font_id) && `${font.family} ${font.category}`.toLowerCase().includes(query)
  )
  const removable = selected?.category === 'custom' && !selected.archived

  function choose(font: CaptionFont) {
    onChange({ ...value, font_id: font.id, weight: fontWeightFor(font, value.weight) })
    setOpen(false)
  }

  function preload(font: CaptionFont) {
    void loadCaptionFont(font.id, fontWeightFor(font, value.weight)).catch(() => {})
  }

  return (
    <div className={`${editor.field} ${className ?? ''}`}>
      <span className={editor.label} id={`${id}-label`}>
        {t('editorDesign.font')}
      </span>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={`${editor.control} ${editor.focus}`}
            aria-labelledby={`${id}-label ${id}-value`}
            disabled={library.loading || library.busy}
          >
            <b className={styles.fontAa} aria-hidden="true">
              Aa
            </b>
            <span id={`${id}-value`}>{family}</span>
            <ChevronDown className={editor.chevron} aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={8}
            collisionPadding={16}
            className={`${brandPortal} ${styles.fontPopup}`}
            data-reference-surface=""
            aria-label={t('editor.fonts')}
          >
            <span className={styles.search}>
              <Search aria-hidden="true" />
              <input
                type="search"
                value={search}
                placeholder={t('editorDesign.searchFonts')}
                aria-label={t('editorDesign.searchFonts')}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
            <div role="listbox" aria-label={t('editor.fonts')} className={styles.fontList} onKeyDown={focusOption}>
              {fonts.map((font) => (
                <button
                  key={font.id}
                  type="button"
                  role="option"
                  aria-selected={font.id === value.font_id}
                  className={styles.fontOption}
                  style={{ fontFamily: `"${browserFontFamily(font.id, fontWeightFor(font, value.weight))}", Inter, sans-serif` }}
                  onFocus={() => preload(font)}
                  onMouseEnter={() => preload(font)}
                  onClick={() => choose(font)}
                >
                  <span>
                    {font.family}
                    {font.archived ? ` · ${t('fontArchived')}` : ''}
                  </span>
                  {font.id === value.font_id && <Check aria-hidden="true" />}
                </button>
              ))}
              {!fonts.length && <p className={styles.empty}>{t('editorDesign.noFonts')}</p>}
            </div>
            <span className={styles.divider} aria-hidden="true" />
            <button
              type="button"
              className={styles.fontAction}
              onClick={() => {
                setOpen(false)
                setUploading(true)
              }}
            >
              <Upload aria-hidden="true" />
              {t('customFont')}
              <small>{t('editor.fontTypes')}</small>
            </button>
            {removable && (
              <button type="button" className={styles.fontAction} data-danger="" onClick={() => void library.remove()}>
                <Trash2 aria-hidden="true" />
                {t('editorDesign.removeSelectedFont')}
              </button>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {selected?.romanian === false && (
        <p role="alert" className={styles.alert}>
          {t('fontRomanianMissing')}
        </p>
      )}
      {library.error && !uploading && (
        <span className={styles.alertRow} role="alert">
          <span className={styles.alert}>{library.error}</span>
          {!library.loading && (
            <button type="button" onClick={library.retry}>
              {t('retry')}
            </button>
          )}
        </span>
      )}
      <FontUploadDialog open={uploading} mobile={mobile} library={library} onClose={() => setUploading(false)} />
    </div>
  )
}
