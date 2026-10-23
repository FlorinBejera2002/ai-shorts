import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiFetch } from '@/lib/auth'
import type { CaptionFont, CaptionStyle } from './caption-style'

export function useCaptionFontLibrary({ value, onChange, onBusyChange }: {
  value: CaptionStyle
  onChange: (value: CaptionStyle) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const t = useTranslations('brand')
  const [fonts, setFonts] = useState<CaptionFont[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [reload, setReload] = useState(0)
  const request = useRef<AbortController | null>(null)
  const latestValue = useRef(value)
  useLayoutEffect(() => { latestValue.current = value }, [value])
  useEffect(() => () => request.current?.abort(), [])
  useEffect(() => {
    const controller = new AbortController()
    void apiFetch('/api/user/brand/fonts', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(t('fontLoadError'))
        const data = await response.json() as { fonts: CaptionFont[] }
        if (!controller.signal.aborted) {
          setFonts(data.fonts)
          setError('')
        }
      })
      .catch(() => { if (!controller.signal.aborted) setError(t('fontLoadError')) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [t, reload])

  function chooseFile(file?: File) {
    if (!file || busy) return
    if (!/\.(ttf|otf)$/i.test(file.name) || file.size > 8 * 1024 * 1024 || file.size === 0) {
      setError(t('editorDesign.fontFileInvalid'))
      return
    }
    setError('')
    setPendingFile(file)
  }

  function beginRequest() {
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    onBusyChange?.(true)
    return controller
  }

  function endRequest() {
    request.current = null
    setBusy(false)
    onBusyChange?.(false)
  }

  async function upload() {
    if (!pendingFile || busy || !confirmed) return
    const controller = beginRequest()
    try {
      const form = new FormData()
      form.append('file', pendingFile)
      const response = await apiFetch('/api/user/brand/fonts?license_confirmed=true', {
        method: 'POST', body: form, signal: controller.signal
      })
      const data = await response.json() as { font?: CaptionFont; error?: string }
      if (!response.ok || !data.font) throw new Error(data.error || t('fontUploadError'))
      if (controller.signal.aborted) return
      const font = data.font
      setFonts(current => [...current.filter(item => item.id !== font.id), font])
      onChange({ ...latestValue.current, font_id: font.id, weight: font.weights[0] ?? 700 })
      setPendingFile(null)
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : t('fontUploadError'))
    } finally { endRequest() }
  }

  async function remove() {
    const selected = fonts.find(font => font.id === latestValue.current.font_id)
    if (!selected || selected.category !== 'custom' || selected.archived || busy) return
    const controller = beginRequest()
    try {
      const response = await apiFetch(`/api/user/brand/fonts?id=${encodeURIComponent(selected.id)}`, {
        method: 'DELETE', signal: controller.signal
      })
      if (!response.ok) throw new Error(t('fontUploadError'))
      if (controller.signal.aborted) return
      setFonts(current => current.map(font => font.id === selected.id ? { ...font, archived: true } : font))
      if (latestValue.current.font_id === selected.id)
        onChange({ ...latestValue.current, font_id: 'builtin:inter', weight: 700 })
    } catch {
      if (!controller.signal.aborted) setError(t('fontUploadError'))
    } finally { endRequest() }
  }

  return {
    fonts, loading, busy, error, pendingFile, confirmed, setConfirmed,
    chooseFile, clearFile: () => setPendingFile(null), upload, remove,
    retry: () => { setLoading(true); setReload(current => current + 1) }
  }
}
