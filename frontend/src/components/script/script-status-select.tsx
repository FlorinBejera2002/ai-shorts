'use client'

import { Check, ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Select } from 'radix-ui'
import { SCRIPT_STATUSES } from './script-options'
import { ScriptSheet } from './script-sheet'
import { scriptSurfaceClass, scriptSurfaceProps } from './script-theme'
import shared from './scripts-workspace.module.css'
import styles from './script-editor.module.css'

interface StatusSelectProps {
  value: string
  onValueChange: (value: string) => void
  compact: boolean
}

/** Status pill: a colored-dot listbox on desktop, a bottom sheet on phones. */
export function ScriptStatusSelect({ value, onValueChange, compact }: StatusSelectProps) {
  const t = useTranslations('scriptGenerator')
  const archived = value === 'archived'
  const statuses: string[] = archived
    ? [...SCRIPT_STATUSES, 'archived']
    : [...SCRIPT_STATUSES]

  if (compact) {
    return (
      <StatusSheet
        value={value}
        statuses={statuses}
        disabled={archived}
        onValueChange={onValueChange}
      />
    )
  }

  return (
    <Select.Root value={value} onValueChange={onValueChange} disabled={archived}>
      <Select.Trigger
        id="script-status"
        className={styles.statusTrigger}
        data-script-status={value}
        aria-label={t('workspace.statusLabel')}
      >
        <StatusDot status={value} />
        <Select.Value />
        <Select.Icon asChild>
          <ChevronDown aria-hidden="true" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={8}
          align="start"
          className={`${scriptSurfaceClass} ${shared.menu} ${styles.statusMenu}`}
          {...scriptSurfaceProps}
        >
          <Select.Viewport>
            {statuses.map((status) => (
              <Select.Item
                key={status}
                value={status}
                className={`${shared.menuItem} ${styles.statusOption}`}
                data-script-status={status}
              >
                <StatusDot status={status} />
                <Select.ItemText>{t(`workspace.status.${status}`)}</Select.ItemText>
                <Select.ItemIndicator className={styles.statusCheck}>
                  <Check aria-hidden="true" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={styles.statusDot}
      data-status-dot={status}
      aria-hidden="true"
    />
  )
}

/** Phone variant: the same pill opens a titled sheet listing every status. */
function StatusSheet({
  value,
  statuses,
  disabled,
  onValueChange
}: {
  value: string
  statuses: string[]
  disabled: boolean
  onValueChange: (value: string) => void
}) {
  const t = useTranslations('scriptGenerator')
  const [open, setOpen] = useState(false)

  function choose(status: string) {
    setOpen(false)
    if (status !== value) onValueChange(status)
  }

  return (
    <>
      <button
        type="button"
        id="script-status"
        className={styles.statusTrigger}
        data-script-status={value}
        aria-haspopup="dialog"
        aria-label={t('workspace.statusLabel')}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <StatusDot status={value} />
        {t(`workspace.status.${value}`)}
        {!disabled && <ChevronDown aria-hidden="true" />}
      </button>
      <ScriptSheet
        open={open}
        onOpenChange={setOpen}
        title={t('workspace.statusSheetTitle')}
      >
        <div className={styles.statusList} role="group">
          {statuses.map((status) => (
            <button
              key={status}
              type="button"
              className={styles.statusSheetOption}
              aria-current={status === value ? 'true' : undefined}
              data-script-status={status}
              onClick={() => choose(status)}
            >
              <StatusDot status={status} />
              <span>{t(`workspace.status.${status}`)}</span>
              {status === value && <Check aria-hidden="true" />}
            </button>
          ))}
        </div>
      </ScriptSheet>
    </>
  )
}
