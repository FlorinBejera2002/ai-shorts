import type { CaptionStyle } from '../caption-style'

/** One kit as listed by `/api/brand-kits` (camelCase columns plus signed URLs). */
export type BrandKitSummary = {
  id: string
  name: string
  isDefault: boolean
  imagePath?: string | null
  imageUrl: string | null
  logoUrl: string | null
  captionStyle: CaptionStyle | null
  subtitleFont: string
  subtitleColor: string
  subtitleBgColor: string
  subtitleBgOpacity: number
  subtitlePosition: string
  fontFamily: string
}

/** Up to two letters for a kit without an image: "Ana Creator" → "AC", "Podcast" → "PO". */
export function kitInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const letters = words.length > 1 ? [words[0][0], words[1][0]] : [...words[0]].slice(0, 2)
  return letters.join('').toLocaleUpperCase()
}

/** Readable name of a caption font id: "builtin:dm-sans" → "DM Sans"; custom fonts → null. */
export function captionFontName(fontId: string | undefined) {
  if (!fontId?.startsWith('builtin:')) return null
  return fontId
    .slice('builtin:'.length)
    .split('-')
    .map((part) => (part.length <= 2 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
    .join(' ')
}

/** A free name for a copy: "Podcast (2)", "Podcast (3)", … */
export function copyName(name: string, taken: string[]) {
  const base = name.replace(/\s\(\d+\)$/, '')
  const used = new Set(taken.map((value) => value.toLocaleLowerCase()))
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base} (${index})`
    if (!used.has(candidate.toLocaleLowerCase())) return candidate
  }
  return `${base} (${Date.now()})`
}

/** Default kit first, then the rest in the API's order (most recently edited). */
export function orderKits(kits: BrandKitSummary[]) {
  return [...kits].sort((left, right) => Number(right.isDefault) - Number(left.isDefault))
}

/** Editor route of one kit. */
export function kitHref(id: string) {
  return `/dashboard/brand/${encodeURIComponent(id)}`
}
