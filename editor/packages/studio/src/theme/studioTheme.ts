// Studio theme resolution. Order: ?theme= query, then a sneepcut:theme message from the
// embedding app (accepted only from the referrer's origin), then the system preference.
// Changing the theme only sets <html data-theme>; it never reloads the preview or saves.

export type StudioTheme = "light" | "dark";

export const STUDIO_THEME_MESSAGE_TYPE = "sneepcut:theme";

export function parseStudioTheme(value: unknown): StudioTheme | null {
  return value === "light" || value === "dark" ? value : null;
}

export function themeFromSearch(search: string): StudioTheme | null {
  try {
    return parseStudioTheme(new URLSearchParams(search).get("theme"));
  } catch {
    return null;
  }
}

export function themeFromMessage(
  data: unknown,
  eventOrigin: string,
  allowedOrigin: string | null,
): StudioTheme | null {
  if (!allowedOrigin || eventOrigin !== allowedOrigin) return null;
  if (!data || typeof data !== "object") return null;
  const record = data as { type?: unknown; theme?: unknown };
  if (record.type !== STUDIO_THEME_MESSAGE_TYPE) return null;
  return parseStudioTheme(record.theme);
}

export function resolveStudioTheme({
  query,
  message,
  systemPrefersDark,
}: {
  query: StudioTheme | null;
  message: StudioTheme | null;
  systemPrefersDark: boolean;
}): StudioTheme {
  return query ?? message ?? (systemPrefersDark ? "dark" : "light");
}

export function originOf(url: string): string | null {
  try {
    const origin = new URL(url).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

export function applyStudioTheme(theme: StudioTheme, root: HTMLElement = document.documentElement) {
  root.dataset.theme = theme;
}

export type StudioThemeEnvironment = {
  search: string;
  referrer: string;
  systemPrefersDark: () => boolean;
  addMessageListener: (listener: (event: MessageEvent) => void) => () => void;
  subscribeSystem: (listener: () => void) => () => void;
  root?: HTMLElement;
};

// Installs the theme listeners and returns a disposer. Re-applies on every input change.
export function initStudioTheme(environment: StudioThemeEnvironment): () => void {
  const query = themeFromSearch(environment.search);
  const allowedOrigin = originOf(environment.referrer);
  let message: StudioTheme | null = null;
  const apply = () =>
    applyStudioTheme(
      resolveStudioTheme({
        query,
        message,
        systemPrefersDark: environment.systemPrefersDark(),
      }),
      environment.root,
    );
  const removeMessage = environment.addMessageListener((event) => {
    const next = themeFromMessage(event.data, event.origin, allowedOrigin);
    if (!next) return;
    message = next;
    apply();
  });
  const removeSystem = environment.subscribeSystem(apply);
  apply();
  return () => {
    removeMessage();
    removeSystem();
  };
}

// Browser wiring: reads the query string, the referrer, and the system colour scheme.
export function startStudioThemeFromWindow(win: Window = window): () => void {
  const media = win.matchMedia("(prefers-color-scheme: dark)");
  return initStudioTheme({
    search: win.location.search,
    referrer: win.document.referrer,
    systemPrefersDark: () => media.matches,
    addMessageListener: (listener) => {
      win.addEventListener("message", listener);
      return () => win.removeEventListener("message", listener);
    },
    subscribeSystem: (listener) => {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
  });
}
