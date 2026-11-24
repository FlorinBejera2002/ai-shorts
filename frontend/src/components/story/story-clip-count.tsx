import { useState } from 'react'
import { clampManualClipCount, MAX_CLIP_COUNT } from './types'
import { StorySegmentedControl } from './story-segmented-control'
import { useStoryLanguage } from './use-story-language'
import styles from './story-options.module.css'

const PRESET_COUNTS = [3, 5, 8]

/** The text a manual field shows for a count, or null when the count is Auto or a preset. */
function manualText(count: number) {
  return count > 0 && !PRESET_COUNTS.includes(count) ? String(count) : null
}

/**
 * Number of clips to make: Auto (0), a preset, or a typed count. A typed count selects the
 * manual field and clears the presets. An emptied field returns to Auto.
 */
export function StoryClipCount({
  value,
  onChange
}: {
  value: number
  onChange: (count: number) => void
}) {
  const text = useStoryLanguage()
  // What the user typed, tagged with the count it produced. Once the saved count moves on
  // (a preset, or a change from elsewhere), the field shows the saved count instead.
  const [typed, setTyped] = useState<{ text: string; count: number } | null>(null)
  const fieldText =
    typed && typed.count === value ? typed.text : (manualText(value) ?? '')
  const fieldActive = fieldText.trim() !== ''

  function typeCount(raw: string) {
    if (raw.trim() === '') {
      setTyped({ text: raw, count: 0 })
      onChange(0)
      return
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return
    const count = clampManualClipCount(parsed)
    setTyped({ text: String(count), count })
    onChange(count)
  }

  return (
    <div className={styles.clipCountRow}>
      <StorySegmentedControl
        label={text('Number of clips', 'Număr de clipuri')}
        equalWidths
        value={fieldActive ? undefined : value}
        options={[
          { value: 0, label: 'Auto' },
          ...PRESET_COUNTS.map((count) => ({ value: count, label: String(count) }))
        ]}
        onChange={(count) => {
          setTyped(null)
          onChange(count)
        }}
      />
      <input
        type="number"
        className={styles.manualField}
        inputMode="numeric"
        min={1}
        max={MAX_CLIP_COUNT}
        step={1}
        placeholder={text('Other', 'Altul')}
        aria-label={text('Other clip count', 'Alt număr de clipuri')}
        data-selected={fieldActive ? 'true' : undefined}
        value={fieldText}
        onChange={(event) => typeCount(event.target.value)}
      />
    </div>
  )
}
