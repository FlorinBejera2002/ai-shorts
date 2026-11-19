export const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function normalizeHex(value: string) {
  if (!HEX_RE.test(value)) return value
  if (value.length === 4) {
    const [r, g, b] = value.slice(1).split('')
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  return value.toUpperCase()
}
