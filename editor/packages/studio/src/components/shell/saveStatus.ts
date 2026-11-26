// Save state shown in the top bar ("Salvat" / "Se salvează…" / "Salvare eșuată").
// Studio's project writes go through trackProjectSave(); a write in flight means "saving",
// the last finished write failing means "failed" until the next write succeeds.
import { useSyncExternalStore } from "react";

export type SaveStatus = "saved" | "saving" | "failed";

let pending = 0;
let lastFailed = false;
let snapshot: SaveStatus = "saved";
const listeners = new Set<() => void>();

function publish() {
  const next: SaveStatus = pending > 0 ? "saving" : lastFailed ? "failed" : "saved";
  if (next === snapshot) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Runs a project write and reflects it in the save state. Rethrows the write's error. */
export async function trackProjectSave<T>(write: () => Promise<T>): Promise<T> {
  pending += 1;
  publish();
  try {
    const result = await write();
    lastFailed = false;
    return result;
  } catch (error) {
    lastFailed = true;
    throw error;
  } finally {
    pending -= 1;
    publish();
  }
}

/** Test helper: back to the initial "saved" state. */
export function resetSaveStatus() {
  pending = 0;
  lastFailed = false;
  publish();
}

export function getSaveStatus(): SaveStatus {
  return snapshot;
}

/**
 * Current save state. `paused` (the DOM-edit save queue breaker) always reads as failed,
 * because nothing is persisted until the user retries.
 */
export function useSaveStatus(paused: boolean): SaveStatus {
  const status = useSyncExternalStore(subscribe, getSaveStatus, getSaveStatus);
  return paused ? "failed" : status;
}
