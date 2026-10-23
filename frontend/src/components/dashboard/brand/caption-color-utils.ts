import { normalizeHex } from './utils'

export type HsvColor = { h: number; s: number; v: number }
export function hexToHsv(hex: string): HsvColor {
  const normalized = normalizeHex(hex)
  const [r, g, b] = [1, 3, 5].map(offset => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255)
  const max = Math.max(r!, g!, b!), min = Math.min(r!, g!, b!), delta = max - min
  let hue = 0
  if (delta) {
    if (max === r) hue = ((g! - b!) / delta) % 6
    else if (max === g) hue = (b! - r!) / delta + 2
    else hue = (r! - g!) / delta + 4
  }
  return { h: (hue * 60 + 360) % 360, s: max === 0 ? 0 : delta / max, v: max }
}
export function hsvToHex({ h, s, v }: HsvColor) {
  const hue = ((h % 360) + 360) % 360
  const saturation = Math.max(0, Math.min(1, s)), brightness = Math.max(0, Math.min(1, v))
  const chroma = brightness * saturation
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1))
  const offset = brightness - chroma
  const channels = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] :
    hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x]
  return `#${channels.map(channel => Math.round((channel + offset) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}
