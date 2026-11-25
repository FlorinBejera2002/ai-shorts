import { Check } from 'lucide-react'
import type { StoryAsset } from './types'
import { footageNumbers } from './story-footage'
import { useStoryLanguage } from './use-story-language'
import styles from './story-options.module.css'

/** Tiles that choose which footage the noise reduction applies to. At least one stays selected. */
export function StoryNoiseFootagePicker({
  footage,
  selectedIDs,
  onToggle
}: {
  footage: StoryAsset[]
  selectedIDs: readonly string[]
  onToggle: (assetID: string) => void
}) {
  const text = useStoryLanguage()
  const numbers = footageNumbers(footage)
  const selected = new Set(selectedIDs)
  return (
    <div
      role="group"
      aria-label={text('Footage with reduced noise', 'Filmări cu zgomot redus')}
      className={styles.tileGrid}
    >
      {footage.map((asset) => {
        const number = numbers.get(asset.id) ?? 0
        const pressed = selected.has(asset.id)
        return (
          <button
            key={asset.id}
            type="button"
            className={styles.tile}
            aria-label={`${text('Footage', 'Filmarea')} ${number}`}
            aria-pressed={pressed}
            disabled={pressed && selected.size === 1}
            onClick={() => onToggle(asset.id)}
          >
            {asset.thumbnail_url && (
              <img src={asset.thumbnail_url} alt="" loading="lazy" />
            )}
            <span className={styles.tileNumber}>{number}</span>
            {pressed && (
              <span className={styles.tileCheck} aria-hidden="true">
                <Check className="size-3" strokeWidth={3.5} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
