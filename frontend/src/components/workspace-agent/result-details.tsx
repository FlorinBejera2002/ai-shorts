import type { ReactElement } from 'react'
import type { SiteLocale } from '@/lib/site-config'
import { Button } from '@/components/ui/button'
import { ResourceResults, StudioResults } from './resource-results'
import { countForms, countLabel, type Localized } from './model'

type Fields = Record<string, unknown>
type ResultProps = { action: string; value: Fields; locale: SiteLocale }

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
  [action => action.startsWith('resources.') || action === 'sources.list', ({ value, locale }) => <ResourceResults data={value} locale={locale} />],
  [action => action.startsWith('studio.'), ({ value, locale }) => <StudioResults data={value} locale={locale} />],
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

export function ResultDetails({ action, data, locale }: { action?: string; data: unknown; locale: SiteLocale }) {
  if (!data || !action) return null
  if (Array.isArray(data)) return <RecordList items={data} locale={locale} />
  const renderer = RESULT_RENDERERS.find(([matches]) => matches(action))?.[1]
  return renderer ? renderer({ action, value: record(data), locale }) : null
}

function RecordList({ items, locale }: { items: unknown[]; locale: SiteLocale }) {
  return <ul className="max-h-64 space-y-2 overflow-y-auto rounded-[14px] border border-border bg-card p-3 text-xs">
    {!items.length && <li>{{ en: 'No results.', ro: 'Niciun rezultat.', es: 'Sin resultados.' }[locale]}</li>}
    {items.slice(0, 30).map((value, index) => {
      const item = record(value)
      const thumbnail = safeThumbnail(item.thumbnail_url)
      const resultLabel = { en: 'Result', ro: 'Rezultat', es: 'Resultado' }[locale]
      return <li key={text(item.id) ?? itemKey(item)} className="flex items-center gap-3 border-b border-border pb-2 last:border-0 last:pb-0">
        {thumbnail && <img src={thumbnail} alt="" width={32} height={40} loading="lazy" className="h-10 w-8 shrink-0 rounded-sm object-cover" />}
        <div className="min-w-0"><p className="font-medium">{text(item.title) ?? text(item.name) ?? `${resultLabel} ${index + 1}`}</p><p className="text-muted-foreground">{text(item.status)}{typeof item.clips === 'number' ? ` · ${countLabel(item.clips, locale, countForms.clip)}` : ''}</p></div>
      </li>
    })}
  </ul>
}

function ClipsListResult({ value, locale }: ResultProps) {
  const clips = Array.isArray(value.clips) ? value.clips.map(record) : []
  const pageLabel = { en: 'Page', ro: 'Pagina', es: 'Página' }[locale]
  return <section className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs"><p>{countLabel(typeof value.total === 'number' ? value.total : clips.length, locale, countForms.clip)} · {pageLabel} {typeof value.current_page === 'number' ? value.current_page : 1}{typeof value.total_pages === 'number' ? ` / ${value.total_pages}` : ''}</p><ul className="max-h-64 space-y-2 overflow-auto">{clips.map(clip => <li key={text(clip.id) ?? itemKey(clip)}><p className="font-medium">{text(clip.title)}</p><p className="text-muted-foreground">{typeof clip.duration === 'number' ? `${clip.duration}s · ` : ''}{text(clip.aspect_ratio)}</p></li>)}</ul></section>
}

function ActivityResult({ value, locale }: ResultProps) {
  const days = Array.isArray(value.days) ? value.days.map(record) : []
  const endLabel = { en: 'end exclusive', ro: 'sfârșit exclusiv', es: 'fin exclusivo' }[locale]
  return <section className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs"><p>{text(value.start)} – {text(value.end_exclusive)} · UTC ({endLabel})</p><ul className="max-h-64 space-y-1 overflow-auto">{days.map(day => <li key={text(day.date) ?? itemKey(day)}>{text(day.date)} · {countLabel(typeof day.projects === 'number' ? day.projects : 0, locale, countForms.project)} · {countLabel(typeof day.clips === 'number' ? day.clips : 0, locale, countForms.clip)} · {typeof day.duration_seconds === 'number' ? day.duration_seconds : 0}s</li>)}</ul></section>
}

const PREFERENCE_LABELS: Record<string, Localized> = {
  locale: { en: 'Language', ro: 'Limbă', es: 'Idioma' },
  theme: { en: 'Theme', ro: 'Temă', es: 'Tema' },
  timezone: { en: 'Time zone', ro: 'Fus orar', es: 'Zona horaria' },
  defaultAspectRatio: { en: 'Default format', ro: 'Format implicit', es: 'Formato predeterminado' },
  defaultClipCount: { en: 'Default clip count', ro: 'Număr implicit de clipuri', es: 'Número predeterminado de clips' }
}

function PreferencesResult({ value, locale }: ResultProps) {
  const preferences = record(value.preferences)
  return <dl className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs">{Object.entries(PREFERENCE_LABELS).map(([key, label]) => typeof preferences[key] === 'string' || typeof preferences[key] === 'number' ? <div key={key}><dt className="text-muted-foreground">{label[locale]}</dt><dd>{String(preferences[key])}</dd></div> : null)}</dl>
}

