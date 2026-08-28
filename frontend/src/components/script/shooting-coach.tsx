'use client'

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
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'

export type CoachScene = {
  scene_number: number
  duration_seconds: number
  visual_description: string
  camera_angle: string
  camera_movement: string
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

type ViewMode = 'director' | 'camera' | 'top'

const FALLBACK_SCENE: CoachScene = {
  scene_number: 1,
  duration_seconds: 5,
  visual_description: 'Creator facing the camera',
  camera_angle: 'eye-level',
  camera_movement: 'static',
  dialogue: '',
  text_overlay: '',
  music_mood: 'calm ambient',
  transition: 'cut'
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

export function ShootingCoach({ scenes }: { scenes: CoachScene[] }) {
  const reduceMotion = useReducedMotion()
  const [activeIndex, setActiveIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [view, setView] = useState<ViewMode>('director')
  const [sound, setSound] = useState(true)
  const spokenScene = useRef(-1)
  const audioContext = useRef<AudioContext | null>(null)
  const ambience = useRef<{ oscillator: OscillatorNode; gain: GainNode } | null>(null)
  const scene = scenes[activeIndex] ?? scenes[0] ?? FALLBACK_SCENE

  const totalDuration = useMemo(
    () => scenes.reduce((sum, item) => sum + item.duration_seconds, 0),
    [scenes]
  )
  const sceneStarts = useMemo(() => {
    let cursor = 0
    return scenes.map((item) => {
      const start = cursor
      cursor += item.duration_seconds
      return start
    })
  }, [scenes])

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      const delta = (now - last) / 1000
      last = now
      setElapsed((current) => {
        const next = current + delta
        if (next >= totalDuration) {
          setPlaying(false)
          return totalDuration
        }
        const nextScene = scenes.findIndex(
          (item, index) => next < (sceneStarts[index] ?? 0) + item.duration_seconds
        )
        if (nextScene >= 0) setActiveIndex(nextScene)
        return next
      })
    }, 50)
    return () => window.clearInterval(timer)
  }, [playing, sceneStarts, scenes, totalDuration])

  useEffect(() => {
    if (!playing || !sound || spokenScene.current === activeIndex) return
    spokenScene.current = activeIndex
    const line = cleanDialogue(scene.dialogue)
    if (line && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(line)
      utterance.rate = scene.voice_pace ?? 1
      utterance.pitch = emotionPitch[scene.voice_emotion ?? 'confident'] ?? 1
      utterance.volume = 0.92
      const romanianVoice = window.speechSynthesis
        .getVoices()
        .find((voice) => voice.lang.toLowerCase().startsWith('ro'))
      if (romanianVoice) utterance.voice = romanianVoice
      window.speechSynthesis.speak(utterance)
    }
    startAmbience(scene.music_mood)
  }, [activeIndex, playing, scene, sound])

  useEffect(() => {
    if (!playing || !sound) stopAmbience()
    return () => {
      if (!playing) window.speechSynthesis?.cancel()
    }
  }, [playing, sound])

  function startAmbience(mood: string) {
    stopAmbience()
    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) return
    const context = audioContext.current ?? new AudioContextClass()
    audioContext.current = context
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const lowerMood = mood.toLowerCase()
    oscillator.type = lowerMood.includes('dramatic') ? 'sawtooth' : 'sine'
    oscillator.frequency.value = lowerMood.includes('upbeat') ? 164 : lowerMood.includes('calm') ? 98 : 123
    gain.gain.value = 0.018
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    ambience.current = { oscillator, gain }
  }

  function stopAmbience() {
    if (!ambience.current) return
    ambience.current.gain.gain.exponentialRampToValueAtTime(
      0.0001,
      (audioContext.current?.currentTime ?? 0) + 0.15
    )
    ambience.current.oscillator.stop((audioContext.current?.currentTime ?? 0) + 0.2)
    ambience.current = null
  }

  function seekScene(index: number) {
    setActiveIndex(index)
    setElapsed(sceneStarts[index] ?? 0)
    spokenScene.current = -1
  }

  function restart() {
    setElapsed(0)
    setActiveIndex(0)
    spokenScene.current = -1
    setPlaying(true)
  }

  const cameraTransform = cameraMotion(scene, playing && !reduceMotion)
  const stageTransform =
    view === 'top'
      ? 'rotateX(65deg) rotateZ(-2deg) scale(.84)'
      : view === 'camera'
        ? `translateZ(${Math.min(110, (scene.camera_distance ?? 1.8) * 42)}px) scale(1.28)`
        : 'rotateX(4deg) rotateY(-7deg)'

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#10120f] text-white shadow-[0_28px_80px_rgba(0,0,0,.2)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.22em] text-[#8cd7aa]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#8cd7aa]" />
            3D Shooting Coach
          </div>
          <p className="mt-1 text-xs text-white/45">Previzualizare regizorală · scena {scene.scene_number}/{scenes.length}</p>
        </div>
        <div className="flex items-center rounded-lg border border-white/10 bg-white/[.04] p-1">
          {([
            ['director', Rotate3D, 'Studio'],
            ['camera', Camera, 'Cameră'],
            ['top', Eye, 'Plan']
          ] as const).map(([mode, Icon, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={`relative flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold transition-colors ${view === mode ? 'text-[#10120f]' : 'text-white/50 hover:text-white'}`}
            >
              {view === mode && <motion.span layoutId="coach-view" className="absolute inset-0 rounded-md bg-white" />}
              <Icon className="relative h-3 w-3" />
              <span className="relative hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="relative min-h-[430px] overflow-hidden bg-[radial-gradient(circle_at_50%_35%,#29322b_0%,#151814_46%,#0c0e0c_100%)] [perspective:900px]">
          <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:42px_42px] [mask-image:linear-gradient(to_bottom,transparent,black_40%)]" />
          <motion.div
            className="absolute inset-0 [transform-style:preserve-3d]"
            animate={{ transform: stageTransform }}
            transition={{ type: 'spring', stiffness: 95, damping: 19 }}
          >
            <div className="absolute bottom-[-80px] left-1/2 h-[310px] w-[580px] -translate-x-1/2 rounded-[50%] border border-white/10 bg-white/[.025] [transform:rotateX(72deg)]" />

            <motion.div
              key={`subject-${scene.scene_number}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: playing && !reduceMotion ? [0, -3, 0] : 0 }}
              transition={{ opacity: { duration: .35 }, y: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }}
              className="absolute bottom-[76px] left-1/2 h-48 w-24 -translate-x-1/2 [transform-style:preserve-3d]"
            >
              <div className="absolute left-1/2 top-0 h-12 w-12 -translate-x-1/2 rounded-full border border-white/25 bg-[#d7bea9] shadow-[0_0_35px_rgba(255,255,255,.12)]" />
              <div className="absolute left-1/2 top-11 h-24 w-20 -translate-x-1/2 rounded-[28px_28px_14px_14px] border border-white/15 bg-[#d5d8cf]" />
              <motion.div
                className="absolute left-[-3px] top-14 h-20 w-4 origin-top rounded-full bg-[#d5d8cf]"
                animate={{ rotate: playing ? [-8, -28, -8] : -8 }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute right-[-3px] top-14 h-20 w-4 origin-top rounded-full bg-[#d5d8cf]"
                animate={{ rotate: playing ? [8, 31, 8] : 8 }}
                transition={{ duration: 2.1, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className="absolute bottom-0 left-6 h-16 w-4 rounded-full bg-[#5c6159]" />
              <div className="absolute bottom-0 right-6 h-16 w-4 rounded-full bg-[#5c6159]" />
            </motion.div>

            <motion.div
              className="absolute bottom-24 left-[16%] [transform-style:preserve-3d]"
              animate={{ transform: cameraTransform }}
              transition={{ duration: Math.max(1.4, scene.duration_seconds), ease: 'easeInOut', repeat: playing ? Infinity : 0, repeatType: 'mirror' }}
            >
              <div className="relative h-24 w-12 rounded-xl border border-white/30 bg-[#272a25] shadow-2xl">
                <div className="absolute left-2 top-2 h-3 w-3 rounded-full border border-white/20 bg-black" />
                <div className="absolute right-2 top-2 h-3 w-3 rounded-full border border-white/20 bg-black" />
                <div className="absolute -right-[170px] top-8 h-12 w-[175px] origin-left bg-gradient-to-r from-[#8cd7aa]/20 to-transparent [clip-path:polygon(0_42%,100%_0,100%_100%,0_58%)]" />
              </div>
              <div className="mx-auto h-24 w-1 bg-white/25" />
              <div className="mx-auto h-1 w-16 bg-white/25" />
            </motion.div>

            <div className={`absolute left-[58%] top-12 h-28 w-28 rounded-full blur-3xl ${scene.lighting?.includes('back') ? 'bg-orange-300/35' : 'bg-white/25'}`} />
          </motion.div>

          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-[10px] text-white/60 backdrop-blur-md">
            <Maximize2 className="h-3 w-3 text-[#8cd7aa]" />
            {scene.shot_type?.replace(/_/g, ' ') ?? scene.camera_angle} · {scene.lens_mm ?? 35}mm
          </div>

          <AnimatePresence mode="wait">
            {scene.text_overlay && (
              <motion.div
                key={`${scene.scene_number}-${scene.text_overlay}`}
                initial={{ opacity: 0, y: 20, scale: .96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ delay: .25, duration: .55, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-x-8 bottom-8 text-center"
              >
                <span className="inline-block max-w-md bg-white px-3 py-1.5 font-serif text-xl font-semibold leading-tight text-black shadow-[5px_5px_0_#8cd7aa]">
                  {scene.text_overlay}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <aside className="space-y-5 border-l border-white/10 bg-white/[.025] p-4">
          <CoachMetric icon={Camera} label="Poziție cameră" value={`${scene.camera_distance ?? 1.8}m · ${scene.camera_height ?? 1.55}m înălțime`} />
          <CoachMetric icon={Rotate3D} label="Mișcare" value={scene.camera_movement} />
          <CoachMetric icon={Lightbulb} label="Lumină" value={(scene.lighting ?? 'soft key left').replace(/_/g, ' ')} />
          <CoachMetric icon={Volume2} label="Interpretare" value={`${scene.voice_emotion ?? 'confident'} · ${scene.voice_pace ?? 1}×`} />
          <div className="border-t border-white/10 pt-4">
            <p className="text-[9px] font-bold uppercase tracking-[.2em] text-white/35">Acțiunea creatorului</p>
            <p className="mt-2 text-xs leading-relaxed text-white/75">{scene.subject_action ?? scene.visual_description}</p>
          </div>
          <div className="rounded-lg border border-[#8cd7aa]/20 bg-[#8cd7aa]/[.06] p-3">
            <p className="text-[9px] font-bold uppercase tracking-[.18em] text-[#8cd7aa]">Replica</p>
            <p className="mt-1.5 text-xs leading-relaxed text-white/80">{cleanDialogue(scene.dialogue) || 'Scenă fără dialog'}</p>
          </div>
        </aside>
      </div>

      <footer className="border-t border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={restart} className="p-2 text-white/50 transition-colors hover:text-white" aria-label="Restart">
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (elapsed >= totalDuration) restart()
              else setPlaying((value) => !value)
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
          </button>
          <button type="button" onClick={() => setSound((value) => !value)} className="p-2 text-white/50 transition-colors hover:text-white" aria-label="Toggle sound">
            {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex justify-between text-[9px] tabular-nums text-white/35">
              <span>{formatTime(elapsed)}</span><span>{formatTime(totalDuration)}</span>
            </div>
            <div className="relative flex h-8 gap-1">
              {scenes.map((item, index) => (
                <button
                  key={item.scene_number}
                  type="button"
                  onClick={() => seekScene(index)}
                  style={{ flexGrow: item.duration_seconds }}
                  className={`group relative overflow-hidden rounded-sm border transition-colors ${index === activeIndex ? 'border-[#8cd7aa]/60 bg-[#8cd7aa]/15' : 'border-white/10 bg-white/[.04] hover:bg-white/[.08]'}`}
                  aria-label={`Scena ${item.scene_number}`}
                >
                  <span className="absolute left-1.5 top-1 text-[8px] font-bold text-white/55">{item.scene_number}</span>
                  {index === activeIndex && (
                    <motion.span
                      className="absolute bottom-0 left-0 h-0.5 bg-[#8cd7aa]"
                      style={{ width: `${Math.min(100, Math.max(0, ((elapsed - (sceneStarts[index] ?? 0)) / item.duration_seconds) * 100))}%` }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="hidden items-center gap-1.5 text-[9px] text-white/35 sm:flex"><Music2 className="h-3 w-3" />{scene.music_mood}</div>
        </div>
      </footer>
    </section>
  )
}

function CoachMetric({ icon: Icon, label, value }: { icon: typeof Camera; label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[.04] text-[#8cd7aa]"><Icon className="h-3.5 w-3.5" /></div>
      <div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-white/30">{label}</p><p className="mt-1 text-[11px] capitalize leading-relaxed text-white/70">{value}</p></div>
    </div>
  )
}

function cameraMotion(scene: CoachScene, animate: boolean) {
  const yaw = scene.camera_yaw ?? 0
  const pitch = scene.camera_pitch ?? 0
  const distance = scene.camera_distance ?? 1.8
  const base = `translateX(${Math.max(-30, Math.min(80, (2.2 - distance) * 38))}px) translateY(${Math.max(-45, Math.min(35, (1.55 - (scene.camera_height ?? 1.55)) * 80))}px) rotateY(${yaw}deg) rotateX(${pitch}deg)`
  if (!animate) return base
  const movement = scene.camera_movement.toLowerCase()
  if (movement.includes('pan')) return [`${base} translateX(-34px)`, `${base} translateX(38px)`]
  if (movement.includes('tilt')) return [`${base} translateY(22px)`, `${base} translateY(-34px)`]
  if (movement.includes('zoom') || movement.includes('dolly')) return [`${base} scale(.88)`, `${base} scale(1.18)`]
  if (movement.includes('handheld')) return [`${base} rotateZ(-1deg)`, `${base} translate(4px,-3px) rotateZ(1.5deg)`]
  if (movement.includes('track')) return [`${base} translateX(-30px)`, `${base} translateX(28px)`]
  return base
}

function formatTime(value: number) {
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
