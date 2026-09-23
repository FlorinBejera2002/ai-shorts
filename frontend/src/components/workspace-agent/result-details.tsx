import { Button } from '@/components/ui/button'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function text(value: unknown): string | null { return typeof value === 'string' ? value : null }

export function ResultDetails({ action, data, ro }: { action?: string; data: unknown; ro: boolean }) {
  if (!data || !action) return null
  if (Array.isArray(data)) return <ul className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3 text-xs">
    {!data.length && <li>{ro ? 'Niciun rezultat.' : 'No results.'}</li>}
    {data.slice(0, 30).map((value, index) => {
      const item = record(value)
      return <li key={text(item.id) ?? index} className="border-b pb-2 last:border-0 last:pb-0"><p className="font-medium">{text(item.title) ?? text(item.name) ?? text(item.id)}</p><p className="text-muted-foreground">{text(item.status)}{typeof item.clips === 'number' ? ` · ${item.clips} ${ro ? 'clipuri' : 'clips'}` : ''}</p></li>
    })}
  </ul>
  const value = record(data)
  if (action === 'clips.list') {
    const clips = Array.isArray(value.clips) ? value.clips.map(record) : []
    return <section className="space-y-2 rounded-md border p-3 text-xs"><p>{typeof value.total === 'number' ? value.total : clips.length} {ro ? 'clipuri' : 'clips'} · {ro ? 'Pagina' : 'Page'} {typeof value.current_page === 'number' ? value.current_page : 1}{typeof value.total_pages === 'number' ? ` / ${value.total_pages}` : ''}</p><ul className="max-h-64 space-y-2 overflow-auto">{clips.map((clip, index) => <li key={text(clip.id) ?? index}><p className="font-medium">{text(clip.title)}</p><p className="text-muted-foreground">{typeof clip.duration === 'number' ? `${clip.duration}s · ` : ''}{text(clip.aspect_ratio)}</p></li>)}</ul></section>
  }
  if (action === 'analytics.activity') {
    const days = Array.isArray(value.days) ? value.days.map(record) : []
    return <section className="space-y-2 rounded-md border p-3 text-xs"><p>{text(value.start)} – {text(value.end_exclusive)} · UTC ({ro ? 'sfârșit exclusiv' : 'end exclusive'})</p><ul className="max-h-64 space-y-1 overflow-auto">{days.map((day, index) => <li key={text(day.date) ?? index}>{text(day.date)} · {typeof day.projects === 'number' ? day.projects : 0} {ro ? 'proiecte' : 'projects'} · {typeof day.clips === 'number' ? day.clips : 0} {ro ? 'clipuri' : 'clips'} · {typeof day.duration_seconds === 'number' ? day.duration_seconds : 0}s</li>)}</ul></section>
  }
  if (action.startsWith('settings.preferences.')) {
    const preferences = record(value.preferences)
    const labels: Record<string, [string, string]> = { locale: ['Language', 'Limbă'], theme: ['Theme', 'Temă'], timezone: ['Time zone', 'Fus orar'], defaultAspectRatio: ['Default format', 'Format implicit'], defaultClipCount: ['Default clip count', 'Număr implicit de clipuri'] }
    return <dl className="space-y-2 rounded-md border p-3 text-xs">{Object.entries(labels).map(([key, label]) => typeof preferences[key] === 'string' || typeof preferences[key] === 'number' ? <div key={key}><dt className="text-muted-foreground">{label[ro ? 1 : 0]}</dt><dd>{String(preferences[key])}</dd></div> : null)}</dl>
  }
  if (action === 'brand.logo.update') return <p className="rounded-md border p-3 text-xs">{value.has_logo ? (ro ? 'Logo-ul global este configurat.' : 'The global logo is configured.') : (ro ? 'Logo-ul global a fost eliminat.' : 'The global logo was removed.')}</p>
  if (action.startsWith('projects.brand.')) {
    const settings = record(value.settings)
    const labels: Record<string, [string, string]> = { name: ['Name', 'Nume'], primaryColor: ['Primary color', 'Culoare principală'], secondaryColor: ['Secondary color', 'Culoare secundară'], fontFamily: ['Font', 'Font'], subtitleFont: ['Caption font', 'Font subtitrări'], subtitleColor: ['Caption color', 'Culoare subtitrări'] }
    return <dl className="space-y-2 rounded-md border p-3 text-xs">{Object.entries(labels).map(([key, label]) => text(settings[key]) ? <div key={key}><dt className="text-muted-foreground">{label[ro ? 1 : 0]}</dt><dd>{text(settings[key])}</dd></div> : null)}<div><dt className="text-muted-foreground">Logo</dt><dd>{value.has_logo ? (ro ? 'Configurat' : 'Configured') : (ro ? 'Neconfigurat' : 'Not configured')}</dd></div></dl>
  }
  if (action === 'library.get' || action.startsWith('folders.') || action === 'clips.move') {
    const folders = Array.isArray(value.folders) ? value.folders.map(record) : []
    const clips = Array.isArray(value.clips) ? value.clips.map(record) : []
    return <section className="space-y-2 rounded-md border p-3 text-xs"><h4 className="font-medium">{text(value.name)}</h4><p>{folders.length} {ro ? 'foldere' : 'folders'} · {clips.length} {ro ? 'clipuri' : 'clips'}</p><ul className="max-h-48 space-y-1 overflow-auto">{folders.map(folder => <li key={text(folder.id)}>{text(folder.name)} · {clips.filter(clip => clip.folder_id === folder.id).length} {ro ? 'clipuri' : 'clips'}</li>)}</ul></section>
  }
  if (action.startsWith('clips.')) {
    const clip = value.clip ? record(value.clip) : value
    const state = text(value.status) ?? text(value.state)
    const stateLabels: Record<string, [string, string]> = {
      pending: ['Pending', 'În așteptare'], queued: ['Queued', 'În coadă'], running: ['Working', 'În lucru'],
      processing: ['Processing', 'Se procesează'], completed: ['Completed', 'Finalizat'], succeeded: ['Completed', 'Finalizat'],
      delivered: ['Completed', 'Finalizat'], failed: ['Failed', 'Eșuat'], cancelled: ['Cancelled', 'Anulat']
    }
    return <dl className="space-y-2 rounded-md border p-3 text-xs">
      {text(clip.title) && <div><dt className="text-muted-foreground">{ro ? 'Titlu' : 'Title'}</dt><dd>{text(clip.title)}</dd></div>}
      {state && <div><dt className="text-muted-foreground">{ro ? 'Stare' : 'Status'}</dt><dd>{stateLabels[state]?.[ro ? 1 : 0] ?? state}</dd></div>}
      {typeof clip.duration === 'number' && Number.isFinite(clip.duration) && clip.duration >= 0 && <div><dt className="text-muted-foreground">{ro ? 'Durată' : 'Duration'}</dt><dd>{new Intl.NumberFormat(ro ? 'ro' : 'en', { maximumFractionDigits: 2 }).format(clip.duration)} {ro ? 'secunde' : 'seconds'}</dd></div>}
    </dl>
  }
  if (action === 'analytics.read') return <dl className="grid grid-cols-2 gap-2 rounded-md border p-3 text-xs">{[
    ['credits', ro ? 'Credite' : 'Credits'], ['projects', ro ? 'Proiecte' : 'Projects'], ['clips', ro ? 'Clipuri' : 'Clips'], ['scripts', ro ? 'Scenarii' : 'Scripts']
  ].map(([key, label]) => <div key={key}><dt className="text-muted-foreground">{label}</dt><dd className="text-lg font-semibold tabular-nums">{typeof value[key] === 'number' ? value[key] : '—'}</dd></div>)}</dl>
  if (action.startsWith('scripts.')) {
    const document = record(value.document)
    const snapshot = record(value.snapshot ?? document.snapshot)
    const scenes = Array.isArray(snapshot.scenes) ? snapshot.scenes.map(record) : []
    const content = text(value.content) ?? text(snapshot.content) ?? text(snapshot.script) ?? text(snapshot.text)
    return <div className="space-y-2 rounded-md border p-3 text-sm">{(text(value.title) ?? text(snapshot.title)) && <p className="font-medium">{text(value.title) ?? text(snapshot.title)}</p>}{text(value.topic) && <p className="text-xs text-muted-foreground">{text(value.topic)}</p>}{content && <p className="max-h-64 overflow-auto whitespace-pre-wrap">{content}</p>}
      {text(snapshot.hook) && <p>{text(snapshot.hook)}</p>}
      {scenes.length > 0 && <ol className="max-h-72 space-y-3 overflow-auto text-xs">{scenes.map((scene, index) => <li key={index}><p className="font-medium">{ro ? 'Scena' : 'Scene'} {index + 1}{typeof scene.duration_seconds === 'number' ? ` · ${scene.duration_seconds}s` : ''}</p><p className="whitespace-pre-wrap">{text(scene.dialogue)}</p><p className="text-muted-foreground">{text(scene.visual_description)}</p>{text(scene.text_overlay) && <p>{ro ? 'Text pe ecran' : 'On-screen text'}: {text(scene.text_overlay)}</p>}</li>)}</ol>}
      {text(snapshot.call_to_action) && <p>{text(snapshot.call_to_action)}</p>}
      {value.saved === false && <p className="text-xs text-muted-foreground">{ro ? 'Propunere generată; nu este încă salvată.' : 'Generated proposal; not saved yet.'}</p>}
      {action === 'scripts.export' && Boolean(value.document) && <Button size="sm" variant="outline" onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(value.document, null, 2)], { type: 'application/json' }))
        const link = window.document.createElement('a'); link.href = url; link.download = (text(value.filename) ?? 'script.json').replace(/[^a-zA-Z0-9._-]/g, '_'); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}>{ro ? 'Descarcă JSON' : 'Download JSON'}</Button>}
    </div>
  }
  if (action.startsWith('stories.')) {
    const versions = Array.isArray(value.versions) ? value.versions.map(record) : []
    const current = versions.find(version => version.number === value.current_version)
    return <div className="space-y-1 rounded-md border p-3 text-xs">
      {text(value.status) && <p>{ro ? 'Stare' : 'Status'}: {text(value.status)}</p>}
      {typeof value.current_version === 'number' && value.current_version > 0 && <p>{ro ? 'Versiune' : 'Version'} {value.current_version}{current?.accepted === true ? ` · ${ro ? 'Acceptată' : 'Accepted'}` : ''}</p>}
      {text(current?.title) && <p className="font-medium">{text(current?.title)}</p>}
      {text(current?.summary) && <p className="text-muted-foreground">{text(current?.summary)}</p>}
    </div>
  }
  return null
}
