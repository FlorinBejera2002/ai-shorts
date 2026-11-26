// Studio theme resolution. Order: the latest sneepcut:theme message from the SneepCut app
// (the referrer's origin, or the app origin of the session frame), then the ?theme= query
// the app opened Studio with, then the system preference. A message is the app's current
// choice, so it wins over the launch query and is written back into ?theme= so a reload keeps
// it. Changing the theme only sets <html data-theme>; it never reloads the preview.

export type StudioTheme = "light" | "dark";
/** A theme choice from the app: an explicit theme, or "system" to follow the device. */
export type StudioThemeChoice = StudioTheme | "system";

export const STUDIO_THEME_MESSAGE_TYPE = "sneepcut:theme";

export function parseStudioTheme(value: unknown): StudioTheme | null {
  return value === "light" || value === "dark" ? value : null;
}

function parseThemeChoice(value: unknown): StudioThemeChoice | null {
  return value === "system" ? "system" : parseStudioTheme(value);
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
  allowedOrigins: ReadonlySet<string> | string | null,
): StudioThemeChoice | null {
  const allowed =
    typeof allowedOrigins === "string"
      ? eventOrigin === allowedOrigins
      : (allowedOrigins?.has(eventOrigin) ?? false);
  if (!allowed) return null;
  if (!data || typeof data !== "object") return null;
  const record = data as { type?: unknown; theme?: unknown };
  if (record.type !== STUDIO_THEME_MESSAGE_TYPE) return null;
  return parseThemeChoice(record.theme);
}

export function resolveStudioTheme({
  query,
  message,
  systemPrefersDark,
}: {
  query: StudioTheme | null;
  message: StudioThemeChoice | null;
  systemPrefersDark: boolean;
}): StudioTheme {
  const system: StudioTheme = systemPrefersDark ? "dark" : "light";
  if (message === "system") return system;
  return message ?? query ?? system;
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

/** The ?theme= value that keeps a choice across reloads; system removes it. */
export function searchWithTheme(search: string, choice: StudioThemeChoice): string {
  const params = new URLSearchParams(search);
  if (choice === "system") params.delete("theme");
  else params.set("theme", choice);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export type StudioThemeEnvironment = {
  search: string;
  referrer: string;
  systemPrefersDark: () => boolean;
  addMessageListener: (listener: (event: MessageEvent) => void) => () => void;
  subscribeSystem: (listener: () => void) => () => void;
  /** Origins trusted to send theme messages in addition to the referrer. */
  trustedOrigins?: ReadonlySet<string>;
  /** Keeps the latest app choice across reloads. */
  persist?: (choice: StudioThemeChoice) => void;
  root?: HTMLElement;
};

// Installs the theme listeners and returns a disposer. Re-applies on every input change.
export function initStudioTheme(environment: StudioThemeEnvironment): () => void {
  const query = themeFromSearch(environment.search);
  const referrerOrigin = originOf(environment.referrer);
  const allowedOrigins = () => {
    const origins = new Set(environment.trustedOrigins);
    if (referrerOrigin) origins.add(referrerOrigin);
    return origins;
  };
  let message: StudioThemeChoice | null = null;
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
    const next = themeFromMessage(event.data, event.origin, allowedOrigins());
    if (!next) return;
    message = next;
    environment.persist?.(next);
    apply();
  });
  const removeSystem = environment.subscribeSystem(apply);
  apply();
  return () => {
    removeMessage();
    removeSystem();
  };
}

// The app origin of the session frame, registered once Studio knows it.
const appThemeOrigins = new Set<string>();

/** Lets the SneepCut app origin (session frame) update the theme live. */
export function trustStudioThemeOrigin(origin: string) {
  appThemeOrigins.add(origin);
}

// Browser wiring: reads the query string, the referrer, and the system colour scheme.
export function startStudioThemeFromWindow(win: Window = window): () => void {
  const media = win.matchMedia("(prefers-color-scheme: dark)");
  return initStudioTheme({
    search: win.location.search,
    referrer: win.document.referrer,
    systemPrefersDark: () => media.matches,
    trustedOrigins: appThemeOrigins,
    persist: (choice) => {
      const search = searchWithTheme(win.location.search, choice);
      if (search === win.location.search) return;
      const { pathname, hash } = win.location;
      win.history.replaceState(win.history.state, "", `${pathname}${search}${hash}`);
    },
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
