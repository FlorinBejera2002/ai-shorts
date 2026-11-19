'use client'

import theme from '@/components/calendar/publishing-theme.module.css'
import { CloseButton, OverlayTitle, ReferenceOverlay } from '@/components/shared/reference-overlay'
import ui from '@/components/shared/reference-ui.module.css'
import { Check, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { DropdownMenu as Menu } from 'radix-ui'
import { useState } from 'react'
import { IconCircle } from './settings-ui'
import styles from './settings.module.css'
import controls from './settings-controls.module.css'

export type ChoiceOption = { value: string; label: string; short?: string }

type Props = {
  id: string
  icon: LucideIcon
  label: string
  value: string
  options: () => ChoiceOption[]
  selected: ChoiceOption
  disabled?: boolean
  mobile: boolean
  onChange: (value: string) => void
}

/** A settings row with a choice: a select menu on desktop, a row that opens a sheet on phones. */
export function SettingsChoice({ id, icon: Icon, label, value, options, selected, disabled, mobile, onChange }: Props) {
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
          <div className={ui.sheetList} role="listbox" aria-label={label} data-settings-choice-list={id}>
            {open &&
              options().map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className={ui.item}
                  onClick={() => pick(option.value)}
                >
                  <span>{option.label}</span>
                  {option.value === value && <Check className={ui.check} aria-hidden="true" />}
                </button>
              ))}
          </div>
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
