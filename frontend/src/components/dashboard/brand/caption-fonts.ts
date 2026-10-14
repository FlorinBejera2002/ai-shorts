import { apiFetch, authClient } from '@/lib/auth'
const loaded = new Map<string, FontFace>()
const pending = new Map<string, Promise<string>>()
const retained = new Map<string, number>()
let owner = authClient.getSnapshot().user?.id ?? null
let generation = 0
function clearFonts() {
  generation++
  for (const face of loaded.values()) document.fonts.delete(face)
  loaded.clear()
  pending.clear()
  retained.clear()
}
const unsubscribe = authClient.subscribe(() => {
  const next = authClient.getSnapshot().user?.id ?? null
  if (next !== owner) {
    owner = next
    clearFonts()
  }
})
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    unsubscribe()
    clearFonts()
  })
function trim() {
  for (const [key, face] of loaded) {
    if (loaded.size <= 12) break
    if (retained.has(key)) continue
    document.fonts.delete(face)
    loaded.delete(key)
  }
}
// Mounted selections cannot be evicted by hovering over other font previews.
export function retainCaptionFont(id: string, weight: number) {
  const key = `${id}:${weight}`
  const retainedGeneration = generation
  retained.set(key, (retained.get(key) ?? 0) + 1)
  return () => {
    if (generation !== retainedGeneration) return
    const count = (retained.get(key) ?? 1) - 1
    if (count) retained.set(key, count)
    else retained.delete(key)
    trim()
  }
}
export function browserFontFamily(id: string, weight: number) {
  return `Caption_${id.replace(/[^a-z0-9]/gi, '_')}_${weight}`
}
export async function loadCaptionFont(
  id: string,
  weight: number
): Promise<string> {
  const key = `${id}:${weight}`,
    family = browserFontFamily(id, weight)
  if (loaded.has(key)) return family
  const existing = pending.get(key)
  if (existing) return existing
  const requestedGeneration = generation
  const request = (async () => {
    const response = await apiFetch(
      `/api/user/brand/font-file?id=${encodeURIComponent(id)}&weight=${weight}`
    )
    if (!response.ok) throw new Error('Font unavailable')
    const face = new FontFace(family, await response.arrayBuffer(), {
      weight: String(weight)
    })
    await face.load()
    if (generation !== requestedGeneration)
      throw new Error('Font session changed')
    document.fonts.add(face)
    loaded.set(key, face)
    trim()
    return family
  })()
  pending.set(key, request)
  try {
    return await request
  } finally {
    if (pending.get(key) === request) pending.delete(key)
  }
}
