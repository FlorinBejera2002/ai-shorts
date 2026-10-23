'use client'

import {
  type CameraMovementDirection,
  type CameraMovementType,
  type CameraViewMode,
  buildCameraVisualization,
  projectCameraSceneAtElapsed
} from '@/lib/camera-visualization'
import { useReducedMotion } from 'framer-motion'
import {
  Aperture,
  Box,
  Camera,
  FileText,
  LayoutGrid,
  MessageCircle,
  MoveUpRight,
  Pause,
  Play,
  RotateCcw,
  Sun,
  UserRound,
  Video,
  Volume2,
  VolumeX
} from 'lucide-react'
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ShootingCoachStage } from './shooting-coach-stage'
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
  preview: string
  sceneCounter?: string
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
  visualizationLabel: string
  focalLength: string
  cameraReadout: string
  fovReadout: string
}

const DEFAULT_SHOOTING_COACH_LABELS: ShootingCoachLabels = {
  title: '3D Shooting Coach',
  preview: 'Director preview · scene {current}/{total}',
  sceneCounter: 'Scene {current} / {total}',
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

const emotionPitch: Record<string, number> = {
  excited: 1.14,
  playful: 1.1,
  warm: 1.02,
  calm: 0.92,
  urgent: 1.08,
  authoritative: 0.88,
  confident: 0.98
}

function cleanDialogue(text: string) {
  return text.replace(/^\[no dialogue\]$/i, '').replace(/^"|"$/g, '')
}

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
  const [activeIndex, setActiveIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [previousActive, setPreviousActive] = useState(active)
  const [elapsed, setElapsed] = useState(0)
  const [view, setView] = useState<CameraViewMode>('director')
  const [sound, setSound] = useState(true)
  const [audioEpoch, setAudioEpoch] = useState(0)
  // Closing the focused coach pauses it while retaining the scene and position.
  if (previousActive !== active) {
    setPreviousActive(active)
    setPlaying(false)
  }
  const spokenScene = useRef('')
  const audioContext = useRef<AudioContext | null>(null)
  const ambience = useRef<{
    oscillator: OscillatorNode
    gain: GainNode
  } | null>(null)
  const timelineButtons = useRef<Array<HTMLButtonElement | null>>([])

  const sceneSignature = useMemo(() => JSON.stringify(scenes), [scenes])
  const totalDuration = useMemo(
    () => scenes.reduce((sum, item) => sum + sceneDuration(item), 0),
    [scenes]
  )
  const sceneStarts = useMemo(() => {
    const starts: number[] = []
    let cursor = 0
    for (const item of scenes) {
      starts.push(cursor)
      cursor += sceneDuration(item)
    }
    return starts
  }, [scenes])
  const scene = scenes[activeIndex] ?? scenes[0]
  const playbackEnded = totalDuration > 0 && elapsed >= totalDuration
  const previousSceneSignature = useRef(sceneSignature)

  const stopAmbience = useCallback((immediate = false) => {
    const current = ambience.current
    if (!current) return
    ambience.current = null
    const now = audioContext.current?.currentTime ?? 0
    try {
      if (immediate) {
        current.gain.gain.setValueAtTime(0, now)
        current.oscillator.stop(now)
      } else {
        current.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)
        current.oscillator.stop(now + 0.14)
      }
    } catch {
      // The oscillator may already have stopped during a rapid scene change.
    }
  }, [])

  const stopPlaybackAudio = useCallback(
    (immediate = false) => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      stopAmbience(immediate)
      spokenScene.current = ''
    },
    [stopAmbience]
  )

  const pausePlaybackAudio = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause()
    }
    stopAmbience()
  }, [stopAmbience])

  const startAmbience = useCallback(
    (mood: string) => {
      stopAmbience(true)
      const AudioContextClass = window.AudioContext
      if (!AudioContextClass) return
      try {
        const existing = audioContext.current
        const context =
          existing && existing.state !== 'closed'
            ? existing
            : new AudioContextClass()
        audioContext.current = context
        if (context.state === 'suspended') {
          void context.resume().catch(() => undefined)
        }
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        const lowerMood = mood.toLowerCase()
        oscillator.type = lowerMood.includes('dramatic') ? 'sawtooth' : 'sine'
        oscillator.frequency.value = lowerMood.includes('upbeat')
          ? 164
          : lowerMood.includes('calm')
            ? 98
            : 123
        gain.gain.value = 0.018
        oscillator.connect(gain).connect(context.destination)
        oscillator.start()
        ambience.current = { oscillator, gain }
      } catch {
        ambience.current = null
      }
    },
    [stopAmbience]
  )

  useEffect(() => {
    if (previousSceneSignature.current === sceneSignature) return
    previousSceneSignature.current = sceneSignature
    setActiveIndex(0)
    setElapsed(0)
    setPlaying(false)
    setView('director')
    stopPlaybackAudio(true)
  }, [sceneSignature, stopPlaybackAudio])

  useEffect(
    () => () => {
      stopPlaybackAudio(true)
      const context = audioContext.current
      audioContext.current = null
      if (context && context.state !== 'closed') {
        void context.close().catch(() => undefined)
      }
    },
    [stopPlaybackAudio]
  )

  useEffect(() => {
    if (!playing || scenes.length === 0 || totalDuration <= 0) return
    let last = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const delta = (now - last) / 1000
      last = now
      setElapsed((current) => {
        const next = current + delta
        if (next >= totalDuration) {
          setActiveIndex(Math.max(0, scenes.length - 1))
          setPlaying(false)
          return totalDuration
        }
        const nextScene = scenes.findIndex(
          (item, index) =>
            next < (sceneStarts[index] ?? 0) + sceneDuration(item)
        )
        if (nextScene >= 0) setActiveIndex(nextScene)
        return next
      })
    }, 50)
    return () => window.clearInterval(timer)
  }, [playing, sceneStarts, scenes, totalDuration])

  useEffect(() => {
    if (!sound || !scene) {
      stopPlaybackAudio()
      return
    }
    if (!playing) {
      if (playbackEnded) stopPlaybackAudio()
      else pausePlaybackAudio()
      return
    }
    const audioSceneKey = String(activeIndex) + ':' + String(audioEpoch)
    if (spokenScene.current === audioSceneKey) {
      if ('speechSynthesis' in window && window.speechSynthesis.paused) {
        window.speechSynthesis.resume()
      }
      if (!ambience.current) startAmbience(scene.music_mood)
      return
    }
    spokenScene.current = audioSceneKey
    const line = cleanDialogue(scene.dialogue)
    if (
      line &&
      'speechSynthesis' in window &&
      typeof SpeechSynthesisUtterance !== 'undefined'
    ) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(line)
      utterance.lang = speechLanguage
      utterance.rate = clamp(scene.voice_pace ?? 1, 0.75, 1.35)
      utterance.pitch = emotionPitch[scene.voice_emotion ?? 'confident'] ?? 1
      utterance.volume = 0.92
      const preferredVoice = window.speechSynthesis
        .getVoices()
        .find((voice) =>
          voice.lang.toLowerCase().startsWith(speechLanguage.toLowerCase())
        )
      if (preferredVoice) utterance.voice = preferredVoice
      window.speechSynthesis.speak(utterance)
    }
    startAmbience(scene.music_mood)
  }, [
    activeIndex,
    audioEpoch,
    pausePlaybackAudio,
    playing,
    playbackEnded,
    scene,
    sound,
    speechLanguage,
    startAmbience,
    stopPlaybackAudio
  ])

  const seekScene = useCallback(
    (index: number) => {
      if (scenes.length === 0) return
      const nextIndex = clamp(Math.round(index), 0, scenes.length - 1)
      setActiveIndex(nextIndex)
      setElapsed(sceneStarts[nextIndex] ?? 0)
      stopPlaybackAudio(true)
      setAudioEpoch((value) => value + 1)
    },
    [sceneStarts, scenes.length, stopPlaybackAudio]
  )

  function restart() {
    if (scenes.length === 0) return
    setElapsed(0)
    setActiveIndex(0)
    stopPlaybackAudio(true)
    setAudioEpoch((value) => value + 1)
    setPlaying(true)
  }

  function togglePlayback() {
    if (scenes.length === 0) return
    if (elapsed >= totalDuration) {
      restart()
      return
    }
    if (playing) pausePlaybackAudio()
    setPlaying((value) => !value)
  }

  function toggleSound() {
    if (sound) stopPlaybackAudio(true)
    setSound((value) => !value)
  }

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
    seekScene(nextIndex)
    timelineButtons.current[nextIndex]?.focus()
  }

  if (!scene) {
    return <EmptyShootingCoach labels={copy} />
  }

  const duration = sceneDuration(scene)
  const projectedScene = projectCameraSceneAtElapsed(
    scene,
    elapsed,
    sceneStarts[activeIndex] ?? 0,
    duration
  )
  const visualization = buildCameraVisualization(projectedScene, view)
  const current = visualization.scene
  const views = [
    ['director', Box, copy.viewDirector],
    ['camera', Video, copy.viewCamera],
    ['top', LayoutGrid, copy.viewTop]
  ] as const
  const lensReadout = formatLabel(copy.fovReadout, {
    lens: formatMeasure(visualization.effectiveLensMm),
    fov: Math.round(visualization.horizontalFov)
  })

  return (
    <Card
      as="section"
      aria-label={copy.title}
      data-shooting-coach
      className={cx(
        styles.coach,
        'gap-4 overflow-hidden p-4 shadow-none sm:p-5'
      )}
    >
      <header className="flex items-center justify-between gap-4">
        <h3 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {copy.title}
        </h3>
        <p className="shrink-0 text-sm tabular-nums sm:text-base">
          {formatLabel(copy.sceneCounter ?? 'Scene {current} / {total}', {
            current: activeIndex + 1,
            total: scenes.length
          })}
        </p>
      </header>

      <div className={styles.content}>
        <div
          className={styles.views}
          role="group"
          aria-label={copy.viewControls}
        >
          {views.map(([mode, Icon, label]) => (
            <Button
              key={mode}
              type="button"
              variant="outline"
              onClick={() => setView(mode)}
              data-coach-view={mode}
              className={cx(
                'h-11 min-w-0 gap-2 px-2 shadow-none focus-visible:ring-2 focus-visible:ring-foreground',
                view === mode
                  ? 'border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background dark:bg-foreground dark:hover:bg-foreground/90'
                  : 'bg-transparent hover:bg-muted dark:bg-transparent dark:hover:bg-muted'
              )}
              aria-label={label}
              aria-pressed={view === mode}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
              <span>{label}</span>
            </Button>
          ))}
        </div>

        <div className={styles.stage} data-coach-stage data-view={view}>
          <ShootingCoachStage
            label={copy.visualizationLabel}
            reduceMotion={reduceMotion}
            sceneNumber={scene.scene_number}
            visualization={visualization}
          />
          <div className={styles.readouts}>
            <span className={cx(styles.readout, 'capitalize')}>
              {(scene.shot_type ?? scene.camera_angle).replace(/_/g, ' ')}
            </span>
            <span className={styles.readout}>{lensReadout}</span>
            {scene.text_overlay ? (
              <span className={styles.overlay}>{scene.text_overlay}</span>
            ) : null}
          </div>
        </div>

        <div className={styles.playback}>
          <p className={styles.time}>
            {formatTime(elapsed)} / {formatTime(totalDuration)}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={restart}
            aria-label={copy.restart}
            title={copy.restart}
            className="h-10 gap-2 bg-transparent px-2.5 shadow-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground sm:px-4 dark:bg-transparent dark:hover:bg-muted"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            <span className={styles.controlText}>{copy.restart}</span>
          </Button>
          <Button
            type="button"
            onClick={togglePlayback}
            data-coach-play=""
            className="size-11 rounded-full bg-foreground p-0 text-background hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            aria-label={playing ? copy.pause : copy.play}
            title={playing ? copy.pause : copy.play}
          >
            {playing ? (
              <Pause className="size-[18px] fill-current" aria-hidden="true" />
            ) : (
              <Play className="size-[18px] fill-current" aria-hidden="true" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={toggleSound}
            className="h-10 gap-2 px-2.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground"
            aria-label={sound ? copy.mute : copy.unmute}
            title={sound ? copy.mute : copy.unmute}
          >
            {sound ? (
              <Volume2 className="size-[18px]" aria-hidden="true" />
            ) : (
              <VolumeX className="size-[18px]" aria-hidden="true" />
            )}
            <span className={styles.controlText}>
              {sound ? copy.mute : copy.unmute}
            </span>
          </Button>
        </div>

        <div
          className={styles.timeline}
          role="group"
          aria-label={copy.timeline}
        >
          {scenes.map((item, index) => (
            <button
              key={String(item.scene_number) + '-' + String(index)}
              ref={(element) => {
                timelineButtons.current[index] = element
              }}
              type="button"
              data-coach-scene={index}
              onClick={() => seekScene(index)}
              onKeyDown={(event) => handleTimelineKeyDown(event, index)}
              className={styles.sceneCard}
              aria-label={formatLabel(copy.timelineScene, {
                number: item.scene_number
              })}
              aria-pressed={index === activeIndex}
              tabIndex={index === activeIndex ? 0 : -1}
            >
              <span className={styles.sceneNumber}>{item.scene_number}</span>
              <span className={styles.sceneText}>
                <span className="truncate font-medium">
                  {formatLabel(copy.timelineScene, {
                    number: item.scene_number
                  })}
                </span>
                <span className={styles.sceneTime}>
                  {formatTime(sceneStarts[index] ?? 0)} –{' '}
                  {formatTime((sceneStarts[index] ?? 0) + sceneDuration(item))}
                </span>
              </span>
              {index === activeIndex ? (
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
          ))}
        </div>

        <dl className={styles.metrics}>
          <CoachMetric
            icon={Camera}
            label={copy.cameraPosition}
            value={formatLabel(copy.cameraReadout, {
              distance: formatMeasure(current.cameraDistance),
              height: formatMeasure(current.cameraHeight)
            })}
          />
          <CoachMetric
            icon={Aperture}
            label={copy.focalLength}
            value={lensReadout}
          />
          <CoachMetric
            icon={MoveUpRight}
            label={copy.movement}
            value={scene.camera_movement.replace(/_/g, ' ')}
          />
          <CoachMetric
            icon={Sun}
            label={copy.lighting}
            value={current.lighting.replace(/_/g, ' ')}
          />
          <CoachMetric
            icon={UserRound}
            label={copy.performance}
            value={
              (scene.voice_emotion ?? 'confident') +
              ' · ' +
              formatMeasure(scene.voice_pace ?? 1) +
              '×'
            }
          />
          <CoachMetric
            icon={FileText}
            label={copy.creatorAction}
            value={scene.subject_action ?? scene.visual_description}
          />
          <CoachMetric
            icon={MessageCircle}
            label={copy.dialogue}
            value={cleanDialogue(scene.dialogue) || copy.noDialogue}
          />
        </dl>
      </div>
    </Card>
  )
}

function EmptyShootingCoach({ labels }: { labels: ShootingCoachLabels }) {
  return (
    <Card
      as="section"
      aria-label={labels.title}
      data-shooting-coach
      className="gap-3 p-5 shadow-none"
    >
      <div className="flex items-center gap-2 font-medium">
        <Video className="size-[18px]" aria-hidden="true" />
        <h3>{labels.title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{labels.emptyTitle}</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {labels.emptyDescription}
      </p>
    </Card>
  )
}

function CoachMetric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Camera
  label: string
  value: string
}) {
  return (
    <div className={styles.metric}>
      <dt>
        <Icon className="size-5 shrink-0 text-foreground" aria-hidden="true" />
        <span>{label}</span>
      </dt>
      <dd>{value}</dd>
    </div>
  )
}

function sceneDuration(scene: CoachScene) {
  return Number.isFinite(scene.duration_seconds) && scene.duration_seconds > 0
    ? scene.duration_seconds
    : 1
}

function formatMeasure(value: number) {
  return Number(value.toFixed(2)).toString()
}

function formatTime(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0
  const minutes = Math.floor(safeValue / 60)
  const seconds = Math.floor(safeValue % 60)
  return (
    String(minutes).padStart(2, '0') + ':' + seconds.toString().padStart(2, '0')
  )
}

function formatLabel(
  template: string,
  values: Record<string, string | number>
) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split('{' + key + '}').join(String(value)),
    template
  )
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}
