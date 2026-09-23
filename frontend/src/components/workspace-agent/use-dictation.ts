import { useEffect, useRef, useState } from 'react'

interface Recognition {
  lang: string; interimResults: boolean; continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null; onend: (() => void) | null
  start(): void; stop(): void; abort(): void
}
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
export function useDictation(locale: string, append: (text: string) => void) {
  const recognition = useRef<Recognition | null>(null)
  const [listening, setListening] = useState(false)
  const [failed, setFailed] = useState(false)
  const speechWindow = typeof window === 'undefined' ? undefined : window as SpeechWindow
  const Constructor = speechWindow?.SpeechRecognition ?? speechWindow?.webkitSpeechRecognition
  useEffect(() => () => { recognition.current?.abort() }, [])
  function toggle() {
    if (listening) { recognition.current?.stop(); return }
    if (!Constructor) return
    const instance = new Constructor()
    instance.lang = locale === 'ro' ? 'ro-RO' : 'en-US'
    instance.interimResults = false; instance.continuous = false
    instance.onresult = event => append(Array.from(event.results).map(result => result[0].transcript).join(' '))
    instance.onerror = () => { setFailed(true); setListening(false) }
    instance.onend = () => setListening(false)
    recognition.current = instance; setFailed(false)
    try { instance.start(); setListening(true) } catch { setFailed(true) }
  }
  function cancel() { recognition.current?.abort(); setListening(false) }
  return { supported: Boolean(Constructor), listening, failed, toggle, cancel }
}
