import type { CoachScene } from './shooting-coach'

export function sceneDuration(scene: CoachScene) {
  return Number.isFinite(scene.duration_seconds) && scene.duration_seconds > 0
    ? scene.duration_seconds
    : 1
}

export function cleanDialogue(text: string) {
  return text.replace(/^\[no dialogue\]$/i, '').replace(/^"|"$/g, '')
}

export function formatMeasure(value: number) {
  return Number(value.toFixed(2)).toString()
}

export function formatTime(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0
  const minutes = Math.floor(safeValue / 60)
  const seconds = Math.floor(safeValue % 60)
  return (
    String(minutes).padStart(2, '0') + ':' + seconds.toString().padStart(2, '0')
  )
}

/** Replaces `{name}` placeholders in a raw message template. */
export function formatLabel(
  template: string,
  values: Record<string, string | number>
) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split('{' + key + '}').join(String(value)),
    template
  )
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
