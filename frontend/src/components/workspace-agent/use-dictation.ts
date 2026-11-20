import { useEffect, useRef, useState } from 'react'
import { toast } from '@/lib/toast'
import { agentMessages } from './messages'

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
  const speechWindow = typeof window === 'undefined' ? undefined : window as SpeechWindow
  const Constructor = speechWindow?.SpeechRecognition ?? speechWindow?.webkitSpeechRecognition
  const messages = agentMessages[locale === 'ro' ? 'ro' : 'en']
  useEffect(() => () => { recognition.current?.abort() }, [])
  function toggle() {
    if (listening) { recognition.current?.stop(); return }
    if (!Constructor) return
    const instance = new Constructor()
    instance.lang = locale === 'ro' ? 'ro-RO' : 'en-US'
    instance.interimResults = false; instance.continuous = false
    instance.onresult = event => append(Array.from(event.results).map(result => result[0].transcript).join(' '))
    instance.onerror = () => { setListening(false); toast.error(messages.speechError) }
    instance.onend = () => setListening(false)
    recognition.current = instance
    try { instance.start(); setListening(true) } catch { toast.error(messages.speechError) }
  }
  function cancel() { recognition.current?.abort(); setListening(false) }
  return { supported: Boolean(Constructor), listening, toggle, cancel }
}
