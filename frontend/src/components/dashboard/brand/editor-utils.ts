import { referenceSurface } from '@/components/shared/reference-overlay'
import type { KeyboardEvent } from 'react'
import type { CaptionFont } from './caption-style'
import styles from './brand-editor.module.css'

/** Classes a brand editor portal needs to resolve the scoped tokens. */
export const brandPortal = `${referenceSurface} ${styles.tokens}`

/** Canvas order of the twelve caption styles (Br-Main preset strip). */
export const PRESET_ORDER = [
  'active-color',
  'classic',
  'minimal',
  'bold-outline',
  'contrast-box',
  'headline',
  'word-by-word',
  'karaoke',
  'active-background',
  'phrase-pop',
  'subtle-fade',
  'stacked'
] as const

export type CaptionPreset = (typeof PRESET_ORDER)[number]

/** The requested weight when the font has it, otherwise the font's first weight. */
export function fontWeightFor(font: CaptionFont | undefined, weight: number) {
  if (!font) return weight
  return font.weights.includes(weight) ? weight : (font.weights[0] ?? 700)
}

/** Arrow keys move a radiogroup's selection (and focus) to the previous or next option. */
export function moveRadio<T>(event: KeyboardEvent<HTMLElement>, values: T[], value: T, onChange: (value: T) => void) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
  if (!step) return
  event.preventDefault()
  const index = (values.indexOf(value) + step + values.length) % values.length
  onChange(values[index]!)
  event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus()
}
