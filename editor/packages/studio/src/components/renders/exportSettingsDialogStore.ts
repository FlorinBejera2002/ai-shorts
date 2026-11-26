import { useSyncExternalStore } from "react";

// Whether the header's Export settings dialog is open. The header opens it and the export
// flow host renders it, so the state lives outside either component.
let open = false;
const listeners = new Set<() => void>();

function setOpen(next: boolean) {
  if (open === next) return;
  open = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const openExportSettings = () => setOpen(true);
export const closeExportSettings = () => setOpen(false);

export function useExportSettingsOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
}
