import { useSyncExternalStore } from "react";

let revision = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => revision;

export function notifySourceCutChange() {
  revision++;
  for (const listener of listeners) listener();
}
export function useSourceCutRevision() {
  return useSyncExternalStore(subscribe, snapshot);
}
