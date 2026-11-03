'use client'

import {
  type CameraMovementDirection,
  type CameraMovementType,
  type CameraViewMode,
  buildCameraVisualization,
  projectCameraSceneAtElapsed
} from '@/lib/camera-visualization'
import { useReducedMotion } from 'framer-motion'
import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { type KeyboardEvent, useMemo, useRef } from 'react'
import { ShootingCoachDetails } from './shooting-coach-details'
import { ShootingCoachStage } from './shooting-coach-stage'
import {
  clamp,
  formatLabel,
  formatMeasure,
  formatTime,
  sceneDuration
} from './shooting-coach-utils'
import { useCoachPlayback } from './use-coach-playback'
import styles from './shooting-coach.module.css'

export type CoachScene = {
  scene_number: number
  duration_seconds: number
  visual_description: string
  camera_angle: string
  camera_movement: string
  camera_movement_type: CameraMovementType
  camera_movement_direction: CameraMovementDirection
  dialogue: string
  text_overlay: string
  music_mood: string
  transition: string
  shot_type?: string
  camera_height?: number
  camera_distance?: number
  camera_yaw?: number
  camera_pitch?: number
  lens_mm?: number
  subject_action?: string
  subject_position?: number[]
  lighting?: string
  voice_emotion?: string
  voice_pace?: number
  voice_emphasis?: string[]
}

export type ShootingCoachLabels = {
  title: string
  stage: string
  details: string
  viewControls: string
  viewDirector: string
  viewCamera: string
  viewTop: string
  emptyTitle: string
  emptyDescription: string
  cameraPosition: string
  movement: string
  lighting: string
  performance: string
  creatorAction: string
  dialogue: string
  noDialogue: string
  restart: string
  play: string
  pause: string
  mute: string
  unmute: string
  timeline: string
  timelineScene: string
  seconds: string
  visualizationLabel: string
  focalLength: string
  cameraReadout: string
  fovReadout: string
}

const DEFAULT_SHOOTING_COACH_LABELS: ShootingCoachLabels = {
  title: '3D Shooting Coach',
  stage: '3D studio plan',
  details: 'Scene details',
  viewControls: 'Camera visualization view',
  viewDirector: 'Studio',
  viewCamera: 'Camera',
  viewTop: 'Plan',
  emptyTitle: 'No camera plan yet',
  emptyDescription:
    'Generate a script to preview its camera position, framing and movement.',
  cameraPosition: 'Camera position',
  movement: 'Movement',
  lighting: 'Lighting',
  performance: 'Performance',
  creatorAction: 'Creator action',
  dialogue: 'Dialogue',
  noDialogue: 'Scene without dialogue',
  restart: 'Restart preview',
  play: 'Play preview',
  pause: 'Pause preview',
  mute: 'Mute preview',
  unmute: 'Unmute preview',
  timeline: 'Scene timeline',
  timelineScene: 'Scene {number}',
  seconds: '{count} s',
  visualizationLabel:
    'Projected studio plan showing the camera, subject and field of view',
  focalLength: 'Lens and field of view',
  cameraReadout: '{distance}m away · {height}m high',
  fovReadout: '{lens}mm · {fov}° FOV'
}

type ShootingCoachProps = {
  scenes: CoachScene[]
  labels?: Partial<ShootingCoachLabels>
  speechLanguage?: string
  active?: boolean
}

