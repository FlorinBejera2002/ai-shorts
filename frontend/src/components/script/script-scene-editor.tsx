'use client'

import type { ScriptScene } from '@/lib/scripts-workspace'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId } from 'react'
import type { CoachScene } from './shooting-coach'
import styles from './script-document.module.css'

type EditableField =
  | 'visual_description'
  | 'camera_angle'
  | 'text_overlay'
  | 'dialogue'
  | 'music_mood'
  | 'transition'

const FIELDS: { key: EditableField; label: string; wide?: boolean }[] = [
  { key: 'visual_description', label: 'visualLabel', wide: true },
  { key: 'camera_angle', label: 'cameraLabel' },
  { key: 'text_overlay', label: 'overlayLabel' },
  { key: 'dialogue', label: 'dialogueLabel', wide: true },
  { key: 'music_mood', label: 'musicLabel' },
  { key: 'transition', label: 'transitionLabel' }
]

interface Props {
  scene: ScriptScene
  index: number
  count: number
  expanded: boolean
  onToggle: () => void
  onUpdate: (patch: Partial<CoachScene>) => void
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
}

/** One scene: the selected scene shows its fields, others a one-line row. */
export function ScriptSceneEditor({
  scene,
  index,
  count,
  expanded,
  onToggle,
  onUpdate,
  onMove,
  onDelete
}: Props) {
  const t = useTranslations('scriptGenerator')
  const id = useId()
  const title = t('sceneN', { n: index + 1 })
  const duration = t('workspace.secondsSpaced', { count: scene.duration_seconds })
  const preview =
    scene.dialogue.replace(/^\[no dialogue\]$/i, '').replace(/^"|"$/g, '') ||
    scene.visual_description ||
    title

  return (
    <section
      className={styles.scene}
      aria-label={title}
      data-expanded={expanded}
      data-script-scene={index + 1}
      data-scene-id={scene.editor_id}
    >
      {expanded ? (
        <div className={styles.sceneHeader}>
          <button
            type="button"
            className={styles.sceneToggle}
            aria-expanded="true"
            aria-controls={`${id}-fields`}
            onClick={onToggle}
          >
            <span className={styles.sceneNumber}>{index + 1}</span>
            <span className={styles.sceneHeading}>
              <span className={styles.sceneName}>{title} · </span>
              {duration}
            </span>
          </button>
          <button
            type="button"
            className={styles.sceneAction}
            aria-label={t('workspace.moveUp')}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.sceneAction}
            aria-label={t('workspace.moveDown')}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.sceneAction} ${styles.sceneDelete}`}
            aria-label={t('workspace.deleteScene')}
            onClick={onDelete}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.sceneRow}
          aria-expanded="false"
          aria-controls={`${id}-fields`}
          onClick={onToggle}
        >
          <span className={styles.sceneNumber}>{index + 1}</span>
          <span className={styles.sceneLine}>
            <span className="sr-only">{title}: </span>
            {preview}
          </span>
          <span className={styles.sceneDuration}>{duration}</span>
        </button>
      )}
      <div id={`${id}-fields`} className={styles.sceneFields} hidden={!expanded}>
        {FIELDS.map(({ key, label, wide }) => (
          <div
            key={key}
            className={styles.tile}
            data-wide={wide || undefined}
            data-field={key}
          >
            <label htmlFor={`${id}-${key}`}>{t(label)}</label>
            {wide ? (
              <textarea
                id={`${id}-${key}`}
                className={styles.tileControl}
                value={scene[key]}
                rows={1}
                onChange={(event) => onUpdate({ [key]: event.target.value })}
              />
            ) : (
              <input
                id={`${id}-${key}`}
                className={styles.tileControl}
                value={scene[key]}
                onChange={(event) => onUpdate({ [key]: event.target.value })}
              />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