function LogoResult({ value, locale }: ResultProps) {
  const message = value.has_logo
    ? { en: 'The global logo is configured.', ro: 'Logo-ul global este configurat.', es: 'El logotipo global está configurado.' }[locale]
    : { en: 'The global logo was removed.', ro: 'Logo-ul global a fost eliminat.', es: 'El logotipo global se ha eliminado.' }[locale]
  return <p className="rounded-[14px] border border-border bg-card p-3 text-xs">{message}</p>
}

const PROJECT_BRAND_LABELS: Record<string, Localized> = {
  name: { en: 'Name', ro: 'Nume', es: 'Nombre' },
  primaryColor: { en: 'Primary color', ro: 'Culoare principală', es: 'Color principal' },
  secondaryColor: { en: 'Secondary color', ro: 'Culoare secundară', es: 'Color secundario' },
  fontFamily: { en: 'Font', ro: 'Font', es: 'Fuente' },
  subtitleFont: { en: 'Caption font', ro: 'Font subtitrări', es: 'Fuente de subtítulos' },
  subtitleColor: { en: 'Caption color', ro: 'Culoare subtitrări', es: 'Color de subtítulos' }
}

function ProjectBrandResult({ value, locale }: ResultProps) {
  const settings = record(value.settings)
  const logoStatus = value.has_logo
    ? { en: 'Configured', ro: 'Configurat', es: 'Configurado' }[locale]
    : { en: 'Not configured', ro: 'Neconfigurat', es: 'Sin configurar' }[locale]
  return <dl className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs">{Object.entries(PROJECT_BRAND_LABELS).map(([key, label]) => text(settings[key]) ? <div key={key}><dt className="text-muted-foreground">{label[locale]}</dt><dd>{text(settings[key])}</dd></div> : null)}<div><dt className="text-muted-foreground">Logo</dt><dd>{logoStatus}</dd></div></dl>
}

function LibraryResult({ value, locale }: ResultProps) {
  const folders = Array.isArray(value.folders) ? value.folders.map(record) : []
  const clips = Array.isArray(value.clips) ? value.clips.map(record) : []
  return <section className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs"><h4 className="font-medium">{text(value.name)}</h4><p>{countLabel(folders.length, locale, countForms.folder)} · {countLabel(clips.length, locale, countForms.clip)}</p><ul className="max-h-48 space-y-1 overflow-auto">{folders.map(folder => <li key={text(folder.id) ?? itemKey(folder)}>{text(folder.name)} · {countLabel(clips.filter(clip => clip.folder_id === folder.id).length, locale, countForms.clip)}</li>)}</ul></section>
}

const CLIP_STATES: Record<string, Localized> = {
  pending: { en: 'Pending', ro: 'În așteptare', es: 'Pendiente' },
  queued: { en: 'Queued', ro: 'În coadă', es: 'En cola' },
  running: { en: 'Working', ro: 'În lucru', es: 'En curso' },
  processing: { en: 'Processing', ro: 'Se procesează', es: 'Procesando' },
  completed: { en: 'Completed', ro: 'Finalizat', es: 'Completado' },
  succeeded: { en: 'Completed', ro: 'Finalizat', es: 'Completado' },
  delivered: { en: 'Completed', ro: 'Finalizat', es: 'Completado' },
  failed: { en: 'Failed', ro: 'Eșuat', es: 'Fallido' },
  cancelled: { en: 'Cancelled', ro: 'Anulat', es: 'Cancelado' }
}

const DURATION_FORMATS: Record<SiteLocale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat('en', { maximumFractionDigits: 2 }),
  ro: new Intl.NumberFormat('ro', { maximumFractionDigits: 2 }),
  es: new Intl.NumberFormat('es', { maximumFractionDigits: 2 })
}

function ClipResult({ value, locale }: ResultProps) {
  const clip = value.clip ? record(value.clip) : value
  const state = text(value.status) ?? text(value.state)
  return <dl className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs">
    {text(clip.title) && <div><dt className="text-muted-foreground">{{ en: 'Title', ro: 'Titlu', es: 'Título' }[locale]}</dt><dd>{text(clip.title)}</dd></div>}
    {state && <div><dt className="text-muted-foreground">{{ en: 'Status', ro: 'Stare', es: 'Estado' }[locale]}</dt><dd>{CLIP_STATES[state]?.[locale] ?? state}</dd></div>}
    {typeof clip.duration === 'number' && Number.isFinite(clip.duration) && clip.duration >= 0 && <div><dt className="text-muted-foreground">{{ en: 'Duration', ro: 'Durată', es: 'Duración' }[locale]}</dt><dd>{DURATION_FORMATS[locale].format(clip.duration)} {{ en: 'seconds', ro: 'secunde', es: 'segundos' }[locale]}</dd></div>}
  </dl>
}

