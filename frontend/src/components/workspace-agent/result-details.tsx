import type { ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { ResourceResults, StudioResults } from './resource-results'

type Fields = Record<string, unknown>
type ResultProps = { action: string; value: Fields; ro: boolean }

function record(value: unknown): Fields {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Fields : {}
}
function text(value: unknown): string | null { return typeof value === 'string' ? value : null }
/** Thumbnail links are limited to https or same-origin paths. */
function safeThumbnail(value: unknown): string | null {
  return typeof value === 'string' && (value.startsWith('https://') || (value.startsWith('/') && !value.startsWith('//'))) ? value : null
}
/** Fallback key for records without an identifier: their own content, never the list position. */
function itemKey(item: Fields): string { return JSON.stringify(item) }

/** Result renderers in dispatch order: the first matching action wins. */
const RESULT_RENDERERS: [(action: string) => boolean, (props: ResultProps) => ReactElement][] = [
  [action => action.startsWith('resources.') || action === 'sources.list', ({ value, ro }) => <ResourceResults data={value} ro={ro} />],
  [action => action.startsWith('studio.'), ({ value, ro }) => <StudioResults data={value} ro={ro} />],
  [action => action === 'clips.list', ClipsListResult],
  [action => action === 'analytics.activity', ActivityResult],
  [action => action.startsWith('settings.preferences.'), PreferencesResult],
  [action => action === 'brand.logo.update', LogoResult],
  [action => action.startsWith('projects.brand.'), ProjectBrandResult],
  [action => action === 'library.get' || action.startsWith('folders.') || action === 'clips.move', LibraryResult],
  [action => action.startsWith('clips.'), ClipResult],
  [action => action === 'analytics.read', TotalsResult],
  [action => action.startsWith('scripts.'), ScriptResult],
  [action => action.startsWith('stories.'), StoryResult],
]

export function ResultDetails({ action, data, ro }: { action?: string; data: unknown; ro: boolean }) {
  if (!data || !action) return null
  if (Array.isArray(data)) return <RecordList items={data} ro={ro} />
  const renderer = RESULT_RENDERERS.find(([matches]) => matches(action))?.[1]
  return renderer ? renderer({ action, value: record(data), ro }) : null
}

function RecordList({ items, ro }: { items: unknown[]; ro: boolean }) {
  return <ul className="max-h-64 space-y-2 overflow-y-auto rounded-[14px] border border-border bg-card p-3 text-xs">
    {!items.length && <li>{ro ? 'Niciun rezultat.' : 'No results.'}</li>}
    {items.slice(0, 30).map((value, index) => {
      const item = record(value)
      const thumbnail = safeThumbnail(item.thumbnail_url)
      return <li key={text(item.id) ?? itemKey(item)} className="flex items-center gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
        {thumbnail && <img src={thumbnail} alt="" width={32} height={40} loading="lazy" className="h-10 w-8 shrink-0 rounded-sm object-cover" />}
        <div className="min-w-0"><p className="font-medium">{text(item.title) ?? text(item.name) ?? `${ro ? 'Rezultat' : 'Result'} ${index + 1}`}</p><p className="text-muted-foreground">{text(item.status)}{typeof item.clips === 'number' ? ` · ${item.clips} ${ro ? 'clipuri' : 'clips'}` : ''}</p></div>
      </li>
    })}
  </ul>
}

function ClipsListResult({ value, ro }: ResultProps) {
  const clips = Array.isArray(value.clips) ? value.clips.map(record) : []
  return <section className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs"><p>{typeof value.total === 'number' ? value.total : clips.length} {ro ? 'clipuri' : 'clips'} · {ro ? 'Pagina' : 'Page'} {typeof value.current_page === 'number' ? value.current_page : 1}{typeof value.total_pages === 'number' ? ` / ${value.total_pages}` : ''}</p><ul className="max-h-64 space-y-2 overflow-auto">{clips.map(clip => <li key={text(clip.id) ?? itemKey(clip)}><p className="font-medium">{text(clip.title)}</p><p className="text-muted-foreground">{typeof clip.duration === 'number' ? `${clip.duration}s · ` : ''}{text(clip.aspect_ratio)}</p></li>)}</ul></section>
}

function ActivityResult({ value, ro }: ResultProps) {
  const days = Array.isArray(value.days) ? value.days.map(record) : []
  return <section className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs"><p>{text(value.start)} – {text(value.end_exclusive)} · UTC ({ro ? 'sfârșit exclusiv' : 'end exclusive'})</p><ul className="max-h-64 space-y-1 overflow-auto">{days.map(day => <li key={text(day.date) ?? itemKey(day)}>{text(day.date)} · {typeof day.projects === 'number' ? day.projects : 0} {ro ? 'proiecte' : 'projects'} · {typeof day.clips === 'number' ? day.clips : 0} {ro ? 'clipuri' : 'clips'} · {typeof day.duration_seconds === 'number' ? day.duration_seconds : 0}s</li>)}</ul></section>
}

function PreferencesResult({ value, ro }: ResultProps) {
  const preferences = record(value.preferences)
  const labels: Record<string, [string, string]> = { locale: ['Language', 'Limbă'], theme: ['Theme', 'Temă'], timezone: ['Time zone', 'Fus orar'], defaultAspectRatio: ['Default format', 'Format implicit'], defaultClipCount: ['Default clip count', 'Număr implicit de clipuri'] }
  return <dl className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs">{Object.entries(labels).map(([key, label]) => typeof preferences[key] === 'string' || typeof preferences[key] === 'number' ? <div key={key}><dt className="text-muted-foreground">{label[ro ? 1 : 0]}</dt><dd>{String(preferences[key])}</dd></div> : null)}</dl>
}

function LogoResult({ value, ro }: ResultProps) {
  return <p className="rounded-[14px] border border-border bg-card p-3 text-xs">{value.has_logo ? (ro ? 'Logo-ul global este configurat.' : 'The global logo is configured.') : (ro ? 'Logo-ul global a fost eliminat.' : 'The global logo was removed.')}</p>
}

function ProjectBrandResult({ value, ro }: ResultProps) {
  const settings = record(value.settings)
  const labels: Record<string, [string, string]> = { name: ['Name', 'Nume'], primaryColor: ['Primary color', 'Culoare principală'], secondaryColor: ['Secondary color', 'Culoare secundară'], fontFamily: ['Font', 'Font'], subtitleFont: ['Caption font', 'Font subtitrări'], subtitleColor: ['Caption color', 'Culoare subtitrări'] }
  return <dl className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs">{Object.entries(labels).map(([key, label]) => text(settings[key]) ? <div key={key}><dt className="text-muted-foreground">{label[ro ? 1 : 0]}</dt><dd>{text(settings[key])}</dd></div> : null)}<div><dt className="text-muted-foreground">Logo</dt><dd>{value.has_logo ? (ro ? 'Configurat' : 'Configured') : (ro ? 'Neconfigurat' : 'Not configured')}</dd></div></dl>
}

function LibraryResult({ value, ro }: ResultProps) {
  const folders = Array.isArray(value.folders) ? value.folders.map(record) : []
  const clips = Array.isArray(value.clips) ? value.clips.map(record) : []
  return <section className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs"><h4 className="font-medium">{text(value.name)}</h4><p>{folders.length} {ro ? 'foldere' : 'folders'} · {clips.length} {ro ? 'clipuri' : 'clips'}</p><ul className="max-h-48 space-y-1 overflow-auto">{folders.map(folder => <li key={text(folder.id) ?? itemKey(folder)}>{text(folder.name)} · {clips.filter(clip => clip.folder_id === folder.id).length} {ro ? 'clipuri' : 'clips'}</li>)}</ul></section>
}

const CLIP_STATES: Record<string, [string, string]> = {
  pending: ['Pending', 'În așteptare'], queued: ['Queued', 'În coadă'], running: ['Working', 'În lucru'],
  processing: ['Processing', 'Se procesează'], completed: ['Completed', 'Finalizat'], succeeded: ['Completed', 'Finalizat'],
  delivered: ['Completed', 'Finalizat'], failed: ['Failed', 'Eșuat'], cancelled: ['Cancelled', 'Anulat']
}

const DURATION_FORMATS = { ro: new Intl.NumberFormat('ro', { maximumFractionDigits: 2 }), en: new Intl.NumberFormat('en', { maximumFractionDigits: 2 }) }

function ClipResult({ value, ro }: ResultProps) {
  const clip = value.clip ? record(value.clip) : value
  const state = text(value.status) ?? text(value.state)
  return <dl className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs">
    {text(clip.title) && <div><dt className="text-muted-foreground">{ro ? 'Titlu' : 'Title'}</dt><dd>{text(clip.title)}</dd></div>}
    {state && <div><dt className="text-muted-foreground">{ro ? 'Stare' : 'Status'}</dt><dd>{CLIP_STATES[state]?.[ro ? 1 : 0] ?? state}</dd></div>}
    {typeof clip.duration === 'number' && Number.isFinite(clip.duration) && clip.duration >= 0 && <div><dt className="text-muted-foreground">{ro ? 'Durată' : 'Duration'}</dt><dd>{DURATION_FORMATS[ro ? 'ro' : 'en'].format(clip.duration)} {ro ? 'secunde' : 'seconds'}</dd></div>}
  </dl>
}

function TotalsResult({ value, ro }: ResultProps) {
  return <dl className="grid grid-cols-2 gap-2 rounded-[14px] border border-border bg-card p-3 text-xs">{[
    ['credits', ro ? 'Credite' : 'Credits'], ['projects', ro ? 'Proiecte' : 'Projects'], ['clips', ro ? 'Clipuri' : 'Clips'], ['scripts', ro ? 'Scenarii' : 'Scripts']
  ].map(([key, label]) => <div key={key}><dt className="text-muted-foreground">{label}</dt><dd className="text-2xl font-semibold tabular-nums">{typeof value[key] === 'number' ? value[key] : '—'}</dd></div>)}</dl>
}

function ScriptResult({ action, value, ro }: ResultProps) {
  const documentRecord = record(value.document)
  const snapshot = record(value.snapshot ?? documentRecord.snapshot)
  const scenes = Array.isArray(snapshot.scenes) ? snapshot.scenes.map(record) : []
  return <div className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-sm">
    <ScriptHeader value={value} snapshot={snapshot} ro={ro} />
    {scenes.length > 0 && <ScriptScenes scenes={scenes} ro={ro} />}
    <ScriptFooter action={action} value={value} snapshot={snapshot} ro={ro} />
  </div>
}

function ScriptHeader({ value, snapshot, ro }: { value: Fields; snapshot: Fields; ro: boolean }) {
  const title = text(value.title) ?? text(snapshot.title)
  const content = text(value.content) ?? text(snapshot.content) ?? text(snapshot.script) ?? text(snapshot.text)
  const hook = text(snapshot.hook)
  return <>
    {title && <p className="font-medium">{title}</p>}
    {text(value.topic) && <p className="text-xs text-muted-foreground">{text(value.topic)}</p>}
    {content && <p className="max-h-64 overflow-auto whitespace-pre-wrap">{content}</p>}
    {hook && <p><span className="font-semibold">{ro ? 'Cârlig:' : 'Hook:'}</span> {hook}</p>}
  </>
}

function ScriptFooter({ action, value, snapshot, ro }: { action: string; value: Fields; snapshot: Fields; ro: boolean }) {
  const exportable = action === 'scripts.export' && Boolean(value.document)
  return <>
    {text(snapshot.call_to_action) && <p>{text(snapshot.call_to_action)}</p>}
    {value.saved === false && <span className="inline-flex h-6 w-fit items-center rounded-[8px] border border-border px-2 text-xs font-semibold">{ro ? 'Propunere nesalvată' : 'Unsaved proposal · not saved yet'}</span>}
    {exportable && <Button size="sm" variant="outline" onClick={() => downloadScript(value)}>{ro ? 'Descarcă JSON' : 'Download JSON'}</Button>}
  </>
}

function ScriptScenes({ scenes, ro }: { scenes: Fields[]; ro: boolean }) {
  return <ol className="max-h-72 space-y-3 overflow-auto text-xs">{scenes.map((scene, index) => <li key={itemKey(scene)}>
    <p className="font-medium">{ro ? 'Scena' : 'Scene'} {index + 1}{typeof scene.duration_seconds === 'number' ? ` · ${scene.duration_seconds}s` : ''}</p>
    <p className="whitespace-pre-wrap">{text(scene.dialogue)}</p>
    <p className="text-muted-foreground">{text(scene.visual_description)}</p>
    {text(scene.text_overlay) && <p>{ro ? 'Text pe ecran' : 'On-screen text'}: {text(scene.text_overlay)}</p>}
  </li>)}</ol>
}

function downloadScript(value: Fields) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value.document, null, 2)], { type: 'application/json' }))
  const link = window.document.createElement('a'); link.href = url; link.download = (text(value.filename) ?? 'script.json').replace(/[^a-zA-Z0-9._-]/g, '_'); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function StoryResult({ value, ro }: ResultProps) {
  const versions = Array.isArray(value.versions) ? value.versions.map(record) : []
  const current = versions.find(version => version.number === value.current_version)
  return <div className="space-y-1 rounded-[14px] border border-border bg-card p-3 text-xs">
    {text(value.status) && <p>{ro ? 'Stare' : 'Status'}: {text(value.status)}</p>}
    {typeof value.current_version === 'number' && value.current_version > 0 && <p>{ro ? 'Versiune' : 'Version'} {value.current_version}{current?.accepted === true ? ` · ${ro ? 'Acceptată' : 'Accepted'}` : ''}</p>}
    {text(current?.title) && <p className="font-medium">{text(current?.title)}</p>}
    {text(current?.summary) && <p className="text-muted-foreground">{text(current?.summary)}</p>}
  </div>
}
