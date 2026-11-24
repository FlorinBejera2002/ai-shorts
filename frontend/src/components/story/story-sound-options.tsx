import { Switch } from '@/components/ui/switch'
import { useAudioCleanupAvailability } from '@/hooks/use-audio-cleanup-availability'
import { StorySoundSource } from './story-sound-source'
import { StoryNoiseFootagePicker } from './story-noise-footage-picker'
import { cleanupFootageIDs, toggleCleanupFootage } from './story-footage'
import type { StoryAsset, StoryOptions } from './types'
import { useStoryLanguage } from './use-story-language'
import styles from './story-options.module.css'

interface Props {
  options: StoryOptions
  footage: StoryAsset[]
  hasNarration: boolean
  onChange: (options: StoryOptions) => void
}

/**
 * Body of the Sunet section: sound source, the noise switch and the footage it applies to.
 * When noise reduction cannot run, the switch is disabled without explanatory text.
 */
export function StorySoundOptions({ options, footage, hasNarration, onChange }: Props) {
  const text = useStoryLanguage()
  const cleanup = useAudioCleanupAvailability()
  const voice = Boolean(options.narration)
  const enabled = Boolean(options.audio_cleanup?.enabled) && !voice
  const assetIDs = options.audio_cleanup?.asset_ids ?? []
  const unavailable = !cleanup.available
  const locked = voice || (unavailable && !options.audio_cleanup?.enabled)
  const label = text('Reduce background noise', 'Redu zgomotul de fundal')

  function setCleanup(next: { enabled: boolean; asset_ids?: string[] }) {
    onChange({
      ...options,
      audio_cleanup: { enabled: next.enabled, asset_ids: next.asset_ids ?? assetIDs }
    })
  }

  return (
    <>
      <StorySoundSource options={options} hasNarration={hasNarration} onChange={onChange} />
      {hasNarration && (
        <p className={styles.note}>
          {text(
            'Remove your voice recording to use the sound from your clips.',
            'Șterge înregistrarea vocală pentru a folosi sunetul filmărilor.'
          )}
        </p>
      )}
      <div className={styles.switchRow}>
        <span className={styles.switchLabel}>{label}</span>
        <Switch
          aria-label={label}
          checked={enabled}
          disabled={locked}
          onCheckedChange={(next) => {
            if (!next || cleanup.available) setCleanup({ enabled: next })
          }}
        />
      </div>
      {enabled && footage.length > 0 && (
        <StoryNoiseFootagePicker
          footage={footage}
          selectedIDs={cleanupFootageIDs(footage, assetIDs)}
          onToggle={(assetID) =>
            setCleanup({ enabled: true, asset_ids: toggleCleanupFootage(footage, assetIDs, assetID) })
          }
        />
      )}
    </>
  )
}
