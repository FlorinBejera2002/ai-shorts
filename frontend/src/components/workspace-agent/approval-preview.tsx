import type { ReactNode } from 'react'
import type { SiteLocale } from '@/lib/site-config'
import { countForms, countLabel, publishingConsentMissing, type Localized } from './model'

const PLATFORM_ORDER = ['instagram', 'facebook', 'tiktok', 'youtube']
const SECTION = 'flex flex-col gap-2.5 rounded-[14px] border border-border bg-card p-3 text-xs'
const OPTION_LABELS: Record<string, Localized> = {
  privacyLevel: { en: 'Privacy', ro: 'Vizibilitate', es: 'Privacidad' },
  privacyStatus: { en: 'Privacy', ro: 'Vizibilitate', es: 'Privacidad' },
  disableComment: { en: 'Comments disabled', ro: 'Comentarii dezactivate', es: 'Comentarios desactivados' },
  disableDuet: { en: 'Duets disabled', ro: 'Duete dezactivate', es: 'Dúos desactivados' },
  disableStitch: { en: 'Stitch disabled', ro: 'Stitch dezactivat', es: 'Stitch desactivado' },
  autoAddMusic: { en: 'Automatic music', ro: 'Muzică automată', es: 'Música automática' },
  musicUsageConfirmed: { en: 'Music rights confirmed', ro: 'Drepturi muzicale confirmate', es: 'Derechos musicales confirmados' },
  brandContentToggle: { en: 'Branded content', ro: 'Conținut de brand', es: 'Contenido de marca' },
  brandOrganicToggle: { en: 'Own brand content', ro: 'Conținut pentru brandul propriu', es: 'Contenido de la propia marca' },
  isAigc: { en: 'AI content declaration', ro: 'Declarație conținut AI', es: 'Declaración de contenido de IA' },
  termsAccepted: { en: 'Terms accepted', ro: 'Termeni acceptați', es: 'Términos aceptados' },
  madeForKids: { en: 'Made for children', ro: 'Creat pentru copii', es: 'Dirigido a niños' },
  containsSyntheticMedia: { en: 'Synthetic media', ro: 'Media sintetică', es: 'Medios sintéticos' },
  notifySubscribers: { en: 'Notify subscribers', ro: 'Notifică abonații', es: 'Notificar a los suscriptores' },
  commentEnabled: { en: 'Comments enabled', ro: 'Comentarii activate', es: 'Comentarios activados' },
  shareToFeed: { en: 'Share to feed', ro: 'Distribuie în flux', es: 'Compartir en el feed' },
  title: { en: 'Title', ro: 'Titlu', es: 'Título' },
  description: { en: 'Description', ro: 'Descriere', es: 'Descripción' },
  photoTitle: { en: 'Photo title', ro: 'Titlu fotografie', es: 'Título de la foto' }
}
const DATE_FORMATTERS: Record<SiteLocale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'long' }),
  ro: new Intl.DateTimeFormat('ro', { dateStyle: 'medium', timeStyle: 'long' }),
  es: new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'long' })
}

type ApprovalProps = { value: Record<string, unknown>; locale: SiteLocale }

function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function label(value: unknown): string { return typeof value === 'string' ? value : '' }

const APPROVAL_RENDERERS = new Map<string, (props: ApprovalProps) => ReactNode>([
  ['jobs.create', JobsApproval],
  ['publishing.disconnect', DisconnectApproval],
  ['stories.delete', StoriesDeleteApproval],
  ['clips.delete', ClipsDeleteApproval],
  ['folders.delete', FolderApproval],
  ['calendar.delete', CalendarDeleteApproval],
])

export function ApprovalPreview({ value, locale }: ApprovalProps) {
  const action = label(value.action)
  if (action.startsWith('studio.')) return <StudioApproval value={value} locale={locale} />
  const render = APPROVAL_RENDERERS.get(action) ?? PublishingApproval
  return <>{render({ value, locale })}</>
}

function ApprovalRow({ label: key, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-start justify-between gap-3">
    <span className="shrink-0 text-muted-foreground">{key}</span>
    <span className="min-w-0 break-words text-right font-semibold">{children}</span>
  </div>
}

function WarningIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>
}

