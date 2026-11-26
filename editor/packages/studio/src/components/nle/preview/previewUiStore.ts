// Which preview popover, dialog or phone sheet is open. One external store so the transport,
// the snap bar and the phone "Mai mult" sheet can open each other without prop drilling.
import { useSyncExternalStore } from "react";

export type PreviewPanel =
  | "speed"
  | "volume"
  | "shortcuts"
  | "gridOptions"
  | "phonePlayback"
  | "phoneMore"
  | "phoneTools"
  | "phoneShortcuts"
  | "phoneGrid"
  | null;

let openPanel: PreviewPanel = null;
const listeners = new Set<() => void>();

export function getPreviewPanel(): PreviewPanel {
  return openPanel;
}

export function setPreviewPanel(next: PreviewPanel): void {
  if (next === openPanel) return;
  openPanel = next;
  for (const listener of listeners) listener();
}

/** Opens `panel`, or closes it when it is already the open one. */
export function togglePreviewPanel(panel: Exclude<PreviewPanel, null>): void {
  setPreviewPanel(openPanel === panel ? null : panel);
}

/** Closes `panel` only if it is still the open one (a stale close must not hide a newer panel). */
export function closePreviewPanel(panel: Exclude<PreviewPanel, null>): void {
  if (openPanel === panel) setPreviewPanel(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePreviewPanel(): PreviewPanel {
  return useSyncExternalStore(subscribe, getPreviewPanel, () => null);
}
