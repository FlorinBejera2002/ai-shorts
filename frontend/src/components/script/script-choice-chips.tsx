'use client'

import { useId } from 'react'
import { matchChoice } from './script-options'
import { handleRadioKeys } from './script-radio-keys'
import styles from './script-brief.module.css'

type ChipOption = { value: string; label: string }

/**
 * Single-choice chip group. A stored free-text value that is not a preset
 * stays visible as its own selected chip, so older briefs keep their value.
 */
export function ScriptChoiceChips({
  id,
  label,
  options,
  value,
  onValueChange
}: {
  id: string
  label: string
  options: ChipOption[]
  value: string
  onValueChange: (value: string) => void
}) {
  const labelId = useId()
  const preset = matchChoice(options, value)
  const custom = value && !preset
  const choices = custom ? [...options, { value, label: value }] : options
  const selectedValue = preset?.value ?? value
  const selectedIndex = choices.findIndex((option) => option.value === selectedValue)

  return (
    <div className={styles.chipField}>
      <span id={labelId} className={styles.groupLabel}>
        {label}
      </span>
      <div
        id={id}
        role="radiogroup"
        aria-labelledby={labelId}
        className={styles.chips}
      >
        {choices.map((option, index) => {
          const checked = index === selectedIndex
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || (selectedIndex < 0 && index === 0) ? 0 : -1}
              className={styles.chip}
              onClick={() => onValueChange(option.value)}
              onKeyDown={(event) => {
                const next = handleRadioKeys(event, index, choices.length)
                if (next !== null) onValueChange(choices[next]!.value)
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