/** Delete approvals: the delete illustration, the target name, a meta line and the irreversible notice. */
function DeleteApproval({ locale, label: ariaLabel, title, meta, children }: { locale: SiteLocale; label: string; title: string; meta?: string; children?: ReactNode }) {
  return <section className={SECTION} aria-label={ariaLabel}>
    <div className="flex flex-col items-center gap-2 text-center">
      <img src="/illustrations/delete.webp" alt="" aria-hidden="true" width={120} height={120} loading="lazy" draggable={false} className="size-[140px] object-contain lg:size-[120px]" />
      <h4 className="break-words text-sm font-semibold">{title}</h4>
      {meta && <p className="text-muted-foreground">{meta}</p>}
    </div>
    {children}
    <p className="text-center font-semibold text-destructive">{{ en: 'Deletion is permanent and cannot be undone.', ro: 'Ștergerea este definitivă. Nu se poate anula.', es: 'La eliminación es definitiva y no se puede deshacer.' }[locale]}</p>
  </section>
}

function JobsApproval({ value, locale }: ApprovalProps) {
  return <section className={SECTION} aria-label={{ en: 'Confirm clip generation', ro: 'Confirmă generarea clipurilor', es: 'Confirma la generación de clips' }[locale]}>
    <h4 className="text-sm font-semibold">{{ en: 'Generate clips from the selected source', ro: 'Generează clipuri din sursa selectată', es: 'Genera clips desde la fuente seleccionada' }[locale]}</h4>
    <ApprovalRow label={{ en: 'Source', ro: 'Sursă', es: 'Fuente' }[locale]}>{label(value.source_url) || { en: 'Selected media source', ro: 'Sursa media selectată', es: 'Fuente multimedia seleccionada' }[locale]}</ApprovalRow>
    <ApprovalRow label={{ en: 'Clips', ro: 'Clipuri', es: 'Clips' }[locale]}>{typeof value.num_clips === 'number' ? value.num_clips : '—'} · {label(value.aspect_ratio)}</ApprovalRow>
    <ApprovalRow label={{ en: 'Cost', ro: 'Cost', es: 'Coste' }[locale]}>{typeof value.cost_credits === 'number' ? value.cost_credits : '—'} {{ en: 'credits', ro: 'credite', es: 'créditos' }[locale]}</ApprovalRow>
  </section>
}

function DisconnectApproval({ value, locale }: ApprovalProps) {
  const account = object(value.account)
  const name = label(value.title) || label(account.name)
  const username = label(account.username)
  // The server's effect text is English only; state the same consequence in the UI language.
  const effect = locale === 'en'
    ? label(value.effect)
    : { ro: 'Postările programate pe acest cont se anulează. Postările publicate rămân. Pentru reconectare te autentifici din nou.', es: 'Las publicaciones programadas en esta cuenta se cancelan. Las publicaciones ya publicadas se mantienen. Para volver a conectarla, inicia sesión de nuevo.' }[locale]
  return <section className={SECTION} aria-label={{ en: 'Confirm disconnect', ro: 'Confirmă deconectarea', es: 'Confirma la desconexión' }[locale]}>
    <h4 className="text-sm font-semibold">{name}</h4>
    <ApprovalRow label={{ en: 'Platform', ro: 'Platformă', es: 'Plataforma' }[locale]}>{platformName(label(account.provider))}</ApprovalRow>
    {username && username !== name && <ApprovalRow label={{ en: 'Account', ro: 'Cont', es: 'Cuenta' }[locale]}>{username}</ApprovalRow>}
    {effect && <p>{effect}</p>}
  </section>
}

function StoriesDeleteApproval({ value, locale }: ApprovalProps) {
  const versionLabel = { en: 'Version', ro: 'Versiune', es: 'Versión' }[locale]
  const sourcesLabel = { en: 'sources', ro: 'surse', es: 'fuentes' }[locale]
  const meta = `${versionLabel} ${typeof value.current_version === 'number' ? value.current_version : '—'} · ${typeof value.asset_count === 'number' ? value.asset_count : 0} ${sourcesLabel}`
  return <DeleteApproval locale={locale} label={{ en: 'Confirm project deletion', ro: 'Confirmă ștergerea proiectului', es: 'Confirma la eliminación del proyecto' }[locale]} title={label(value.title)} meta={meta} />
}

