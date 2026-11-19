import { useEffect, useState, type RefObject } from 'react'
import { loadCaptionFont, retainCaptionFont } from './caption-fonts'

type Size = { w: number; h: number }

/** Loads (and keeps) the caption font; `font` is the browser family once it is ready. */
export function useCaptionFont(fontId: string, weight: number) {
  const key = `${fontId}:${weight}`
  const [state, setState] = useState({ key: '', family: '', error: false })
  useEffect(() => {
    let active = true
    const release = retainCaptionFont(fontId, weight)
    void loadCaptionFont(fontId, weight)
      .then((family) => {
        if (active) setState({ key, family, error: false })
      })
      .catch(() => {
        if (active) setState({ key, family: '', error: true })
      })
    return () => {
      active = false
      release()
    }
  }, [fontId, weight, key])
  return { font: state.key === key ? state.family : '', fontError: state.key === key && state.error }
}

/** The preview frame's inner size, kept current while it resizes. */
export function useFrameSize(frame: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<Size>({ w: 240, h: 427 })
  useEffect(() => {
    const node = frame.current
    if (!node) return
    const observer = new ResizeObserver(() => setSize({ w: node.clientWidth, h: node.clientHeight }))
    observer.observe(node)
    return () => observer.disconnect()
  }, [frame])
  return size
}

/** The caption block's rendered size; `mounted` changes when the block (re)appears. */
export function useCaptionBox(caption: RefObject<HTMLElement | null>, mounted: string) {
  const [box, setBox] = useState<Size>({ w: 0, h: 0 })
  useEffect(() => {
    const node = caption.current
    if (!node) return
    const observer = new ResizeObserver(() => setBox({ w: node.offsetWidth, h: node.offsetHeight }))
    observer.observe(node)
    return () => observer.disconnect()
  }, [caption, mounted])
  return box
}

/** A 50 ms demo clock for the sample phrase when no media time drives it. */
export function useDemoTick(playbackTime: number | undefined, playing: boolean) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (playbackTime !== undefined || !playing) return
    const timer = setInterval(() => setTick((value) => (value + 1) % 1000), 50)
    return () => clearInterval(timer)
  }, [playbackTime, playing])
  return tick
}
