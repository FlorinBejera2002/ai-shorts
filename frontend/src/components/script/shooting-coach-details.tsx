'use client'

import type { CoachScene, ShootingCoachLabels } from './shooting-coach'
import {
  cleanDialogue,
  formatLabel,
  formatMeasure,
  sceneDuration
} from './shooting-coach-utils'
import styles from './shooting-coach.module.css'

/** Scene details aside: number, spoken line and the camera/performance plan. */
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
  const details: [string, string, boolean?][] = [
    [labels.cameraPosition, cameraReadout],
    [labels.focalLength, lensReadout],
    [labels.movement, scene.camera_movement.replace(/_/g, ' ')],
    [labels.lighting, lighting],
    [
      labels.performance,
      (scene.voice_emotion ?? 'confident') +
        ' · ' +
        formatMeasure(scene.voice_pace ?? 1) +
        '×'
    ],
    [labels.creatorAction, scene.subject_action ?? scene.visual_description, true]
  ]

  return (
    <aside className={styles.details} aria-label={labels.details}>
      <div className={styles.detailsHeader}>
        <span className={styles.detailsNumber} aria-hidden="true">
          {index + 1}
        </span>
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
        {details.map(([label, value, wide]) => (
          <div key={label} className={styles.detail} data-wide={wide || undefined}>
            <dt>{label}</dt>
            <dd>{value || '—'}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