function ClipsDeleteApproval({ value, locale }: ApprovalProps) {
  const meta = typeof value.duration === 'number' && Number.isFinite(value.duration) ? `${value.duration} s` : ''
  return <DeleteApproval locale={locale} label={{ en: 'Confirm clip deletion', ro: 'Confirmă ștergerea clipului', es: 'Confirma la eliminación del clip' }[locale]} title={label(value.title)} meta={meta} />
}

function CalendarDeleteApproval({ value, locale }: ApprovalProps) {
  const account = object(value.account)
  const meta = [platformName(label(account.provider)), label(account.username)].filter(Boolean).join(' ')
  return <DeleteApproval locale={locale} label={{ en: 'Confirm draft deletion', ro: 'Confirmă ștergerea ciornei', es: 'Confirma la eliminación del borrador' }[locale]} title={label(value.title) || label(account.name)} meta={meta} />
}


const PLATFORM_NAMES: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' }
const PUBLISHING_STATES: Record<string, Localized> = {
  connected: { en: 'Connected', ro: 'Conectat', es: 'Conectado' },
  disconnected: { en: 'Disconnected', ro: 'Deconectat', es: 'Desconectado' },
  needs_reconnect: { en: 'Reconnect needed', ro: 'Necesită reconectare', es: 'Requiere reconectar' },
  draft: { en: 'Draft', ro: 'Ciornă', es: 'Borrador' },
  scheduled: { en: 'Scheduled', ro: 'Programată', es: 'Programada' },
  publishing: { en: 'Publishing', ro: 'Se publică', es: 'Publicando' },
  published: { en: 'Published', ro: 'Publicată', es: 'Publicada' },
  failed: { en: 'Failed', ro: 'Eșuată', es: 'Fallida' }
}
const platformName = (provider: string) => PLATFORM_NAMES[provider.toLowerCase()] ?? provider
const publishingState = (state: string, locale: SiteLocale) => PUBLISHING_STATES[state]?.[locale] ?? state

function scheduleText(scheduled: string, locale: SiteLocale): string {
  const date = new Date(scheduled)
  if (!Number.isNaN(date.getTime())) return DATE_FORMATTERS[locale].format(date)
  if (scheduled === 'Immediately after this approval') return { en: 'Immediately after this approval', ro: 'Imediat după această aprobare', es: 'Inmediatamente después de esta aprobación' }[locale]
  return scheduled || { en: 'No scheduled time', ro: 'Fără dată programată', es: 'Sin fecha programada' }[locale]
}

function PublishingApproval({ value, locale }: ApprovalProps) {
  return <section className={SECTION} aria-label={{ en: 'Publishing approval details', ro: 'Detalii publicare pentru aprobare', es: 'Detalles de publicación para aprobar' }[locale]}>
    <h4 className="text-sm font-semibold">{label(value.title)}</h4>
    {label(value.caption) && <p className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{label(value.caption)}</p>}
    <PublishingSummary value={value} locale={locale} />
    <PublishingMedia value={value} />
    <PublishingDestinations value={value} locale={locale} />
    <PublishingOptions value={value} locale={locale} />
    {publishingConsentMissing(value) && <p role="alert" className="flex items-start gap-1.5 text-destructive"><WarningIcon />{{ en: 'Complete the required declarations in Publishing.', ro: 'Completează declarațiile obligatorii în Publicare.', es: 'Completa las declaraciones obligatorias en Publicación.' }[locale]}</p>}
  </section>
}

function PublishingSummary({ value, locale }: ApprovalProps) {
  const clip = object(value.clip)
  const scheduled = label(value.scheduled_at)
  const valid = !Number.isNaN(new Date(scheduled).getTime())
  return <>
    <ApprovalRow label={{ en: 'Publishing time', ro: 'Publicare', es: 'Publicación' }[locale]}>{scheduleText(scheduled, locale)}</ApprovalRow>
    {valid && <p className="text-muted-foreground">{scheduled}</p>}
    {label(value.current_status) && <ApprovalRow label={{ en: 'Current status', ro: 'Stare curentă', es: 'Estado actual' }[locale]}>{publishingState(label(value.current_status), locale)}</ApprovalRow>}
    {label(value.clip_id) && <ApprovalRow label={{ en: 'Selected clip', ro: 'Clip selectat', es: 'Clip seleccionado' }[locale]}>{label(clip.title)}{typeof clip.duration === 'number' && Number.isFinite(clip.duration) ? ` · ${clip.duration} s` : ''}</ApprovalRow>}
  </>
}

