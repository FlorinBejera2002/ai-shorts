'use client'

import {
  type CameraMovementDirection,
  type CameraMovementType,
  type CameraViewMode,
  type CameraVisualization,
  buildCameraVisualization,
  projectCameraSceneAtElapsed
} from '@/lib/camera-visualization'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Camera,
  Eye,
  Lightbulb,
  Maximize2,
  Music2,
  Pause,
  Play,
  Rotate3D,
  SkipBack,
  Volume2,
  VolumeX
} from 'lucide-react'
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react'

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

export const DEFAULT_SHOOTING_COACH_LABELS: ShootingCoachLabels = {
  title: '3D Shooting Coach',
  preview: 'Director preview · scene {current}/{total}',
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
  speechLanguage = 'en'
}: ShootingCoachProps) {
  const copy = useMemo(
    () => ({ ...DEFAULT_SHOOTING_COACH_LABELS, ...labels }),
    [labels]
  )
  const reduceMotion = useReducedMotion() ?? false
  const [activeIndex, setActiveIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [view, setView] = useState<CameraViewMode>('director')
  const [sound, setSound] = useState(true)
  const [audioEpoch, setAudioEpoch] = useState(0)
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
    let cursor = 0
    return scenes.map((item) => {
      const start = cursor
      cursor += sceneDuration(item)
      return start
    })
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
    return <EmptyShootingCoach labels={copy} reduceMotion={reduceMotion} />
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

  return (
    <section
      aria-label={copy.title}
      className="overflow-hidden rounded-2xl border border-blue-200/15 bg-[#08111f] text-white shadow-[0_28px_80px_rgba(2,8,23,.28)]"
    >
      <CoachHeader
        activeIndex={activeIndex}
        labels={copy}
        reduceMotion={reduceMotion}
        sceneCount={scenes.length}
        view={view}
        onViewChange={setView}
      />

      <div className="grid lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="relative min-h-[340px] overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#20385f_0%,#101d31_46%,#070d18_100%)] sm:min-h-[430px]">
          <ProjectionStage
            labels={copy}
            reduceMotion={reduceMotion}
            scene={scene}
            visualization={visualization}
          />

          <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%_-_1.5rem)] flex-wrap items-center gap-2 sm:left-4 sm:top-4">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-[10px] text-white/65 backdrop-blur-md">
              <Maximize2 className="h-3 w-3 text-[#8eb7ff]" />
              <span className="truncate capitalize">
                {(scene.shot_type ?? scene.camera_angle).replace(/_/g, ' ')}
              </span>
            </div>
            <div className="rounded-lg border border-[#6ea8ff]/20 bg-[#07101d]/75 px-2.5 py-1.5 text-[10px] tabular-nums text-[#a9c9ff] backdrop-blur-md">
              {formatLabel(copy.fovReadout, {
                lens: formatMeasure(visualization.effectiveLensMm),
                fov: Math.round(visualization.horizontalFov)
              })}
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-white/[.08] bg-black/30 px-2 py-1 font-mono text-[8px] uppercase tracking-[.14em] text-white/40 backdrop-blur-sm sm:bottom-4 sm:left-4 sm:text-[9px]">
            X {formatCoordinate(visualization.camera.position.x)} · Y{' '}
            {formatCoordinate(visualization.camera.position.y)} · Z{' '}
            {formatCoordinate(visualization.camera.position.z)} · YAW{' '}
            {formatCoordinate(current.cameraYaw + current.cameraPanOffset)}°
          </div>

          <AnimatePresence mode="wait">
            {scene.text_overlay && (
              <motion.div
                key={String(scene.scene_number) + '-' + scene.text_overlay}
                initial={
                  reduceMotion ? false : { opacity: 0, y: 20, scale: 0.96 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -14 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        delay: 0.2,
                        duration: 0.5,
                        ease: [0.16, 1, 0.3, 1]
                      }
                }
                className="pointer-events-none absolute inset-x-8 bottom-12 text-center sm:bottom-10"
              >
                <span className="inline-block max-w-md bg-white px-3 py-1.5 font-serif text-lg font-semibold leading-tight text-black shadow-[5px_5px_0_#6ea8ff] sm:text-xl">
                  {scene.text_overlay}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="space-y-5 border-t border-white/10 bg-white/[.025] p-4 lg:border-l lg:border-t-0">
          <CoachMetric
            icon={Camera}
            label={copy.cameraPosition}
            value={formatLabel(copy.cameraReadout, {
              distance: formatMeasure(current.cameraDistance),
              height: formatMeasure(current.cameraHeight)
            })}
          />
          <CoachMetric
            icon={Eye}
            label={copy.focalLength}
            value={formatLabel(copy.fovReadout, {
              lens: formatMeasure(visualization.effectiveLensMm),
              fov: Math.round(visualization.horizontalFov)
            })}
          />
          <CoachMetric
            icon={Rotate3D}
            label={copy.movement}
            value={scene.camera_movement}
          />
          <CoachMetric
            icon={Lightbulb}
            label={copy.lighting}
            value={current.lighting.replace(/_/g, ' ')}
          />
          <CoachMetric
            icon={Volume2}
            label={copy.performance}
            value={
              (scene.voice_emotion ?? 'confident') +
              ' · ' +
              formatMeasure(scene.voice_pace ?? 1) +
              '×'
            }
          />
          <div className="border-t border-white/10 pt-4">
            <p className="text-[9px] font-bold uppercase tracking-[.2em] text-white/35">
              {copy.creatorAction}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-white/75">
              {scene.subject_action ?? scene.visual_description}
            </p>
          </div>
          <div className="rounded-lg border border-[#6ea8ff]/25 bg-[#6ea8ff]/[.08] p-3">
            <p className="text-[9px] font-bold uppercase tracking-[.18em] text-[#8eb7ff]">
              {copy.dialogue}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-white/80">
              {cleanDialogue(scene.dialogue) || copy.noDialogue}
            </p>
          </div>
        </aside>
      </div>

      <footer className="border-t border-white/10 bg-black/20 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
          <button
            type="button"
            onClick={restart}
            className="rounded-md p-2 text-white/50 transition-colors hover:bg-white/[.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8eb7ff]"
            aria-label={copy.restart}
            title={copy.restart}
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={togglePlayback}
            className={cx(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8eb7ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#08111f]',
              !reduceMotion && 'transition-transform hover:scale-105'
            )}
            aria-label={playing ? copy.pause : copy.play}
            title={playing ? copy.pause : copy.play}
          >
            {playing ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
          </button>
          <button
            type="button"
            onClick={toggleSound}
            className="rounded-md p-2 text-white/50 transition-colors hover:bg-white/[.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8eb7ff]"
            aria-label={sound ? copy.mute : copy.unmute}
            title={sound ? copy.mute : copy.unmute}
          >
            {sound ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </button>
          <div className="order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto">
            <div className="mb-2 flex justify-between text-[9px] tabular-nums text-white/35">
              <span>{formatTime(elapsed)}</span>
              <span>{formatTime(totalDuration)}</span>
            </div>
            <div
              className="relative flex h-9 gap-1"
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
                  onClick={() => seekScene(index)}
                  onKeyDown={(event) => handleTimelineKeyDown(event, index)}
                  style={{ flexGrow: sceneDuration(item) }}
                  className={cx(
                    'group relative min-w-5 overflow-hidden rounded-sm border transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8eb7ff]',
                    index === activeIndex
                      ? 'border-[#6ea8ff]/70 bg-[#6ea8ff]/20'
                      : 'border-white/10 bg-white/[.04] hover:bg-white/[.08]'
                  )}
                  aria-label={formatLabel(copy.timelineScene, {
                    number: item.scene_number
                  })}
                  aria-pressed={index === activeIndex}
                  tabIndex={index === activeIndex ? 0 : -1}
                >
                  <span className="absolute left-1.5 top-1 text-[8px] font-bold text-white/55">
                    {item.scene_number}
                  </span>
                  {index === activeIndex && (
                    <span
                      className="absolute bottom-0 left-0 h-0.5 bg-[#6ea8ff]"
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
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="ml-auto hidden max-w-28 items-center gap-1.5 truncate text-[9px] text-white/35 md:flex">
            <Music2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{scene.music_mood}</span>
          </div>
        </div>
      </footer>
    </section>
  )
}

function CoachHeader({
  activeIndex,
  labels,
  reduceMotion,
  sceneCount,
  view,
  onViewChange
}: {
  activeIndex: number
  labels: ShootingCoachLabels
  reduceMotion: boolean
  sceneCount: number
  view: CameraViewMode
  onViewChange: (view: CameraViewMode) => void
}) {
  const views = [
    ['director', Rotate3D, labels.viewDirector],
    ['camera', Camera, labels.viewCamera],
    ['top', Eye, labels.viewTop]
  ] as const

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.22em] text-[#8eb7ff]">
          <span
            className={cx(
              'h-1.5 w-1.5 rounded-full bg-[#6ea8ff]',
              !reduceMotion && 'animate-pulse'
            )}
          />
          {labels.title}
        </div>
        <p className="mt-1 text-xs text-white/45">
          {formatLabel(labels.preview, {
            current: activeIndex + 1,
            total: sceneCount
          })}
        </p>
      </div>
      <div
        className="flex max-w-full items-center rounded-lg border border-white/10 bg-white/[.04] p-1"
        role="group"
        aria-label={labels.viewControls}
      >
        {views.map(([mode, Icon, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onViewChange(mode)}
            className={cx(
              'relative flex min-h-8 items-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8eb7ff] sm:px-2.5',
              view === mode
                ? 'text-[#08111f]'
                : 'text-white/55 hover:text-white'
            )}
            aria-label={label}
            aria-pressed={view === mode}
            title={label}
          >
            {view === mode && (
              <motion.span
                layoutId="coach-view"
                className="absolute inset-0 rounded-md bg-white"
                transition={reduceMotion ? { duration: 0 } : undefined}
              />
            )}
            <Icon className="relative h-3 w-3 shrink-0" />
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>
    </header>
  )
}

function EmptyShootingCoach({
  labels,
  reduceMotion
}: {
  labels: ShootingCoachLabels
  reduceMotion: boolean
}) {
  return (
    <section
      aria-label={labels.title}
      className="overflow-hidden rounded-2xl border border-blue-200/15 bg-[#08111f] text-white shadow-[0_28px_80px_rgba(2,8,23,.28)]"
    >
      <header className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.22em] text-[#8eb7ff]">
          <span
            className={cx(
              'h-1.5 w-1.5 rounded-full bg-[#6ea8ff]',
              !reduceMotion && 'animate-pulse'
            )}
          />
          {labels.title}
        </div>
      </header>
      <div className="flex min-h-72 flex-col items-center justify-center bg-[radial-gradient(circle_at_50%_35%,#20385f_0%,#101d31_46%,#070d18_100%)] px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#6ea8ff]/20 bg-[#6ea8ff]/10 text-[#8eb7ff]">
          <Rotate3D className="h-7 w-7" />
        </div>
        <h3 className="mt-5 text-sm font-semibold">{labels.emptyTitle}</h3>
        <p className="mt-2 max-w-md text-xs leading-relaxed text-white/50">
          {labels.emptyDescription}
        </p>
      </div>
    </section>
  )
}

function ProjectionStage({
  labels,
  reduceMotion,
  scene,
  visualization
}: {
  labels: ShootingCoachLabels
  reduceMotion: boolean
  scene: CoachScene
  visualization: CameraVisualization
}) {
  const rawId = useId().replace(/:/g, '')
  const backdropGradient = 'coach-backdrop-' + rawId
  const subjectGradient = 'coach-subject-' + rawId
  const cameraGradient = 'coach-camera-' + rawId
  const topView = visualization.view === 'top'
  const cameraView = visualization.view === 'camera'

  return (
    <motion.div
      key={visualization.view + '-' + String(scene.scene_number)}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.99 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.28 }}
      className="absolute inset-0"
    >
      <svg
        viewBox={
          '0 0 ' +
          String(visualization.width) +
          ' ' +
          String(visualization.height)
        }
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label={labels.visualizationLabel}
      >
        <defs>
          <linearGradient id={backdropGradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6ea8ff" stopOpacity="0.12" />
            <stop offset="1" stopColor="#6ea8ff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={subjectGradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f6f8fc" />
            <stop offset="1" stopColor="#9eb6d8" />
          </linearGradient>
          <linearGradient id={cameraGradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2e4568" />
            <stop offset="1" stopColor="#101b2d" />
          </linearGradient>
          <radialGradient id={'coach-light-' + rawId}>
            <stop offset="0" stopColor="#ffe5a3" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffe5a3" stopOpacity="0" />
          </radialGradient>
          <filter
            id={'coach-glow-' + rawId}
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
          >
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect
          width={visualization.width}
          height={visualization.height}
          fill={'url(#' + backdropGradient + ')'}
        />

        <g
          fill="none"
          stroke="#91b9f8"
          strokeOpacity={topView ? 0.16 : 0.1}
          strokeWidth="0.75"
        >
          <SvgSegments segments={visualization.floorLines} />
        </g>
        <g fill="none" stroke="#d7e6ff" strokeOpacity="0.2" strokeWidth="1.1">
          <SvgSegments segments={visualization.studioLines} />
        </g>
        <g fill="none" stroke="#6ea8ff" strokeOpacity="0.62" strokeWidth="1.25">
          <SvgSegments segments={visualization.stageLines} />
        </g>

        {visualization.light.beam && !cameraView && (
          <line
            x1={visualization.light.beam.from.x}
            y1={visualization.light.beam.from.y}
            x2={visualization.light.beam.to.x}
            y2={visualization.light.beam.to.y}
            stroke="#ffe5a3"
            strokeOpacity="0.24"
            strokeWidth="1"
            strokeDasharray="5 7"
          />
        )}
        {visualization.light.position.visible && !cameraView && (
          <>
            <circle
              cx={visualization.light.position.x}
              cy={visualization.light.position.y}
              r="24"
              fill={'url(#coach-light-' + rawId + ')'}
            />
            <circle
              cx={visualization.light.position.x}
              cy={visualization.light.position.y}
              r="4"
              fill="#ffe5a3"
              filter={'url(#coach-glow-' + rawId + ')'}
            />
          </>
        )}

        {!cameraView && (
          <g
            fill="none"
            stroke="#6ea8ff"
            strokeOpacity="0.54"
            strokeWidth="1.2"
            strokeDasharray="6 5"
          >
            <SvgSegments segments={visualization.frustumLines} />
          </g>
        )}
        {visualization.focusLine && (
          <line
            x1={visualization.focusLine.from.x}
            y1={visualization.focusLine.from.y}
            x2={visualization.focusLine.to.x}
            y2={visualization.focusLine.to.y}
            stroke="#f6c96b"
            strokeOpacity="0.72"
            strokeWidth="1.2"
            strokeDasharray="2 5"
          />
        )}

        {!cameraView && visualization.cameraRig.body && (
          <polygon
            points={polygonPoints(visualization.cameraRig.body)}
            fill={'url(#' + cameraGradient + ')'}
            stroke="#bcd5ff"
            strokeOpacity="0.78"
            strokeWidth="1.2"
          />
        )}
        {!cameraView && (
          <g
            fill="none"
            stroke="#a9bad3"
            strokeOpacity="0.68"
            strokeWidth="1.5"
          >
            <SvgSegments segments={visualization.cameraRig.tripod} />
          </g>
        )}
        {!cameraView && visualization.cameraRig.lens.visible && (
          <circle
            cx={visualization.cameraRig.lens.x}
            cy={visualization.cameraRig.lens.y}
            r={topView ? 4.5 : 3.5}
            fill="#08111f"
            stroke="#8eb7ff"
            strokeWidth="1.5"
          />
        )}

        {topView ? (
          <>
            <circle
              cx={visualization.subject.ground.x}
              cy={visualization.subject.ground.y}
              r={Math.max(7, visualization.subject.groundRadius)}
              fill="#d7bea9"
              stroke="#ffffff"
              strokeOpacity="0.72"
              strokeWidth="1.4"
            />
            <circle
              cx={visualization.subject.ground.x}
              cy={visualization.subject.ground.y}
              r={Math.max(13, visualization.subject.groundRadius + 7)}
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.18"
              strokeWidth="1"
            />
          </>
        ) : (
          <>
            {visualization.subject.body && (
              <polygon
                points={polygonPoints(visualization.subject.body)}
                fill={'url(#' + subjectGradient + ')'}
                stroke="#ffffff"
                strokeOpacity="0.45"
                strokeWidth="1"
              />
            )}
            <g
              fill="none"
              stroke="#c6d5e8"
              strokeWidth={cameraView ? 5 : 3.5}
              strokeLinecap="round"
            >
              <SvgSegments segments={visualization.subject.limbs} />
            </g>
            {visualization.subject.head.visible && (
              <circle
                cx={visualization.subject.head.x}
                cy={visualization.subject.head.y}
                r={visualization.subject.headRadius}
                fill="#d7bea9"
                stroke="#ffffff"
                strokeOpacity="0.55"
                strokeWidth="1"
              />
            )}
          </>
        )}

        {cameraView && (
          <g fill="none" pointerEvents="none">
            <rect
              x={visualization.width * 0.08}
              y={visualization.height * 0.08}
              width={visualization.width * 0.84}
              height={visualization.height * 0.84}
              rx="8"
              stroke="#ffffff"
              strokeOpacity="0.38"
              strokeWidth="1"
            />
            {[1 / 3, 2 / 3].map((ratio) => (
              <g key={ratio}>
                <line
                  x1={visualization.width * ratio}
                  y1={visualization.height * 0.08}
                  x2={visualization.width * ratio}
                  y2={visualization.height * 0.92}
                  stroke="#ffffff"
                  strokeOpacity="0.13"
                />
                <line
                  x1={visualization.width * 0.08}
                  y1={visualization.height * ratio}
                  x2={visualization.width * 0.92}
                  y2={visualization.height * ratio}
                  stroke="#ffffff"
                  strokeOpacity="0.13"
                />
              </g>
            ))}
            <circle
              cx={visualization.width / 2}
              cy={visualization.height / 2}
              r="12"
              stroke="#f6c96b"
              strokeOpacity="0.7"
              strokeWidth="1"
            />
            <line
              x1={visualization.width / 2 - 18}
              y1={visualization.height / 2}
              x2={visualization.width / 2 + 18}
              y2={visualization.height / 2}
              stroke="#f6c96b"
              strokeOpacity="0.7"
            />
            <line
              x1={visualization.width / 2}
              y1={visualization.height / 2 - 18}
              x2={visualization.width / 2}
              y2={visualization.height / 2 + 18}
              stroke="#f6c96b"
              strokeOpacity="0.7"
            />
          </g>
        )}
      </svg>
    </motion.div>
  )
}

function SvgSegments({
  segments
}: {
  segments: CameraVisualization['floorLines']
}) {
  return segments.map((segment, index) => (
    <line
      key={index}
      x1={segment.from.x}
      y1={segment.from.y}
      x2={segment.to.x}
      y2={segment.to.y}
      vectorEffect="non-scaling-stroke"
    />
  ))
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
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[.04] text-[#8eb7ff]">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[.16em] text-white/30">
          {label}
        </p>
        <p className="mt-1 text-[11px] capitalize leading-relaxed text-white/70">
          {value}
        </p>
      </div>
    </div>
  )
}

function polygonPoints(polygon: CameraVisualization['subject']['body']) {
  if (!polygon) return ''
  return polygon.points
    .map((point) => String(point.x) + ',' + String(point.y))
    .join(' ')
}

function sceneDuration(scene: CoachScene) {
  return Number.isFinite(scene.duration_seconds) && scene.duration_seconds > 0
    ? scene.duration_seconds
    : 1
}

function formatMeasure(value: number) {
  return Number(value.toFixed(2)).toString()
}

function formatCoordinate(value: number) {
  return (value >= 0 ? '+' : '') + value.toFixed(2)
}

function formatTime(value: number) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0
  const minutes = Math.floor(safeValue / 60)
  const seconds = Math.floor(safeValue % 60)
  return String(minutes) + ':' + seconds.toString().padStart(2, '0')
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
