// Shared class names and labels for the round top-bar buttons (undo, redo, inspector toggle).
import { getHistoryShortcutLabel } from "../../utils/studioHelpers";
import { t } from "../../i18n/translate";

export type HistoryDirection = "undo" | "redo";

/** Tooltip naming the action ("Anulează Mută clipul (⌘Z)"). */
export function historyTooltip(direction: HistoryDirection, action: string | null | undefined) {
  const shortcut = getHistoryShortcutLabel(direction);
  if (action) {
    return t(direction === "undo" ? "shell.undoActionTip" : "shell.redoActionTip", {
      action,
      shortcut,
    });
  }
  return t(direction === "undo" ? "shell.undoTip" : "shell.redoTip", { shortcut });
}

const ICON_BUTTON_BASE =
  "flex flex-none items-center justify-center rounded-full transition-colors active:scale-[0.98] disabled:cursor-default disabled:opacity-[0.38]";

/** Round icon button of the top bars (36px desktop, 44px phone set by the caller). */
export const SHELL_ICON_BUTTON = `${ICON_BUTTON_BASE} text-studio-text hover:bg-[var(--st-sub)] disabled:hover:bg-transparent`;

/** Same button as a toggle: selected fill when pressed (Inspector). */
export function shellToggleButton(pressed: boolean): string {
  return pressed
    ? `${ICON_BUTTON_BASE} bg-studio-selected text-studio-on-selected`
    : SHELL_ICON_BUTTON;
}