/** Dark 3D stage with view modes and playback, scene details and timeline. */
export function ShootingCoach({
  scenes,
  labels,
  speechLanguage = 'en',
  active = true
}: ShootingCoachProps) {
  const copy = useMemo(
    () => ({ ...DEFAULT_SHOOTING_COACH_LABELS, ...labels }),
    [labels]
  )
  const reduceMotion = useReducedMotion() ?? false
  const playback = useCoachPlayback(scenes, active, speechLanguage)
  const timelineButtons = useRef<Array<HTMLButtonElement | null>>([])
  const { scene, activeIndex, elapsed, view, sceneStarts } = playback

  function handleTimelineKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = Math.min(scenes.length - 1, index + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = Math.max(0, index - 1)
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = scenes.length - 1
    }
    if (nextIndex === null) return
    event.preventDefault()
    playback.seekScene(nextIndex)
    timelineButtons.current[nextIndex]?.focus()
  }

  if (!scene) {
    return (
      <section
        aria-label={copy.title}
        data-shooting-coach=""
        className={styles.empty}
      >
        <h2>{copy.title}</h2>
        <p>{copy.emptyTitle}</p>
        <p>{copy.emptyDescription}</p>
      </section>
    )
  }

  const duration = sceneDuration(scene)
  const projectedScene = projectCameraSceneAtElapsed(
    scene,
    elapsed,
    sceneStarts[activeIndex] ?? 0,
    duration
  )
  const visualization = buildCameraVisualization(projectedScene, view)
  const lensReadout = formatLabel(copy.fovReadout, {
    lens: formatMeasure(visualization.effectiveLensMm),
    fov: Math.round(visualization.horizontalFov)
  })
  const views: [CameraViewMode, string][] = [
    ['director', copy.viewDirector],
    ['camera', copy.viewCamera],
    ['top', copy.viewTop]
  ]

  return (
    <section aria-label={copy.title} data-shooting-coach="" className={styles.coach}>
      <div
        className={styles.stage}
        role="group"
        aria-label={copy.stage}
        data-coach-stage=""
        data-view={view}
      >
        <ShootingCoachStage
          label={copy.visualizationLabel}
          reduceMotion={reduceMotion}
          sceneNumber={scene.scene_number}
          visualization={visualization}
        />
        <div className={styles.views} role="group" aria-label={copy.viewControls}>
          {views.map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => playback.setView(mode)}
              data-coach-view={mode}
              aria-pressed={view === mode}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.readouts}>
          <span className={styles.readout}>
            {(scene.shot_type ?? scene.camera_angle).replace(/_/g, ' ')}
          </span>
          <span className={styles.readout}>{lensReadout}</span>
          {scene.text_overlay ? (
            <span className={styles.overlayText}>{scene.text_overlay}</span>
          ) : null}
        </div>
        <div className={styles.playback}>
          <button
            type="button"
            className={styles.stageButton}
            onClick={playback.restart}
            aria-label={copy.restart}
            title={copy.restart}
          >
            <RotateCcw aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.playButton}
            onClick={playback.togglePlayback}
            data-coach-play=""
            aria-label={playback.playing ? copy.pause : copy.play}
            title={playback.playing ? copy.pause : copy.play}
          >
            {playback.playing ? (
              <Pause aria-hidden="true" />
            ) : (
              <Play aria-hidden="true" />
            )}
          </button>
          <p className={styles.time}>
            {formatTime(elapsed)} / {formatTime(playback.totalDuration)}
          </p>
          <button
            type="button"
            className={styles.stageButton}
            onClick={playback.toggleSound}
            aria-label={playback.sound ? copy.mute : copy.unmute}
            title={playback.sound ? copy.mute : copy.unmute}
          >
            {playback.sound ? (
              <Volume2 aria-hidden="true" />
            ) : (
              <VolumeX aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <ShootingCoachDetails
        scene={scene}
        index={activeIndex}
        labels={copy}
        lensReadout={lensReadout}
        cameraReadout={formatLabel(copy.cameraReadout, {
          distance: formatMeasure(visualization.scene.cameraDistance),
          height: formatMeasure(visualization.scene.cameraHeight)
        })}
        lighting={visualization.scene.lighting.replace(/_/g, ' ')}
      />

      <nav className={styles.timeline} aria-label={copy.timeline}>
        {scenes.map((item, index) => {
          const current = index === activeIndex
          const name = formatLabel(copy.timelineScene, { number: index + 1 })
          return (
            <button
              key={String(item.scene_number) + '-' + String(index)}
              ref={(element) => {
                timelineButtons.current[index] = element
              }}
              type="button"
              data-coach-scene={index}
              onClick={() => playback.seekScene(index)}
              onKeyDown={(event) => handleTimelineKeyDown(event, index)}
              className={styles.timelineScene}
              style={{ flexGrow: sceneDuration(item) }}
              aria-label={name}
              aria-current={current ? 'step' : undefined}
              tabIndex={current ? 0 : -1}
            >
              <span className={styles.timelineName}>{name}</span>
              <span className={styles.timelineNumber} aria-hidden="true">
                {index + 1}
              </span>
              <span className={styles.timelineDuration}>
                {formatLabel(copy.seconds, { count: sceneDuration(item) })}
              </span>
              {current ? (
                <span
                  className={styles.progress}
                  style={{
                    width:
                      String(
                        clamp(
                          ((elapsed - (sceneStarts[index] ?? 0)) /
                            sceneDuration(item)) *
                            100,
                          0,
                          100
                        )
                      ) + '%'
                  }}
                />
              ) : null}
            </button>
          )
        })}
      </nav>
    </section>
  )
}
