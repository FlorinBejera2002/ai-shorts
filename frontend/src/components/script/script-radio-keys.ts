import type { KeyboardEvent } from 'react'

/**
 * Arrow/Home/End handling for a roving-tabindex radio group whose radios are
 * siblings. Moves focus and returns the index to select, or null.
 */
export function handleRadioKeys(
  event: KeyboardEvent<HTMLElement>,
  index: number,
  count: number
) {
  let next: number | null = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % count
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + count) % count
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = count - 1
  if (next === null) return null
  event.preventDefault()
  const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')
  radios?.[next]?.focus()
  return next
}
