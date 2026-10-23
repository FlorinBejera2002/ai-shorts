import { useRef, useState, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Popover } from 'radix-ui'
import { Check, ChevronDown, FileType, Search, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { CaptionFont, CaptionStyle } from './caption-style'
import { browserFontFamily, loadCaptionFont } from './caption-fonts'
import { CaptionSpacingControls } from './caption-spacing-controls'
import type { useCaptionFontLibrary } from './use-caption-font-library'
import styles from './caption-editor.module.css'

type FontLibrary = ReturnType<typeof useCaptionFontLibrary>

function optionWeight(font: CaptionFont, weight: number) {
  return font.weights.includes(weight) ? weight : font.weights[0] ?? 700
}

export function CaptionTypography({ value, onChange, library }: {
  value: CaptionStyle
  onChange: (value: CaptionStyle) => void
  library: FontLibrary
}) {
  const t = useTranslations('brand')
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const selected = library.fonts.find(font => font.id === value.font_id)
  const visibleFonts = library.fonts.filter(font =>
    (!font.archived || font.id === value.font_id) &&
    `${font.family} ${font.category}`.toLowerCase().includes(search.toLowerCase())
  )

  function navigateFonts(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]'))
    if (!options.length) return
    const current = options.findIndex(option => option === document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 :
      event.key === 'ArrowDown' ? (current + 1) % options.length : (current - 1 + options.length) % options.length
    event.preventDefault()
    options[next]?.focus()
  }

  return (
    <div className={styles.typography}>
      <div className={styles.fontRow}>
        <div className={styles.field}>
          <Label htmlFor="caption-font-trigger">{t('editorDesign.font')}</Label>
          <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
              <button
                id="caption-font-trigger" type="button" className={styles.selectTrigger}
                aria-label={t('subtitleFont')} disabled={library.loading || library.busy}
              >
                <span>{selected?.family ?? value.font_id.replace('builtin:', '').replaceAll('-', ' ')}</span>
                <ChevronDown className="size-4" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className={styles.fontPopup} align="start" sideOffset={6} collisionPadding={16} aria-label={t('subtitleFont')}>
                <div className={styles.fontSearch}>
                  <Search className="size-4" aria-hidden="true" />
                  <input
                    id="caption-font-search" type="search" value={search}
                    aria-label={t('fontSearch')} placeholder={t('editorDesign.searchFonts')}
                    onChange={event => setSearch(event.target.value)}
                  />
                </div>
                <div role="listbox" aria-label={t('subtitleFont')} className={styles.fontList} onKeyDown={navigateFonts}>
                  {visibleFonts.map(font => (
                    <button
                      key={font.id} type="button" role="option"
                      aria-selected={font.id === value.font_id}
                      onFocus={() => void loadCaptionFont(font.id, optionWeight(font, value.weight)).catch(() => {})}
                      onMouseEnter={() => void loadCaptionFont(font.id, optionWeight(font, value.weight)).catch(() => {})}
                      onClick={() => {
                        onChange({ ...value, font_id: font.id, weight: optionWeight(font, value.weight) })
                        setOpen(false)
                      }}
                      style={{ fontFamily: `"${browserFontFamily(font.id, optionWeight(font, value.weight))}", sans-serif` }}
                    >
                      <span>{font.family}{font.archived ? ` · ${t('fontArchived')}` : ''}</span>
                      {font.id === value.font_id && <Check className="size-4" aria-hidden="true" />}
                    </button>
                  ))}
                  {!visibleFonts.length && <p className={styles.hint}>{t('editorDesign.noFonts')}</p>}
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
        <label className={styles.field}>
          <span>{t('fontWeight')}</span>
          <select
            aria-label={t('fontWeight')} className={styles.nativeSelect}
            value={value.weight} disabled={library.busy}
            onChange={event => onChange({ ...value, weight: Number(event.target.value) })}
          >
            {(selected?.weights ?? [value.weight]).map(weight => (
              <option key={weight} value={weight}>
                {weight % 100 === 0 ? t(`fontWeight_${weight}`) : selected?.style || weight} · {weight}
              </option>
            ))}
          </select>
        </label>
      </div>
      {library.loading && <p role="status" className={styles.hint}>{t('fontLoading')}</p>}
      <CaptionSpacingControls value={value} onChange={onChange} />
      <details className={styles.fontUploadSection} open>
        <summary><ChevronDown className="size-4" aria-hidden="true" />{t('customFont')}</summary>
        <div className={styles.fontUploadBody}>
          <button
            type="button" className={styles.fontDropZone} disabled={library.busy}
            onClick={() => input.current?.click()}
            onDragOver={event => event.preventDefault()}
            onDrop={event => { event.preventDefault(); library.chooseFile(event.dataTransfer.files[0]) }}
          >
            <Upload className="size-6" aria-hidden="true" />
            <span>{t('editorDesign.chooseFont')}</span>
            <small>{t('editorDesign.fontFormats')}</small>
          </button>
          <input
            ref={input} type="file" accept=".ttf,.otf" className="sr-only"
            aria-label={t('customFont')} disabled={library.busy}
            onChange={event => { library.chooseFile(event.target.files?.[0]); event.target.value = '' }}
          />
          <label className={styles.license}>
            <input type="checkbox" checked={library.confirmed} onChange={event => library.setConfirmed(event.target.checked)}
              aria-label={t('fontPermission')} disabled={library.busy} />
            <span>{t('fontPermission')}</span>
          </label>
          {library.pendingFile && (
            <div className={styles.pendingFontRow}>
              <div className={styles.pendingFont} data-brand-font-pending="">
                <FileType className="size-5" aria-hidden="true" />
                <span>{library.pendingFile.name}</span>
                <small>{t('editorDesign.readyToUpload')}</small>
                <Button type="button" variant="ghost" size="icon-sm" disabled={library.busy}
                  aria-label={t('editorDesign.removeSelectedFont')} onClick={library.clearFile}><X className="size-4" /></Button>
              </div>
              <Button type="button" data-brand-font-upload="" disabled={!library.confirmed || library.busy}
                onClick={() => void library.upload()} className={styles.primaryButton}>
                {library.busy ? t('fontLoading') : t('fontUpload')}
              </Button>
            </div>
          )}
          {selected?.category === 'custom' && !selected.archived && (
            <Button type="button" variant="outline" className={styles.removeFont} disabled={library.busy} onClick={() => void library.remove()}>{t('remove')}</Button>
          )}
          <p className={styles.hint}>{t('fontRetention')}</p>
          {selected?.romanian === false && <p role="alert" className={styles.error}>{t('fontRomanianMissing')}</p>}
        </div>
      </details>
      {library.error && (
        <div role="alert" className={styles.error}>
          <p>{library.error}</p>
          {!library.loading && <Button type="button" variant="ghost" size="sm" disabled={library.busy} onClick={library.retry}>{t('retry')}</Button>}
        </div>
      )}
    </div>
  )
}
