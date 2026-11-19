'use client'

import { ArrowLeftRight, Camera, Image, Lightbulb, User, Video, type LucideIcon } from 'lucide-react'
import type { CoachScene, ShootingCoachLabels } from './shooting-coach'
import {
  cleanDialogue,
  formatLabel,
  formatMeasure,
  sceneDuration
} from './shooting-coach-utils'
import styles from './shooting-coach.module.css'

type DetailRow = { label: string; value: string; icon: LucideIcon }

/** Scene details aside: title, spoken line and the camera/performance plan. */
export function ShootingCoachDetails({
  scene,
  index,
  labels,
  lensReadout,
  cameraReadout,
  lighting
}: {
  scene: CoachScene
  index: number
  labels: ShootingCoachLabels
  lensReadout: string
  cameraReadout: string
  lighting: string
}) {
  const dialogue = cleanDialogue(scene.dialogue)
  const rows: DetailRow[] = [
    { label: labels.cameraPosition, value: cameraReadout, icon: Camera },
    { label: labels.focalLength, value: lensReadout, icon: Image },
    { label: labels.movement, value: scene.camera_movement.replace(/_/g, ' '), icon: ArrowLeftRight },
    { label: labels.lighting, value: lighting, icon: Lightbulb },
    {
      label: labels.performance,
      value: (scene.voice_emotion ?? 'confident') + ' · ' + formatMeasure(scene.voice_pace ?? 1) + '×',
      icon: Video
    },
    { label: labels.creatorAction, value: scene.subject_action ?? scene.visual_description, icon: User }
  ]

  return (
    <aside className={styles.details} aria-label={labels.details}>
      <div className={styles.detailsHeader}>
        <h2>{formatLabel(labels.timelineScene, { number: index + 1 })}</h2>
        <span className={styles.detailsDuration}>
          {formatLabel(labels.seconds, { count: sceneDuration(scene) })}
        </span>
      </div>
      <p className={styles.dialogue} data-empty={!dialogue}>
        <span className="sr-only">{labels.dialogue}: </span>
        {dialogue ? <q>{dialogue}</q> : labels.noDialogue}
      </p>
      <dl className={styles.detailList}>
        {rows.map(({ label, value, icon: Icon }) => (
          <div key={label} className={styles.detail}>
            <span className={styles.detailIcon} aria-hidden="true">
              <Icon />
            </span>
            <div className={styles.detailText}>
              <dt>{label}</dt>
              <dd>{value || '—'}</dd>
            </div>
          </div>
        ))}
      </dl>
    </aside>
  )
}
