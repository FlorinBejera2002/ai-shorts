/** Keep sub-second cuts visible instead of labelling short scenes 0:00–0:00. */
export function formatStoryTime(seconds: number): string {
  const hundredths = Math.round(
    Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 100
  )
  const hours = Math.floor(hundredths / 360000)
  const minutes = Math.floor(hundredths / 6000) % 60
  const remainder = String(Math.floor(hundredths / 100) % 60).padStart(2, '0')
  const fraction = String(hundredths % 100).padStart(2, '0')
  const prefix = hours
    ? `${hours}:${String(minutes).padStart(2, '0')}`
    : String(minutes)
  return `${prefix}:${remainder}.${fraction}`
}
