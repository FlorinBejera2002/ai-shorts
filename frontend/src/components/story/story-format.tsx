import { useStoryLanguage } from './use-story-language'

export function StoryFormat({
  value,
  onChange
}: {
  value: string
  onChange: (value: string) => void
}) {
  const text = useStoryLanguage()
  return (
    <label className="block space-y-2 text-sm">
      <span className="block font-medium">{text('Shape', 'Format')}</span>
      <select
        className="story-select"
        aria-label={text('Shape', 'Format')}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="9:16">{text('Portrait', 'Vertical')} · 9:16</option>
        <option value="1:1">{text('Square', 'Pătrat')} · 1:1</option>
        <option value="16:9">{text('Landscape', 'Orizontal')} · 16:9</option>
        <option value="4:5">{text('Portrait', 'Vertical')} · 4:5</option>
      </select>
    </label>
  )
}
