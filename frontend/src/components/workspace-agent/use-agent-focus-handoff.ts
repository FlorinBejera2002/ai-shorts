import { useCallback, type RefObject } from 'react'

interface UseAgentFocusHandoffOptions {
  mobile: boolean
  focusComposer: () => boolean
  restoreFocus: () => boolean
  trigger: RefObject<HTMLButtonElement | null>
}

/**
 * Moves focus into the composer when the sheet opens and returns it to the launcher (or the
 * help source) when the assistant closes.
 */
export function useAgentFocusHandoff({ mobile, focusComposer, restoreFocus, trigger }: UseAgentFocusHandoffOptions) {
  const onOpenAutoFocus = useCallback((event: Event) => {
    if (focusComposer()) event.preventDefault()
  }, [focusComposer])

  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault()
    if (!restoreFocus()) trigger.current?.focus()
  }, [restoreFocus, trigger])

  /** The desktop panel is hidden in place, so it restores focus itself; the phone sheet does so on close. */
  const onDesktopHide = useCallback(() => {
    if (!mobile) restoreFocus()
  }, [mobile, restoreFocus])

  return { onOpenAutoFocus, onCloseAutoFocus, onDesktopHide }
}
