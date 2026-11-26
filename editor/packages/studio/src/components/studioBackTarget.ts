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

/** Clips page of the app in the locale Studio was opened in (the Romanian app lives under /ro). */
export function appClipsUrl(appOrigin: string, locale: StudioLocale): string {
  return `${appOrigin}${locale === "ro" ? "/ro" : ""}/dashboard/clips`;
}
