'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { CoachScene } from './shooting-coach'
import type { ScriptScene } from '@/lib/scripts-workspace'
import { ArrowDown, ArrowUp, ChevronDown, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import styles from './scripts-workspace.module.css'

interface Props {
  scene: ScriptScene
  index: number
  count: number
  onUpdate: (patch: Partial<CoachScene>) => void
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
}

export function ScriptSceneEditor({
  scene,
  index,
  count,
  onUpdate,
  onMove,
  onDelete
}: Props) {
  const t = useTranslations('scriptGenerator')
  const id = useId()
  const [expanded, setExpanded] = useState(
    index === 0 || !scene.visual_description
  )
  const title = t('sceneN', { n: index + 1 })
  const fields = [
    ['visual_description', 'visualLabel'],
    ['dialogue', 'dialogueLabel'],
    ['camera_angle', 'cameraLabel'],
    ['transition', 'transitionLabel'],
    ['text_overlay', 'overlayLabel']
  ] as const

  return (
    <section
      className={styles.scene}
      aria-label={title}
      data-script-scene={index + 1}
      data-scene-id={scene.editor_id}
    >
      <div className={styles.sceneHeader}>
        <button
          type="button"
          className={styles.sceneToggle}
          aria-expanded={expanded}
          aria-controls={`${id}-fields`}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown
            aria-hidden="true"
            className={expanded ? '' : styles.collapsedChevron}
          />
          <h3>{title}</h3>
          <span>{scene.duration_seconds}s</span>
        </button>
        <div className={styles.sceneActions}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('workspace.moveUp')}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('workspace.moveDown')}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('workspace.deleteScene')}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <div
        id={`${id}-fields`}
        className={styles.sceneFields}
        hidden={!expanded}
      >
        {fields.map(([key, label]) => (
          <div className={styles.sceneField} key={key}>
            <Label htmlFor={`${id}-${key}`}>{t(label)}</Label>
            {key === 'visual_description' || key === 'dialogue' ? (
              <Textarea
                id={`${id}-${key}`}
                value={scene[key]}
                rows={1}
                onChange={(event) => onUpdate({ [key]: event.target.value })}
              />
            ) : (
              <Input
                id={`${id}-${key}`}
                value={scene[key]}
                onChange={(event) => onUpdate({ [key]: event.target.value })}
              />
            )}
          </div>
        ))}
      </div>
      {!expanded && (
        <dl className={styles.sceneSummary}>
          {fields.map(([key, label]) => (
            <div key={key}>
              <dt>{t(label)}</dt>
              <dd>{scene[key] || '—'}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
