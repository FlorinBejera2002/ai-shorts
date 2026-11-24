import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { StoryAppearance } from './story-appearance'
import { StoryDynamicRange } from './story-dynamic-range'
import type { StoryAppearanceState } from './use-story-appearance'
import type { StoryOptions } from './types'
import { useStoryLanguage } from './use-story-language'
import styles from './story-options.module.css'

/** Less common settings, collapsed by default. */
export function StoryMoreOptions({
  options,
  appearance,
  onChange
}: {
  options: StoryOptions
  appearance: StoryAppearanceState
  onChange: (options: StoryOptions) => void
}) {
  const text = useStoryLanguage()
  const id = useId()
  const [open, setOpen] = useState(false)
  const change = (patch: Partial<StoryOptions>) => onChange({ ...options, ...patch })
  const keepOrderLocked = Boolean(options.narration)

  return (
    <section>
      <button
        type="button"
        className={styles.moreToggle}
        aria-expanded={open}
        aria-controls={`${id}-body`}
        onClick={() => setOpen((current) => !current)}
      >
        {text('More options', 'Mai multe opțiuni')}
        <ChevronDown
          className={`size-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={`${id}-body`} className={styles.moreBody}>
          <label className="grid gap-2 text-sm">
            <span className="font-medium">{text('Spoken language', 'Limba vorbită')}</span>
            <select
              className={styles.nativeSelect}
              value={options.language}
              onChange={(event) => change({ language: event.target.value })}
            >
              <option value="auto">{text('Detect automatically', 'Detectare automată')}</option>
              <option value="ro">Română</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-medium">{text('Editing style', 'Stilul montajului')}</span>
            <select
              className={styles.nativeSelect}
              value={options.mode}
              onChange={(event) => change({ mode: event.target.value })}
            >
              <option value="smart">{text('Automatic', 'Automat')}</option>
              <option value="strict">{text('Careful selection', 'Selecție prudentă')}</option>
            </select>
          </label>
          <StoryDynamicRange
            value={options.dynamic_range}
            onChange={(dynamic_range) => change({ dynamic_range })}
          />
          <StoryAppearance options={options} appearance={appearance} onChange={onChange} />
          <label className="flex items-center gap-2 text-sm">
            <input
              className="size-4 accent-foreground"
              type="checkbox"
              checked={options.preserve_order}
              disabled={keepOrderLocked}
              onChange={(event) => change({ preserve_order: event.target.checked })}
            />
            {text('Keep my clip order', 'Păstrează ordinea filmărilor')}
          </label>
        </div>
      )}
    </section>
  )
}
