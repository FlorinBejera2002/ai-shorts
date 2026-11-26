// Phone layout below Tailwind's `sm` breakpoint (640px): 56px top bar, bottom tool bar, sheets.
import { useSyncExternalStore } from "react";

export const PHONE_QUERY = "(max-width: 639px)";

function subscribe(listener: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(PHONE_QUERY).matches;
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