function PublishingMedia({ value }: { value: Record<string, unknown> }) {
  const media = Array.isArray(value.media) ? value.media.map(object) : []
  if (!media.length) return null
  return <ul className="flex flex-col gap-2">{media.map(item => <li key={`${label(item.name)}-${label(item.type)}`} className="flex items-center gap-2.5">
    <span className="h-10 w-8 shrink-0 rounded-sm border border-border" aria-hidden="true" />
    <span className="min-w-0 break-words">{label(item.name)} <span className="text-muted-foreground">· {label(item.type)}</span></span>
  </li>)}</ul>
}

function PublishingDestinations({ value, locale }: ApprovalProps) {
  const destinations = (Array.isArray(value.destinations) ? value.destinations.map(object) : [])
    .sort((a, b) => platformRank(label(a.provider)) - platformRank(label(b.provider)))
  if (!destinations.length) return null
  return <ul className="flex flex-col gap-2">{destinations.map(destination => <li key={`${label(destination.provider)}-${label(destination.id)}`} className="flex items-start justify-between gap-3 rounded-[14px] border border-border p-2.5">
    <span className="min-w-0 break-words font-semibold">{destinationTitle(destination)}<span className="block font-normal text-muted-foreground">{label(destination.username)}</span></span>
    <span className="shrink-0 text-right text-muted-foreground">{publishingState(label(destination.status), locale)}{destination.configured === false ? ` · ${{ en: 'Needs configuration', ro: 'Necesită configurare', es: 'Requiere configuración' }[locale]}` : ''}</span>
  </li>)}</ul>
}

