import type { StudioLocale } from "../i18n/dictionary";

/** Clips page of the SneepCut app that opened Studio, from the referrer. */
export function clipsUrlFromReferrer(referrer: string, ownOrigin: string): string | null {
  try {
    const url = new URL(referrer);
    if (!["http:", "https:"].includes(url.protocol) || url.origin === ownOrigin) return null;
    return `${url.origin}/dashboard/clips`;
  } catch {
    return null;
  }
}

/** App path prefix per locale: English is the default and has none. */
const LOCALE_PATH_PREFIX: Record<StudioLocale, string> = { en: "", ro: "/ro", es: "/es" };

/** Clips page of the app in the locale Studio was opened in (the Romanian and Spanish apps live under /ro and /es). */
export function appClipsUrl(appOrigin: string, locale: StudioLocale): string {
  return `${appOrigin}${LOCALE_PATH_PREFIX[locale]}/dashboard/clips`;
}
