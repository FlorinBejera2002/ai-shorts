import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth'
import { createStudioClient } from '@/components/studio/studio-client'
import { configuredStudioOrigin } from '@/components/studio/studio-config'
import { STUDIO_UPLOAD_ACCEPT, validStudioUpload } from './studio-upload'

export function StudioAssets({ projectId, ro, onBusy, onUploaded }: { projectId: string; ro: boolean; onBusy: (busy: boolean) => void; onUploaded?: (projectId: string) => void }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [uploaded, setUploaded] = useState<string[]>([])
  const controller = useRef<AbortController | null>(null)
  const uploadedCallback = useRef(onUploaded)
  useEffect(() => { uploadedCallback.current = onUploaded }, [onUploaded])
  useEffect(() => () => { controller.current?.abort(); onBusy(false) }, [onBusy])
  async function upload(files: FileList | null) {
    if (!files?.length || pending) return
    const list = Array.from(files)
    if (!validStudioUpload(list)) {
      setError(ro ? 'Alege maximum 8 imagini, videoclipuri, fișiere audio sau fonturi acceptate, sub 500 MB în total.' : 'Choose up to 8 supported images, videos, audio files or fonts, under 500 MB in total.'); return
    }
    const origin = configuredStudioOrigin(process.env.NEXT_PUBLIC_STUDIO_URL, process.env.NODE_ENV === 'production')
    if (!origin) { setError(ro ? 'Studio nu este configurat.' : 'Studio is not configured.'); return }
    const active = new AbortController(); controller.current = active
    setPending(true); onBusy(true); setError('')
    try {
      await createStudioClient(origin, authClient).connect(active.signal)
      const form = new FormData(); list.forEach(file => form.append('file', file))
      const response = await fetch(`${origin}/api/projects/${encodeURIComponent(projectId)}/upload?dir=assets`, { method: 'POST', credentials: 'include', redirect: 'error', body: form, signal: active.signal })
      const body = await response.json()
      if (!response.ok) throw new Error(ro ? 'Încărcarea în Studio a eșuat.' : 'Studio upload failed.')
      const paths = Array.isArray(body.files) ? body.files.filter((path: unknown): path is string => typeof path === 'string') : []
      setUploaded(previous => [...new Set([...previous, ...paths])])
      if (body.skipped?.length || body.invalid?.length || paths.length !== list.length) setError(ro ? 'Unele fișiere nu au fost acceptate. Sunt afișate numai cele salvate.' : 'Some files were not accepted. Only saved files are shown.')
      else if (!active.signal.aborted) uploadedCallback.current?.(projectId)
    } catch (cause) { if (!active.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setPending(false); onBusy(false); controller.current = null }
  }
  return <section className="space-y-2 text-xs">
    <p className="text-muted-foreground">{ro ? 'Imagini, video, audio și fonturi · până la 8 fișiere, sub 500 MB în total.' : 'Images, video, audio and fonts · up to 8 files, under 500 MB in total.'}</p>
    <input type="file" multiple disabled={pending} accept={STUDIO_UPLOAD_ACCEPT} aria-label={ro ? 'Atașează media în Studio' : 'Attach Studio media'} onChange={event => { void upload(event.target.files); event.target.value = '' }} className="w-full text-xs" />
    {pending && <p role="status">{ro ? 'Se încarcă în proiectul Studio…' : 'Uploading to the Studio project…'} <Button size="sm" variant="ghost" onClick={() => controller.current?.abort()}>{ro ? 'Oprește' : 'Stop'}</Button></p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <ul>{uploaded.map(path => <li key={path}>{path.split('/').at(-1)}</li>)}</ul>
    {uploaded.length > 0 && <p>{ro ? 'Fișiere salvate. Descrie cum dorești să fie folosite; agentul verifică inventarul înainte de editare.' : 'Files saved. Describe how to use them; the agent checks the inventory before editing.'}</p>}
  </section>
}
