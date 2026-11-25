'use client'

import type { ReactNode } from 'react'
import { Popover } from 'radix-ui'
import theme from '@/components/calendar/publishing-theme.module.css'
import { footageNumbers } from './story-footage'
import type { StoryAsset } from './types'
import { useStoryLanguage } from './use-story-language'
import styles from './story-options.module.css'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Footage in timeline order. */
  footage: StoryAsset[]
  onPick: (assetID: string) => void
  /** The button that opens the picker. */
  children: ReactNode
}

/** Popover that lists footage so one can be added to the description. */
export function StoryFootagePicker({ open, onOpenChange, footage, onPick, children }: Props) {
  const text = useStoryLanguage()
  const numbers = footageNumbers(footage)
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className={`${theme.surface} ${styles.picker}`}
          data-reference-surface=""
          aria-label={text('Add footage', 'Adaugă filmare')}
        >
          {footage.length === 0 && (
            <p className={styles.note}>{text('No footage yet.', 'Nu există filmări încă.')}</p>
          )}
          {footage.map((asset) => {
            const number = numbers.get(asset.id) ?? 0
            return (
              <button
                key={asset.id}
                type="button"
                className={styles.pickerItem}
                onClick={() => onPick(asset.id)}
              >
                {asset.thumbnail_url ? (
                  <img className={styles.pickerThumb} src={asset.thumbnail_url} alt="" />
                ) : (
                  <span className={styles.pickerThumb} aria-hidden="true" />
                )}
                <span className={styles.pickerText}>
                  <span className={styles.pickerTitle}>
                    {text('Footage', 'Filmarea')} {number}
                  </span>
                  <span className={styles.pickerName}>{asset.name}</span>
                </span>
              </button>
            )
          })}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
