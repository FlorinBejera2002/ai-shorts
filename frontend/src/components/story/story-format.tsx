import { useStoryLanguage } from './use-story-language'
import styles from './story-options.module.css'

const FORMATS = [
  { value: '9:16', width: 9, height: 16 },
  { value: '1:1', width: 1, height: 1 },
  { value: '16:9', width: 16, height: 9 },
  { value: '4:5', width: 4, height: 5 }
] as const

const LONGEST_GLYPH_SIDE = 28

/** Frame shape tiles. Each glyph keeps its ratio, with the longest side at a fixed size. */
export function StoryFormat({
  value,
  onChange
}: {
  value: string
  onChange: (value: string) => void
}) {
  const text = useStoryLanguage()
  return (
    <div
      role="radiogroup"
      aria-label={text('Shape', 'Format')}
      className={styles.formatGrid}
    >
      {FORMATS.map((format) => {
        const scale = LONGEST_GLYPH_SIDE / Math.max(format.width, format.height)
        const checked = value === format.value
        return (
          <button
            key={format.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={format.value}
            className={styles.formatTile}
            onClick={() => onChange(format.value)}
          >
            <span
              className={styles.formatGlyph}
              aria-hidden="true"
              style={{
                width: format.width * scale,
                height: format.height * scale
              }}
            />
            {format.value}
          </button>
        )
      })}
    </div>
  )
}
