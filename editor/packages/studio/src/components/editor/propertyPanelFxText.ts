// Translated audio-effect data that Core supplies in English (effect titles, preset
// names and problem lines, job labels, signal-path labels). English passes through unchanged.
import { lookAudioTextEs, lookAudioTextRo } from "../../i18n/messages/lookAudio";
import { getStudioLocale } from "../../i18n/translate";

export function audioText(english: string): string {
  const locale = getStudioLocale();
  if (locale === "en") return english;
  const table = locale === "es" ? lookAudioTextEs : lookAudioTextRo;
  return table[english] ?? english;
}

/** Translates "into Voiceover"-style labels: a known prefix plus a user-named group. */
export function audioPathText(english: string): string {
  const locale = getStudioLocale();
  if (locale === "en") return english;
  if (locale === "es") {
    if (english.startsWith("into ")) return `en ${english.slice(5)}`;
    if (english.endsWith(", together"))
      return `${english.slice(0, -10).replace(/ and /g, " y ")}, juntos`;
    return lookAudioTextEs[english] ?? english;
  }
  if (english.startsWith("into ")) return `în ${english.slice(5)}`;
  if (english.endsWith(", together"))
    return `${english.slice(0, -10).replace(/ and /g, " și ")}, împreună`;
  return lookAudioTextRo[english] ?? english;
}
