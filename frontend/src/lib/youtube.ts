const YOUTUBE_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{11})/,
  /(?:youtu\.be\/)([\w-]{11})/,
  /(?:youtube\.com\/shorts\/)([\w-]{11})/,
  /(?:youtube\.com\/embed\/)([\w-]{11})/,
  /(?:youtube\.com\/live\/)([\w-]{11})/
]

export function extractYouTubeId(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  for (const pattern of YOUTUBE_ID_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
}

/** Formats a byte count with the locale's decimal separator (for example "1,50 GB" in es and ro). */
export function formatBytes(bytes: number, locale = 'en'): string {
  const format = (value: number, digits: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
  if (bytes >= 1024 ** 3) return `${format(bytes / 1024 ** 3, 2)} GB`
  if (bytes >= 1024 ** 2) return `${format(bytes / 1024 ** 2, 1)} MB`
  if (bytes >= 1024) return `${format(bytes / 1024, 0)} KB`
  return `${bytes} B`
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0)
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
