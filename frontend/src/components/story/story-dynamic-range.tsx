import { useStoryLanguage } from './use-story-language'

export function StoryDynamicRange({
  value,
  onChange
}: {
  value?: 'sdr' | 'hdr'
  onChange: (value: 'sdr' | 'hdr') => void
}) {
  const text = useStoryLanguage()
  return (
    <label className="block space-y-2 text-sm">
      <span className="block font-medium">{text('Video color', 'Culoare video')}</span>
      <select
        className="story-select"
        aria-label={text('Video color', 'Culoare video')}
        value={value ?? 'sdr'}
        onChange={(event) => onChange(event.target.value as 'sdr' | 'hdr')}
      >
        <option value="sdr">{text('SDR · widest compatibility', 'SDR · compatibilitate maximă')}</option>
        <option value="hdr">HDR · HEVC 10-bit</option>
      </select>
      <span className="block text-xs text-muted-foreground">
        {value === 'hdr'
          ? text(
              'Preserves HDR highlights from your original clips. Requires an HDR-compatible player and display.',
              'Păstrează luminile HDR din filmările originale. Necesită un player și un ecran compatibile HDR.'
            )
          : text(
              'HDR recordings are converted to SDR with balanced highlights and colors.',
              'Filmările HDR sunt convertite în SDR, cu lumini și culori echilibrate.'
            )}
      </span>
    </label>
  )
}
