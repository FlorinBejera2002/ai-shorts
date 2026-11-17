'use client'

import { Check, ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Select } from 'radix-ui'
import { SCRIPT_STATUSES } from './script-options'
import { scriptSurfaceClass, scriptSurfaceProps } from './script-theme'
import shared from './scripts-workspace.module.css'
import styles from './script-editor.module.css'

/** Status pill that opens the colored-dot listbox from the reference. */
export function ScriptStatusSelect({
  value,
  onValueChange
}: {
  value: string
  onValueChange: (value: string) => void
}) {
  const t = useTranslations('scriptGenerator')
  const archived = value === 'archived'
  const statuses: string[] = archived
    ? [...SCRIPT_STATUSES, 'archived']
    : [...SCRIPT_STATUSES]

  return (
    <Select.Root value={value} onValueChange={onValueChange} disabled={archived}>
      <Select.Trigger
        id="script-status"
        className={`${shared.statusPill} ${styles.statusTrigger}`}
        data-script-status={value}
        aria-label={t('workspace.statusLabel')}
      >
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
                <span className={styles.statusDot} aria-hidden="true" />
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
