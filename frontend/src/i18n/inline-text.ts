import inlineEs from './inline-es.json'

const SPANISH_BY_ENGLISH: Record<string, string> = inlineEs

/**
 * Picks the copy of an inline string for a locale.
 *
 * Romanian and English are passed explicitly. Spanish comes from the explicit `spanish`
 * argument when given, otherwise from `inline-es.json` keyed by the English string, and
 * falls back to English so a missing entry never renders an empty label.
 */
export function pickInlineText(
  locale: string,
  english: string,
  romanian: string,
  spanish?: string
): string {
  if (locale === 'ro') return romanian
  if (locale === 'es') return spanish ?? SPANISH_BY_ENGLISH[english] ?? english
  return english
}

/** Signature shared by the inline bilingual helpers (`text(english, romanian, spanish?)`). */
export type InlineText = (english: string, romanian: string, spanish?: string) => string
