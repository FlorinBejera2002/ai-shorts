export type ClipScoreTone = 'high' | 'promising' | 'low'

/** Score bands shared by the library filters and score badges. */
export function clipScoreTone(score: number): ClipScoreTone {
  if (score >= 8) return 'high'
  if (score >= 5) return 'promising'
  return 'low'
}

/** Scores keep the compact “9.2” form used by the approved Clips design. */
export function formatClipScore(score: number) {
  return score.toFixed(1)
}

/** Converts "1080 × 1920" style resolutions to the familiar "1080p" label. */
export function clipQuality(resolution: string) {
  const sides = (resolution.match(/\d+/g) ?? []).map(Number).filter(Boolean)
  return sides.length >= 2 ? `${Math.min(...sides)}p` : resolution
}

const shortDates = new Map<string, Intl.DateTimeFormat>()

export function formatClipDay(value: string, locale: string) {
  let formatter = shortDates.get(locale)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short'
    })
    shortDates.set(locale, formatter)
  }
  return formatter.format(new Date(value)).replace('.', '')
}
