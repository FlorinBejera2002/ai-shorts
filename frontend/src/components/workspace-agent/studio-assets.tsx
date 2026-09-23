import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth'
import { createStudioClient } from '@/components/studio/studio-client'
import { configuredStudioOrigin } from '@/components/studio/studio-config'

export function StudioAssets({ projectId, ro, onBusy }: { projectId: string; ro: boolean; onBusy: (busy: boolean) => void }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [uploaded, setUploaded] = useState<string[]>([])
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => { controller.current?.abort(); onBusy(false) }, [onBusy])
  async function upload(files: FileList | null) {
    if (!files?.length || pending) return
    const list = Array.from(files)
    if (list.length > 8 || list.some(file => !/\.(png|jpe?g|webp|gif|mp3|wav|m4a|ogg)$/i.test(file.name) || file.size === 0 || file.size > 50 * 1024 * 1024)) {
      setError(ro ? 'Alege maximum 8 imagini sau fișiere audio, fiecare de maximum 50 MB.' : 'Choose up to 8 images or audio files, each at most 50 MB.'); return
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
      setUploaded(previous => [...previous, ...paths])
      if (body.skipped?.length || body.invalid?.length || paths.length !== list.length) setError(ro ? 'Unele fișiere nu au fost acceptate. Sunt afișate numai cele salvate.' : 'Some files were not accepted. Only saved files are shown.')
    } catch (cause) { if (!active.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setPending(false); onBusy(false); controller.current = null }
  }
  return <section className="my-3 space-y-2 rounded-md border p-3 text-xs">
    <p className="font-medium">{ro ? 'Imagini și audio pentru Studio' : 'Images and audio for Studio'}</p>
    <p className="break-all text-muted-foreground">{projectId}</p>
    <input type="file" multiple disabled={pending} accept=".png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.m4a,.ogg" aria-label={ro ? 'Atașează media în Studio' : 'Attach Studio media'} onChange={event => { void upload(event.target.files); event.target.value = '' }} />
    {pending && <p role="status">{ro ? 'Se încarcă în proiectul Studio…' : 'Uploading to the Studio project…'} <Button size="sm" variant="ghost" onClick={() => controller.current?.abort()}>{ro ? 'Oprește' : 'Stop'}</Button></p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <ul>{uploaded.map((path, index) => <li key={`${path}-${index}`}>{path}</li>)}</ul>
    {uploaded.length > 0 && <p>{ro ? 'Fișiere salvate. Descrie cum dorești să fie folosite; agentul verifică inventarul înainte de editare.' : 'Files saved. Describe how to use them; the agent checks the inventory before editing.'}</p>}
  </section>
}
