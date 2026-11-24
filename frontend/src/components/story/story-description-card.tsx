'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { footageNumbers } from './story-footage'
import { StoryBriefEditor, type StoryBriefEditorHandle } from './story-brief-editor'
import { StoryFootagePicker } from './story-footage-picker'
import { StoryFootageTagDialog } from './story-footage-tag-dialog'
import { MAX_BRIEF_LENGTH, removeFootageReferences } from './story-brief-tokens'
import type { StoryAsset } from './types'
import { useStoryLanguage } from './use-story-language'
import pill from './story-pill-buttons.module.css'
import styles from './story-options.module.css'

interface Props {
  brief: string
  /** Footage in timeline order. */
  footage: StoryAsset[]
  disabled: boolean
  onChange: (brief: string) => void
}

/** "Descrie videoul dorit": the free-text brief, with footage tags that the editing AI receives. */
export function StoryDescriptionCard({ brief, footage, disabled, onChange }: Props) {
  const text = useStoryLanguage()
  const titleID = useId()
  const editor = useRef<StoryBriefEditorHandle>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [previewID, setPreviewID] = useState<string | null>(null)
  const numbers = useMemo(() => footageNumbers(footage), [footage])
  const previewAsset = footage.find((asset) => asset.id === previewID) ?? null

  return (
    <section className={styles.card} aria-labelledby={titleID}>
      <h2 id={titleID} className={styles.cardTitle}>
        {text('Describe the video you want', 'Descrie videoul dorit')}
      </h2>
      <StoryBriefEditor
        ref={editor}
        brief={brief}
        footage={footage}
        disabled={disabled}
        label={text('Describe the video you want', 'Descrie videoul dorit')}
        placeholder={text('What should we focus on?', 'Pe ce să ne concentrăm?')}
        onChange={(next) => onChange(next.slice(0, MAX_BRIEF_LENGTH))}
        onMention={() => setPickerOpen(true)}
        onOpenFootage={setPreviewID}
      />
      <StoryFootagePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        footage={footage}
        onPick={(assetID) => {
          setPickerOpen(false)
          editor.current?.insertFootage(assetID)
        }}
      >
        <Button
          type="button"
          variant="outline"
          className={`justify-self-start ${pill.pill} ${pill.outline}`}
          disabled={disabled || footage.length === 0}
        >
          <span aria-hidden="true" className="font-bold">
            @
          </span>
          {text('Add footage', 'Adaugă filmare')}
        </Button>
      </StoryFootagePicker>
      <StoryFootageTagDialog
        asset={previewAsset}
        number={previewAsset ? (numbers.get(previewAsset.id) ?? 0) : 0}
        onClose={() => setPreviewID(null)}
        onRemove={(assetID) => {
          onChange(removeFootageReferences(brief, assetID))
          setPreviewID(null)
        }}
      />
    </section>
  )
}