function PublishingOptions({ value, locale }: ApprovalProps) {
  const yesLabel = { en: 'Yes', ro: 'Da', es: 'Sí' }[locale]
  const noLabel = { en: 'No', ro: 'Nu', es: 'No' }[locale]
  return <>{PLATFORM_ORDER.map(provider => {
    const options = Object.entries(object(value[provider])).filter(([key]) => key in OPTION_LABELS)
    return options.length ? <details key={provider}><summary className="cursor-pointer font-semibold">{platformName(provider)}</summary><dl className="mt-2 flex flex-col gap-1.5">{options.map(([key, item]) => <div key={key} className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">{OPTION_LABELS[key][locale]}</dt><dd className="whitespace-pre-wrap break-words text-right">{typeof item === 'boolean' ? item ? yesLabel : noLabel : label(item) || '—'}</dd></div>)}</dl></details> : null
  })}</>
}

/** "TikTok · @ana" style title; skips the account name when it only repeats the platform. */
function destinationTitle(destination: Record<string, unknown>) {
  const platform = platformName(label(destination.provider))
  const name = label(destination.name)
  return name && name.toLowerCase() !== platform.toLowerCase() ? `${platform} · ${name}` : platform
}

function platformRank(provider: string) {
  const index = PLATFORM_ORDER.indexOf(provider)
  return index === -1 ? PLATFORM_ORDER.length : index
}

const STUDIO_DELETE_EFFECTS: Record<string, Localized> = {
  'studio.layer.remove': {
    en: 'The selected layer will be removed from the composition. Source files stay available. You can undo this change.',
    ro: 'Elementul selectat va fi eliminat din compoziție. Fișierele sursă rămân disponibile. Poți anula această modificare.',
    es: 'El elemento seleccionado se quitará de la composición. Los archivos de origen seguirán disponibles. Puedes deshacer este cambio.'
  },
  'studio.assets.delete': {
    en: 'The selected file will be deleted from the Studio project. Layers and styles that use it will lose this resource. The composition, saved exports and uploads outside the project stay available.',
    ro: 'Fișierul selectat va fi șters din proiectul Studio. Elementele și stilurile care îl folosesc vor pierde această resursă. Compoziția, exporturile salvate și încărcările din afara proiectului rămân disponibile.',
    es: 'El archivo seleccionado se eliminará del proyecto de Studio. Los elementos y estilos que lo usan perderán este recurso. La composición, las exportaciones guardadas y las subidas fuera del proyecto seguirán disponibles.'
  },
  'studio.renders.delete': {
    en: 'The selected export and its render record will be deleted. The composition, uploaded sources and other exports stay available.',
    ro: 'Exportul selectat și evidența randării vor fi șterse. Compoziția, sursele încărcate și celelalte exporturi rămân disponibile.',
    es: 'Se eliminarán la exportación seleccionada y su registro de renderizado. La composición, los archivos subidos y las demás exportaciones seguirán disponibles.'
  }
}

function studioApprovalDetails(value: Record<string, unknown>, locale: SiteLocale) {
  const layer = object(value.layer)
  const asset = object(value.asset)
  const render = object(value.render)
  const affected = Array.isArray(value.affected_layers) ? value.affected_layers.length : 0
  const target = label(layer.text) || label(asset.name) || label(render.filename) || { en: 'Selected layer', ro: 'Elementul selectat', es: 'Elemento seleccionado' }[locale]
  const effect = locale === 'en'
    ? label(value.effect)
    : STUDIO_DELETE_EFFECTS[label(value.action)]?.[locale] || label(value.effect)
  const timing = typeof layer.start === 'number' && typeof layer.duration === 'number' ? `${layer.start} – ${layer.start + layer.duration} s` : ''
  return { target, affected, effect, timing }
}

function StudioApproval({ value, locale }: ApprovalProps) {
  const { target, affected, effect, timing } = studioApprovalDetails(value, locale)
  const confirmLabel = { en: 'Confirm Studio change', ro: 'Confirmă modificarea în Studio', es: 'Confirma el cambio en Studio' }[locale]
  const notes = <>
    {affected > 0 && <p>{affected} {{ en: 'layers reference this resource directly; styles may reference it too.', ro: 'elemente au referințe directe la această resursă; pot exista și referințe în stiluri.', es: 'elementos hacen referencia directa a este recurso; también puede haber referencias en los estilos.' }[locale]}</p>}
    {value.references_complete === false && <p className="text-muted-foreground">{{ en: 'Only direct media references are listed. Stylesheets, fonts or dynamic elements may also use this file.', ro: 'Sunt enumerate doar referințele media directe. Fișierul poate fi folosit și în stiluri, fonturi sau elemente dinamice.', es: 'Solo se enumeran las referencias multimedia directas. Las hojas de estilo, las fuentes o los elementos dinámicos también podrían usar este archivo.' }[locale]}</p>}
  </>
  // Studio deletes are the studio.*.delete actions (assets and renders).
  if (label(value.action).endsWith('.delete')) return <DeleteApproval locale={locale} label={confirmLabel} title={target} meta={timing || undefined}>
    <div className="flex flex-col gap-1.5 text-left">{notes}{effect && <p>{effect}</p>}</div>
  </DeleteApproval>
  return <section className={SECTION} aria-label={confirmLabel}>
    <h4 className="text-sm font-semibold">{label(value.title)}</h4>
    <p className="whitespace-pre-wrap break-words font-semibold">{target}</p>
    {timing && <p className="text-muted-foreground">{timing}</p>}
    {notes}
    {effect && <p>{effect}</p>}
  </section>
}

function FolderApproval({ value, locale }: ApprovalProps) {
  const folder = object(value.folder)
  const children = Array.isArray(value.children) ? value.children.map(object) : []
  const clips = Array.isArray(value.clips) ? value.clips.map(object) : []
  const meta = `${countLabel(children.length, locale, countForms.childFolder)} · ${countLabel(clips.length, locale, countForms.clip)}`
  return <DeleteApproval locale={locale} label={{ en: 'Confirm folder removal', ro: 'Confirmă ștergerea folderului', es: 'Confirma la eliminación de la carpeta' }[locale]} title={label(folder.name)} meta={meta}>
    <p className="text-center text-muted-foreground">{{ en: 'Contents move to the parent level.', ro: 'Conținutul se mută la nivelul părinte.', es: 'El contenido se mueve al nivel superior.' }[locale]}</p>
    {(children.length > 0 || clips.length > 0) && <ul className="max-h-40 overflow-auto rounded-[14px] border border-border p-2.5 text-left">
      {children.map(item => <li key={`folder-${label(item.id)}-${label(item.name)}`}>{label(item.name)}</li>)}
      {clips.map(item => <li key={`clip-${label(item.id)}-${label(item.title)}`}>{label(item.title)}</li>)}
    </ul>}
  </DeleteApproval>
}
