import type { BrandKit } from './types'

export const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function normalizeHex(value: string) {
  if (!HEX_RE.test(value)) return value
  if (value.length === 4) {
    const [r, g, b] = value.slice(1).split('')
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return value.toUpperCase()
}

export function sameColor(a: string, b: string) {
  return normalizeHex(a) === normalizeHex(b)
}

export function colorWithOpacity(color: string, opacity: number) {
  const normalized = normalizeHex(color)
  if (!HEX_RE.test(normalized) || normalized.length !== 7) return color
  return `${normalized}${Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0')}`
}

function luminance(color: string) {
  const normalized = normalizeHex(color)
  if (!HEX_RE.test(normalized) || normalized.length !== 7) return 0
  const channels = [1, 3, 5].map((offset) => {
    const value =
      Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const [red = 0, green = 0, blue = 0] = channels
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

export function brandCompletion(kit: BrandKit) {
  const checks = [
    Boolean(kit.logoUrl),
    HEX_RE.test(kit.primaryColor) && HEX_RE.test(kit.secondaryColor),
    Boolean(kit.fontFamily),
    Boolean(kit.subtitleFont) && HEX_RE.test(kit.subtitleColor)
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}
