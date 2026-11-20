'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import { CloseButton, OverlayTitle, ReferenceOverlay } from '@/components/shared/reference-overlay'
import ui from '@/components/shared/reference-ui.module.css'
import { Check, ChevronDown, ChevronRight, Search, type LucideIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { DropdownMenu as Menu } from 'radix-ui'
import { useState } from 'react'
import { IconCircle } from './settings-ui'
import styles from './settings.module.css'
import controls from './settings-controls.module.css'

export type ChoiceOption = { value: string; label: string; short?: string }

/** Phone sheets with more options than this get a search field above a scrolling list. */
const SEARCHABLE_OPTION_COUNT = 12

type Props = {
  id: string
  icon: LucideIcon
  label: string
  /** Placeholder and accessible name of the phone search field; long lists are searchable only when set. */
  searchLabel?: string
  value: string
  options: () => ChoiceOption[]
  selected: ChoiceOption
  disabled?: boolean
  mobile: boolean
  onChange: (value: string) => void
}

/** Lower-case text without diacritics, so "Bucuresti" and "București" match alike. */
function foldSearchText(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

type SearchEntry = { option: ChoiceOption; text: string }

/** Options paired with their folded labels, built once so typing only compares strings. */
function buildSearchIndex(options: ChoiceOption[]): SearchEntry[] {
  return options.map((option) => ({ option, text: foldSearchText(option.label) }))
}

function filterChoiceOptions(index: SearchEntry[], query: string) {
  const needle = foldSearchText(query.trim())
  if (!needle) return index.map((entry) => entry.option)
  return index.filter((entry) => entry.text.includes(needle)).map((entry) => entry.option)
}

type SheetBodyProps = Pick<Props, 'id' | 'label' | 'searchLabel' | 'value' | 'options'> & { onPick: (value: string) => void }

/** The phone sheet's option list; long lists get a search field and scroll inside the sheet. */
function ChoiceSheetBody({ id, label, searchLabel, value, options, onPick }: SheetBodyProps) {
  const t = useTranslations('settings')
  const [query, setQuery] = useState('')
  // Snapshot of the options for this opening (the sheet unmounts on close), indexed once for search.
  const [index] = useState(() => buildSearchIndex(options()))
  const searchable = Boolean(searchLabel) && index.length > SEARCHABLE_OPTION_COUNT
  const visible = filterChoiceOptions(index, searchable ? query : '')
  const list = (
    <div
      role="listbox"
      aria-label={label}
      className={`${ui.sheetList} ${searchable ? controls.sheetScroll : ''}`}
      data-settings-choice-list={id}
    >
      {visible.map((option) => (
        <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={option.value === value}
          className={ui.item}
          onClick={() => onPick(option.value)}
        >
          <span>{option.label}</span>
          {option.value === value && <Check className={ui.check} aria-hidden="true" />}
        </button>
      ))}
    </div>
  )
  if (!searchable) return list
  return (
    <div className={controls.sheetBody}>
      <label className={`${controls.fieldBox} ${controls.searchBox}`}>
        <Search aria-hidden="true" />
        <input
          type="search"
          value={query}
          placeholder={searchLabel}
          aria-label={searchLabel}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
          data-settings-choice-search={id}
        />
      </label>
      {list}
      {visible.length === 0 && (
        <p className={controls.empty} role="status">
          {t('noResults')}
        </p>
      )}
    </div>
  )
}

/** A settings row with a choice: a select menu on desktop, a row that opens a sheet on phones. */
export function SettingsChoice({ id, icon: Icon, label, searchLabel, value, options, selected, disabled, mobile, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
  }
  if (mobile)
    return (
      <>
        <button
          type="button"
          className={`${styles.row} ${styles.rowButton} ${styles.focus}`}
          disabled={disabled}
          onClick={() => setOpen(true)}
          data-settings-choice={id}
        >
          <IconCircle>
            <Icon aria-hidden="true" />
          </IconCircle>
          <span className={styles.rowLabel}>{label}</span>
          <span className={styles.rowValue}>
            {selected.short ?? selected.label}
            <ChevronRight aria-hidden="true" />
          </span>
        </button>
        <ReferenceOverlay open={open} mobile busy={false} described={false} onClose={() => setOpen(false)}>
          <div className={controls.dialogHead}>
            <OverlayTitle mobile>{label}</OverlayTitle>
            <CloseButton onClick={() => setOpen(false)} />
          </div>
          <ChoiceSheetBody id={id} label={label} searchLabel={searchLabel} value={value} options={options} onPick={pick} />
        </ReferenceOverlay>
      </>
    )
  return (
    <div className={styles.row}>
      <IconCircle>
        <Icon aria-hidden="true" />
      </IconCircle>
      <span className={styles.rowLabel}>{label}</span>
      <Menu.Root open={open} onOpenChange={setOpen}>
        <Menu.Trigger asChild disabled={disabled}>
          <button type="button" className={`${controls.select} ${controls.focus}`} aria-label={`${label}: ${selected.label}`} data-settings-choice={id}>
            <span>{selected.label}</span>
            <ChevronDown aria-hidden="true" />
          </button>
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            align="end"
            sideOffset={6}
            className={`${theme.surface} ${ui.tokens} ${ui.menu} ${controls.selectMenu}`}
            data-reference-surface=""
            data-settings-choice-menu={id}
          >
            <Menu.RadioGroup value={value} onValueChange={pick}>
              {options().map((option) => (
                <Menu.RadioItem key={option.value} value={option.value} className={ui.item}>
                  <span>{option.label}</span>
                  {option.value === value && <Check className={ui.check} aria-hidden="true" />}
                </Menu.RadioItem>
              ))}
            </Menu.RadioGroup>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </div>
  )
}
