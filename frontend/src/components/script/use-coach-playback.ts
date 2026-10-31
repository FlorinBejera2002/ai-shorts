'use client'

import type { CameraViewMode } from '@/lib/camera-visualization'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CoachScene } from './shooting-coach'
import { clamp, cleanDialogue, sceneDuration } from './shooting-coach-utils'

const emotionPitch: Record<string, number> = {
  excited: 1.14,
  playful: 1.1,
  warm: 1.02,
  calm: 0.92,
  urgent: 1.08,
  authoritative: 0.88,
  confident: 0.98
}

/** Coach timeline, view mode, speech preview and ambience. */
export function useCoachPlayback(
  scenes: CoachScene[],
  active: boolean,
  speechLanguage: string
) {
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

  return {
    scene,
    activeIndex,
    elapsed,
    playing,
    sound,
    view,
    setView,
    sceneStarts,
    totalDuration,
    seekScene,
    restart,
    togglePlayback,
    toggleSound
  }
}
