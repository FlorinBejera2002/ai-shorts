import { useRef, type KeyboardEvent } from 'react'
import styles from './story-options.module.css'

export interface StorySegmentOption<T extends string | number> {
  value: T
  label: string
  disabled?: boolean
}

interface Props<T extends string | number> {
  label: string
  options: readonly StorySegmentOption<T>[]
  value: T | undefined
  disabled?: boolean
  /** Short fixed labels (durations, clip counts) share the row equally instead of sizing to text. */
  equalWidths?: boolean
  onChange: (value: T) => void
}

/** A pill of mutually exclusive choices that follows the radio group keyboard pattern. */
export function StorySegmentedControl<T extends string | number>({
  label,
  options,
  value,
  disabled = false,
  equalWidths = false,
  onChange
}: Props<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const checkedIndex = options.findIndex((option) => option.value === value)

  function moveSelection(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = ['ArrowRight', 'ArrowDown'].includes(event.key)
      ? 1
      : ['ArrowLeft', 'ArrowUp'].includes(event.key)
        ? -1
        : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + options.length) % options.length
    const option = options[next]
    if (option.disabled) return
    buttons.current[next]?.focus()
    onChange(option.value)
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={equalWidths ? `${styles.segment} ${styles.segmentEqual}` : styles.segment}
    >
      {options.map((option, index) => {
        const checked = index === checkedIndex
        return (
          <button
            key={String(option.value)}
            ref={(element) => {
              buttons.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (checkedIndex < 0 && index === 0) ? 0 : -1}
            disabled={disabled || option.disabled}
            className={styles.segmentItem}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => moveSelection(event, index)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
