'use client'

import { ImagePlus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useRef } from 'react'
import { FEEDBACK_IMAGE_LIMIT, FEEDBACK_IMAGE_TYPES } from './feedback-api'
import type { FeedbackImage } from './feedback-image-file'
import styles from './feedback.module.css'

/** Thumbnails of the attached screenshots and the tile that adds more. */
export function FeedbackImages({
  images,
  disabled,
  onAdd,
  onRemove
}: {
  images: readonly FeedbackImage[]
  disabled: boolean
  onAdd: (files: File[]) => void
  onRemove: (id: string) => void
}) {
  const t = useTranslations('feedback')
  const input = useRef<HTMLInputElement>(null)
  const labelId = useId()
  return (
    <div className={styles.images} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={styles.imagesLabel}>
        {t('imagesLabel')}
      </span>
      <ul className={styles.imageList}>
        {images.map((image) => (
          <li key={image.id} className={styles.thumb}>
            <img src={image.preview} alt={image.file.name} />
            <button
              type="button"
              className={styles.thumbRemove}
              onClick={() => onRemove(image.id)}
              aria-label={t('removeImage', { name: image.file.name })}
              disabled={disabled}
            >
              <X aria-hidden="true" />
            </button>
          </li>
        ))}
        {images.length < FEEDBACK_IMAGE_LIMIT && (
          <li>
            <button type="button" className={styles.addImage} onClick={() => input.current?.click()} disabled={disabled}>
              <ImagePlus aria-hidden="true" strokeWidth={1.75} />
              <span>{t('addImage')}</span>
            </button>
          </li>
        )}
      </ul>
      <input
        ref={input}
        type="file"
        accept={FEEDBACK_IMAGE_TYPES.join(',')}
        multiple={true}
        hidden={true}
        onChange={(event) => {
          onAdd(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />
    </div>
  )
}