function TotalsResult({ value, locale }: ResultProps) {
  return <dl className="grid grid-cols-2 gap-2 rounded-[14px] border border-border bg-card p-3 text-xs">{[
    ['credits', { en: 'Credits', ro: 'Credite', es: 'Créditos' }[locale]],
    ['projects', { en: 'Projects', ro: 'Proiecte', es: 'Proyectos' }[locale]],
    ['clips', { en: 'Clips', ro: 'Clipuri', es: 'Clips' }[locale]],
    ['scripts', { en: 'Scripts', ro: 'Scenarii', es: 'Guiones' }[locale]]
  ].map(([key, label]) => <div key={key}><dt className="text-muted-foreground">{label}</dt><dd className="text-2xl font-semibold tabular-nums">{typeof value[key] === 'number' ? value[key] : '—'}</dd></div>)}</dl>
}

function ScriptResult({ action, value, locale }: ResultProps) {
  const documentRecord = record(value.document)
  const snapshot = record(value.snapshot ?? documentRecord.snapshot)
  const scenes = Array.isArray(snapshot.scenes) ? snapshot.scenes.map(record) : []
  return <div className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-sm">
    <ScriptHeader value={value} snapshot={snapshot} locale={locale} />
    {scenes.length > 0 && <ScriptScenes scenes={scenes} locale={locale} />}
    <ScriptFooter action={action} value={value} snapshot={snapshot} locale={locale} />
  </div>
}

function ScriptHeader({ value, snapshot, locale }: { value: Fields; snapshot: Fields; locale: SiteLocale }) {
  const title = text(value.title) ?? text(snapshot.title)
  const content = text(value.content) ?? text(snapshot.content) ?? text(snapshot.script) ?? text(snapshot.text)
  const hook = text(snapshot.hook)
  return <>
    {title && <p className="font-medium">{title}</p>}
    {text(value.topic) && <p className="text-xs text-muted-foreground">{text(value.topic)}</p>}
    {content && <p className="max-h-64 overflow-auto whitespace-pre-wrap">{content}</p>}
    {hook && <p><span className="font-semibold">{{ en: 'Hook:', ro: 'Cârlig:', es: 'Gancho:' }[locale]}</span> {hook}</p>}
  </>
}

function ScriptFooter({ action, value, snapshot, locale }: { action: string; value: Fields; snapshot: Fields; locale: SiteLocale }) {
  const exportable = action === 'scripts.export' && Boolean(value.document)
  return <>
    {text(snapshot.call_to_action) && <p>{text(snapshot.call_to_action)}</p>}
    {value.saved === false && <span className="inline-flex h-6 w-fit items-center rounded-[8px] border border-border px-2 text-xs font-semibold">{{ en: 'Unsaved proposal · not saved yet', ro: 'Propunere nesalvată', es: 'Propuesta sin guardar · aún no guardada' }[locale]}</span>}
    {exportable && <Button size="sm" variant="outline" onClick={() => downloadScript(value)}>{{ en: 'Download JSON', ro: 'Descarcă JSON', es: 'Descargar JSON' }[locale]}</Button>}
  </>
}

function ScriptScenes({ scenes, locale }: { scenes: Fields[]; locale: SiteLocale }) {
  return <ol className="max-h-72 space-y-3 overflow-auto text-xs">{scenes.map((scene, index) => <li key={itemKey(scene)}>
    <p className="font-medium">{{ en: 'Scene', ro: 'Scena', es: 'Escena' }[locale]} {index + 1}{typeof scene.duration_seconds === 'number' ? ` · ${scene.duration_seconds}s` : ''}</p>
    <p className="whitespace-pre-wrap">{text(scene.dialogue)}</p>
    <p className="text-muted-foreground">{text(scene.visual_description)}</p>
    {text(scene.text_overlay) && <p>{{ en: 'On-screen text', ro: 'Text pe ecran', es: 'Texto en pantalla' }[locale]}: {text(scene.text_overlay)}</p>}
  </li>)}</ol>
}

function downloadScript(value: Fields) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value.document, null, 2)], { type: 'application/json' }))
  const link = window.document.createElement('a'); link.href = url; link.download = (text(value.filename) ?? 'script.json').replace(/[^a-zA-Z0-9._-]/g, '_'); link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function StoryResult({ value, locale }: ResultProps) {
  const versions = Array.isArray(value.versions) ? value.versions.map(record) : []
  const current = versions.find(version => version.number === value.current_version)
  const acceptedLabel = { en: 'Accepted', ro: 'Acceptată', es: 'Aceptada' }[locale]
  return <div className="space-y-1 rounded-[14px] border border-border bg-card p-3 text-xs">
    {text(value.status) && <p>{{ en: 'Status', ro: 'Stare', es: 'Estado' }[locale]}: {text(value.status)}</p>}
    {typeof value.current_version === 'number' && value.current_version > 0 && <p>{{ en: 'Version', ro: 'Versiune', es: 'Versión' }[locale]} {value.current_version}{current?.accepted === true ? ` · ${acceptedLabel}` : ''}</p>}
    {text(current?.title) && <p className="font-medium">{text(current?.title)}</p>}
    {text(current?.summary) && <p className="text-muted-foreground">{text(current?.summary)}</p>}
  </div>
}
