'use client'

import { isPublishingProvider } from '@/lib/publishing'
import { useId } from 'react'
import { ScriptPlatformBadge } from './script-badges'
import { SCRIPT_PLATFORMS } from './script-options'
import { handleRadioKeys } from './script-radio-keys'
import styles from './script-platform-select.module.css'

type ScriptPlatformSelectProps = {
  value: string
  onValueChange: (value: string) => void
  label: string
  placeholder: string
}

/**
 * Platform circles from the reference. A retired stored platform leaves every
 * circle unchecked and shows the requirement until the person chooses one.
 */
export function ScriptPlatformSelect({
  value,
  onValueChange,
  label,
  placeholder
}: ScriptPlatformSelectProps) {
  const labelId = useId()
  const hintId = useId()
  const supported = isPublishingProvider(value)

  return (
    <div className={styles.field}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <div
        id="script-platform"
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={supported ? undefined : hintId}
        aria-required="true"
        className={styles.options}
      >
        {SCRIPT_PLATFORMS.map((platform, index) => {
          const checked = supported && platform.value === value
          return (
            <button
              key={platform.value}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={platform.label}
              title={platform.label}
              tabIndex={checked || (!supported && index === 0) ? 0 : -1}
              className={styles.option}
              data-platform={platform.value}
              onClick={() => onValueChange(platform.value)}
              onKeyDown={(event) => {
                const next = handleRadioKeys(event, index, SCRIPT_PLATFORMS.length)
                if (next !== null) onValueChange(SCRIPT_PLATFORMS[next]!.value)
              }}
            >
              <ScriptPlatformBadge
                platform={platform.value}
                className={styles.badge}
                decorative
              />
            </button>
          )
        })}
      </div>
      {!supported && (
        <p id={hintId} className={styles.hint}>
          {placeholder}
        </p>
      )}
    </div>
  )
}
