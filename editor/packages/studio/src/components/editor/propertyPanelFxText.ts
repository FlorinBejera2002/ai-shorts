// Romanian for the audio-effect data that Core supplies in English (effect titles, preset
// names and problem lines, job labels, signal-path labels). English passes through unchanged.
import { lookAudioTextRo } from "../../i18n/messages/lookAudio";
import { getStudioLocale } from "../../i18n/translate";

export function audioText(english: string): string {
  if (getStudioLocale() !== "ro") return english;
  return lookAudioTextRo[english] ?? english;
}

/** Translates "into Voiceover"-style labels: a known prefix plus a user-named group. */
export function audioPathText(english: string): string {
  if (getStudioLocale() !== "ro") return english;
  if (english.startsWith("into ")) return `în ${english.slice(5)}`;
  if (english.endsWith(", together"))
    return `${english.slice(0, -10).replace(/ and /g, " și ")}, împreună`;
  return lookAudioTextRo[english] ?? english;
}
