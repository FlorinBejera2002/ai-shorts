import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export const NARRATION_MAX_SECONDS = 180
export const NARRATION_MAX_BYTES = 32 * 1024 ** 2

type Phase = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopping'
export type RecordingError =
  | 'unsupported'
  | 'permission'
  | 'device'
  | 'recording'
  | 'empty'
  | 'size'
  | 'duration'
  | 'format'
interface Draft {
  file: File
  url: string
  duration?: number
}
interface Session {
  recorder: MediaRecorder
  stream: MediaStream
  chunks: Blob[]
  bytes: number
  elapsed: number
  started: number
  timer?: ReturnType<typeof setInterval>
  invalid: boolean
}

function release(session: Session) {
  clearInterval(session.timer)
  session.stream.getTracks().forEach((track) => track.stop())
}

/** Microphone access occurs only inside start(), called by an explicit user action. */
export function useNarrationRecorder(containerRef: RefObject<HTMLDivElement | null>) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [seconds, setSeconds] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<RecordingError | null>(null)
  const session = useRef<Session | null>(null)
  const generation = useRef(0)
  const url = useRef('')
  const mounted = useRef(true)

  function clearDraft() {
    if (url.current) URL.revokeObjectURL(url.current)
    url.current = ''
    setDraft(null)
  }

  function cancel() {
    generation.current++
    const current = session.current
    session.current = null
    if (current) {
      current.recorder.ondataavailable = null
      current.recorder.onstop = null
      current.recorder.onerror = null
      if (current.recorder.state !== 'inactive') current.recorder.stop()
      release(current)
    }
    clearDraft()
    setPhase('idle')
    setSeconds(0)
    setError(null)
  }

  const stop = useCallback(() => {
    const current = session.current
    if (!current || current.recorder.state === 'inactive') return
    if (current.recorder.state === 'recording')
      current.elapsed += (performance.now() - current.started) / 1000
    setSeconds(current.elapsed)
    setPhase('stopping')
    current.recorder.stop()
    release(current)
  }, [])

  async function start() {
    cancel()
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('unsupported')
      return
    }
    const request = ++generation.current
    setPhase('requesting')
    let stream: MediaStream | undefined
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current || request !== generation.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/webm'
      ].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000
      })
      const current: Session = {
        recorder,
        stream,
        chunks: [],
        bytes: 0,
        elapsed: 0,
        started: performance.now(),
        invalid: false
      }
      session.current = current
      recorder.ondataavailable = (event) => {
        if (!event.data.size || current.invalid) return
        current.bytes += event.data.size
        if (current.bytes > NARRATION_MAX_BYTES) {
          current.invalid = true
          current.chunks = []
          setError('size')
          stop()
        } else current.chunks.push(event.data)
      }
      recorder.onerror = () => {
        current.invalid = true
        current.chunks = []
        setError('recording')
        if (recorder.state !== 'inactive') stop()
        else {
          release(current)
          session.current = null
          setPhase('idle')
        }
      }
      recorder.onstop = () => {
        release(current)
        if (!mounted.current || session.current !== current) return
        session.current = null
        setPhase('idle')
        if (current.invalid) return
        if (current.elapsed > NARRATION_MAX_SECONDS) {
          current.chunks = []
          setError('duration')
          return
        }
        const blob = new Blob(current.chunks, {
          type: recorder.mimeType || mimeType || 'audio/webm'
        })
        current.chunks = []
        if (!blob.size || current.elapsed < 0.15) {
          setError('empty')
          return
        }
        const extension = blob.type.includes('mp4')
          ? 'm4a'
          : blob.type.includes('ogg')
            ? 'ogg'
            : 'webm'
        const file = new File([blob], `narration.${extension}`, { type: blob.type })
        url.current = URL.createObjectURL(file)
        setDraft({ file, url: url.current, duration: current.elapsed })
      }
      recorder.start(250)
      current.timer = setInterval(() => {
        if (recorder.state !== 'recording') return
        const elapsed = current.elapsed + (performance.now() - current.started) / 1000
        setSeconds(elapsed)
        // Leave a small margin for the recorder's final encoded audio packet.
        if (elapsed >= NARRATION_MAX_SECONDS - 0.5) stop()
      }, 100)
      setPhase('recording')
    } catch (cause) {
      stream?.getTracks().forEach((track) => track.stop())
      if (!mounted.current || request !== generation.current) return
      session.current = null
      setPhase('idle')
      const name = cause instanceof DOMException ? cause.name : ''
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'permission'
          : name === 'NotFoundError' || name === 'NotReadableError'
            ? 'device'
            : 'recording'
      )
    }
  }

  function pause() {
    const current = session.current
    if (!current) return
    if (current.recorder.state === 'recording') {
      current.elapsed += (performance.now() - current.started) / 1000
      current.recorder.pause()
      setPhase('paused')
    } else if (current.recorder.state === 'paused') {
      current.started = performance.now()
      current.recorder.resume()
      setPhase('recording')
    }
  }

  function choose(file: File) {
    cancel()
    if (!/\.(m4a|mp3|wav|webm|ogg)$/i.test(file.name)) return setError('format')
    if (!file.size) return setError('empty')
    if (file.size > NARRATION_MAX_BYTES) return setError('size')
    url.current = URL.createObjectURL(file)
    setDraft({ file, url: url.current })
  }

  function inspectDuration(duration: number) {
    if (Number.isFinite(duration) && duration > NARRATION_MAX_SECONDS) {
      clearDraft()
      setError('duration')
    }
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // Create modes stay mounted to preserve their state. Hidden recording must stop.
    const observer = new MutationObserver(() => {
      if (!container.closest('[hidden]')) return
      if (session.current) stop()
      else {
        generation.current++
        setPhase('idle')
      }
    })
    let ancestor: HTMLElement | null = container
    while (ancestor) {
      observer.observe(ancestor, { attributes: true, attributeFilter: ['hidden'] })
      ancestor = ancestor.parentElement
    }
    return () => observer.disconnect()
  }, [stop, containerRef])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // A StrictMode/Fast Refresh reconnect must not interrupt an active recording.
      queueMicrotask(() => {
        if (mounted.current) return
        const current = session.current
        session.current = null
        if (current) {
          current.recorder.ondataavailable = null
          current.recorder.onstop = null
          current.recorder.onerror = null
          if (current.recorder.state !== 'inactive') current.recorder.stop()
          release(current)
        }
        if (url.current) URL.revokeObjectURL(url.current)
      })
    }
  }, [])

  return {
    phase,
    seconds,
    draft,
    error,
    start,
    stop,
    pause,
    cancel,
    choose,
    inspectDuration
  }
}
