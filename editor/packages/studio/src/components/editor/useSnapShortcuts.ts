import { useEffect } from "react";
import { readSnapPrefs, type SnapPrefs } from "./snapPrefs";

/** Keys typed into fields or editable surfaces belong to the field, not to the snap bar. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return target instanceof HTMLIFrameElement;
}

/** S toggles snap and G toggles the grid, unless a modifier key is held or the user is typing. */
export function useSnapShortcuts(updatePrefs: (patch: Partial<SnapPrefs>) => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "s") {
        e.preventDefault();
        updatePrefs({ snapEnabled: !readSnapPrefs().snapEnabled });
      } else if (e.key === "g") {
        e.preventDefault();
        updatePrefs({ gridVisible: !readSnapPrefs().gridVisible });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [updatePrefs]);
}
