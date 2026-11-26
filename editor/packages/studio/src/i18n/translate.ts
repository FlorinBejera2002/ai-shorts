// t() and the active locale. Locale resolution: ?lang= (en, ro or es), then the browser language
// (starting with "ro" gives Romanian, "es" Spanish), then English. <html lang> follows the resolved locale.
import { useSyncExternalStore } from "react";
import { messages, type MessageKey, type StudioLocale } from "./dictionary";

export function parseStudioLocale(value: unknown): StudioLocale | null {
  return value === "ro" || value === "en" || value === "es" ? value : null;
}

export function resolveStudioLocale(search: string, browserLanguage: string): StudioLocale {
  let requested: StudioLocale | null = null;
  try {
    requested = parseStudioLocale(new URLSearchParams(search).get("lang"));
  } catch {
    requested = null;
  }
  if (requested) return requested;
  const language = browserLanguage.toLowerCase();
  if (language.startsWith("ro")) return "ro";
  if (language.startsWith("es")) return "es";
  return "en";
}

let activeLocale: StudioLocale = "en";
const listeners = new Set<() => void>();

export function setStudioLocale(locale: StudioLocale) {
  if (locale === activeLocale) return;
  activeLocale = locale;
  for (const listener of listeners) listener();
}

export function getStudioLocale(): StudioLocale {
  return activeLocale;
}

export function formatMessage(template: string, params: Record<string, string | number> = {}) {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function translate(
  locale: StudioLocale,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  return formatMessage(messages[locale][key], params);
}

/** Translates with the active locale. Components that display text should use useLocale(). */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return translate(activeLocale, key, params);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Subscribes the component to locale changes and returns the active locale. */
export function useLocale(): StudioLocale {
  return useSyncExternalStore(subscribe, getStudioLocale, getStudioLocale);
}

/** Applies the resolved locale from the URL and the browser. Call once at startup. */
export function startStudioLocale(search: string, browserLanguage: string): StudioLocale {
  const locale = resolveStudioLocale(search, browserLanguage);
  setStudioLocale(locale);
  document.documentElement.lang = locale;
  return locale;
}

/** Romanian and Spanish write decimals with a comma ("0,4 s"); English uses a point. */
export function usesDecimalComma(locale: StudioLocale): boolean {
  return locale !== "en";
}
