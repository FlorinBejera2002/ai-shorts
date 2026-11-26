import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import type { SiteLocale } from '@/lib/site-config'
import { toast } from '@/lib/toast'
import { authClient } from '@/lib/auth'
import { createStudioClient } from '@/components/studio/studio-client'
import { configuredStudioOrigin } from '@/components/studio/studio-config'
import { AgentPill } from './agent-pill'
import { FileRow, UploadRow } from './agent-ui'
import { STUDIO_UPLOAD_ACCEPT, validStudioUpload } from './studio-upload'
import panelStyles from './agent-panels.module.css'
import uiStyles from './agent-ui.module.css'

export function StudioAssets({ projectId, locale, onBusy, onUploaded }: { projectId: string; locale: SiteLocale; onBusy: (busy: boolean) => void; onUploaded?: (projectId: string) => void }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [uploaded, setUploaded] = useState<string[]>([])
  const controller = useRef<AbortController | null>(null)
  const picker = useRef<HTMLInputElement>(null)
  const uploadedCallback = useRef(onUploaded)
  useEffect(() => { uploadedCallback.current = onUploaded }, [onUploaded])
  useEffect(() => () => { controller.current?.abort(); onBusy(false) }, [onBusy])
  async function upload(files: FileList | null) {
    if (!files?.length || pending) return
    const list = Array.from(files)
    if (!validStudioUpload(list)) {
      setError({ en: 'Choose up to 8 supported images, videos, audio files or fonts, under 500 MB in total.', ro: 'Alege maximum 8 imagini, videoclipuri, fișiere audio sau fonturi acceptate, sub 500 MB în total.', es: 'Elige hasta 8 imágenes, videos, archivos de audio o fuentes compatibles, de menos de 500 MB en total.' }[locale]); return
    }
    const origin = configuredStudioOrigin(process.env.NEXT_PUBLIC_STUDIO_URL, process.env.NODE_ENV === 'production')
    if (!origin) { toast.error({ en: 'Studio is not configured.', ro: 'Studio nu este configurat.', es: 'Studio no está configurado.' }[locale]); return }
    const active = new AbortController(); controller.current = active
    setPending(true); onBusy(true); setError('')
    try {
      await createStudioClient(origin, authClient).connect(active.signal)
      const form = new FormData(); list.forEach(file => form.append('file', file))
      const response = await fetch(`${origin}/api/projects/${encodeURIComponent(projectId)}/upload?dir=assets`, { method: 'POST', credentials: 'include', redirect: 'error', body: form, signal: active.signal })
      const body = await response.json()
      if (!response.ok) throw new Error({ en: 'Studio upload failed.', ro: 'Încărcarea în Studio a eșuat.', es: 'La subida a Studio falló.' }[locale])
      const paths = Array.isArray(body.files) ? body.files.filter((path: unknown): path is string => typeof path === 'string') : []
      setUploaded(previous => [...new Set([...previous, ...paths])])
      if (body.skipped?.length || body.invalid?.length || paths.length !== list.length) toast.warning({ en: 'Some files were not accepted. Only saved files are shown.', ro: 'Unele fișiere nu au fost acceptate. Sunt afișate numai cele salvate.', es: 'Algunos archivos no se aceptaron. Solo se muestran los guardados.' }[locale])
      else if (!active.signal.aborted) uploadedCallback.current?.(projectId)
    } catch (cause) { if (!active.signal.aborted) toast.error(cause instanceof Error ? cause.message : String(cause)) }
    finally { setPending(false); onBusy(false); controller.current = null }
  }
  return <section className={panelStyles.body}>
    <p className={uiStyles.hint}>{{ en: 'Images, video, audio and fonts · up to 8 files, under 500 MB.', ro: 'Imagini, video, audio și fonturi · până la 8 fișiere, sub 500 MB.', es: 'Imágenes, video, audio y fuentes · hasta 8 archivos, menos de 500 MB.' }[locale]}</p>
    <input ref={picker} type="file" multiple disabled={pending} accept={STUDIO_UPLOAD_ACCEPT} className="hidden" aria-label={{ en: 'Attach Studio media', ro: 'Atașează media în Studio', es: 'Adjuntar medios de Studio' }[locale]} onChange={event => { void upload(event.target.files); event.target.value = '' }} />
    <div className={uiStyles.stack}>
      <AgentPill icon={<Upload aria-hidden="true" />} disabled={pending} onClick={() => picker.current?.click()}>{{ en: 'Attach media', ro: 'Atașează media', es: 'Adjuntar medios' }[locale]}</AgentPill>
    </div>
    {pending && <div role="status">
      <UploadRow
        name={{ en: 'Upload to the Studio project', ro: 'Încărcare în proiectul Studio', es: 'Subida al proyecto de Studio' }[locale]}
        status={{ en: 'Uploading…', ro: 'Se încarcă…', es: 'Subiendo…' }[locale]}
        actions={<AgentPill variant="ghost" onClick={() => controller.current?.abort()}>{{ en: 'Stop', ro: 'Oprește', es: 'Detener' }[locale]}</AgentPill>}
      />
    </div>}
    {error && <p role="alert" className={uiStyles.error}>{error}</p>}
    {uploaded.length > 0 && <ul className={panelStyles.list}>
      {uploaded.map(path => <li key={path}>
        <FileRow name={path.split('/').at(-1) ?? path} status={{ en: 'Saved', ro: 'Salvat', es: 'Guardado' }[locale]} tone="success" />
      </li>)}
    </ul>}
  </section>
}
