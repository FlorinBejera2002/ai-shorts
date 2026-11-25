import type { ReactNode } from 'react'
import { publishingConsentMissing } from './model'

const PLATFORM_ORDER = ['instagram', 'facebook', 'tiktok', 'youtube']
const SECTION = 'flex flex-col gap-2.5 rounded-[14px] border border-border bg-card p-3 text-xs'
const OPTION_LABELS: Record<string, [string, string]> = {
  privacyLevel: ['Privacy', 'Vizibilitate'], privacyStatus: ['Privacy', 'Vizibilitate'],
  disableComment: ['Comments disabled', 'Comentarii dezactivate'], disableDuet: ['Duets disabled', 'Duete dezactivate'], disableStitch: ['Stitch disabled', 'Stitch dezactivat'],
  autoAddMusic: ['Automatic music', 'Muzică automată'], musicUsageConfirmed: ['Music rights confirmed', 'Drepturi muzicale confirmate'],
  brandContentToggle: ['Branded content', 'Conținut de brand'], brandOrganicToggle: ['Own brand content', 'Conținut pentru brandul propriu'],
  isAigc: ['AI content declaration', 'Declarație conținut AI'], termsAccepted: ['Terms accepted', 'Termeni acceptați'],
  madeForKids: ['Made for children', 'Creat pentru copii'], containsSyntheticMedia: ['Synthetic media', 'Media sintetică'],
  notifySubscribers: ['Notify subscribers', 'Notifică abonații'], commentEnabled: ['Comments enabled', 'Comentarii activate'], shareToFeed: ['Share to feed', 'Distribuie în flux'],
  title: ['Title', 'Titlu'], description: ['Description', 'Descriere'], photoTitle: ['Photo title', 'Titlu fotografie']
}
const DATE_FORMATTERS = {
  ro: new Intl.DateTimeFormat('ro', { dateStyle: 'medium', timeStyle: 'long' }),
  en: new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'long' })
}

type ApprovalProps = { value: Record<string, unknown>; ro: boolean }

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

export function ApprovalPreview({ value, ro }: ApprovalProps) {
  const action = label(value.action)
  if (action.startsWith('studio.')) return <StudioApproval value={value} ro={ro} />
  const render = APPROVAL_RENDERERS.get(action) ?? PublishingApproval
  return <>{render({ value, ro })}</>
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
function DeleteApproval({ ro, label: ariaLabel, title, meta, children }: { ro: boolean; label: string; title: string; meta?: string; children?: ReactNode }) {
  return <section className={SECTION} aria-label={ariaLabel}>
    <div className="flex flex-col items-center gap-2 text-center">
      <img src="/illustrations/delete.webp" alt="" aria-hidden="true" width={120} height={120} loading="lazy" draggable={false} className="size-[140px] object-contain lg:size-[120px]" />
      <h4 className="break-words text-sm font-semibold">{title}</h4>
      {meta && <p className="text-muted-foreground">{meta}</p>}
    </div>
    {children}
    <p className="text-center font-semibold text-destructive">{ro ? 'Ștergerea este definitivă. Nu se poate anula.' : 'Deletion is permanent and cannot be undone.'}</p>
  </section>
}

function JobsApproval({ value, ro }: ApprovalProps) {
  return <section className={SECTION} aria-label={ro ? 'Confirmă generarea clipurilor' : 'Confirm clip generation'}>
    <h4 className="text-sm font-semibold">{ro ? 'Generează clipuri din sursa selectată' : 'Generate clips from the selected source'}</h4>
    <ApprovalRow label={ro ? 'Sursă' : 'Source'}>{label(value.source_url) || (ro ? 'Sursa media selectată' : 'Selected media source')}</ApprovalRow>
    <ApprovalRow label={ro ? 'Clipuri' : 'Clips'}>{typeof value.num_clips === 'number' ? value.num_clips : '—'} · {label(value.aspect_ratio)}</ApprovalRow>
    <ApprovalRow label="Cost">{typeof value.cost_credits === 'number' ? value.cost_credits : '—'} {ro ? 'credite' : 'credits'}</ApprovalRow>
  </section>
}

function DisconnectApproval({ value, ro }: ApprovalProps) {
  const account = object(value.account)
  return <section className={SECTION} aria-label={ro ? 'Confirmă deconectarea' : 'Confirm disconnect'}>
    <h4 className="text-sm font-semibold">{label(value.title) || label(account.name)}</h4>
    <ApprovalRow label={label(account.provider)}>{label(account.username) || '—'}</ApprovalRow>
    {label(value.effect) && <p>{label(value.effect)}</p>}
  </section>
}

function StoriesDeleteApproval({ value, ro }: ApprovalProps) {
  const meta = `${ro ? 'Versiune' : 'Version'} ${typeof value.current_version === 'number' ? value.current_version : '—'} · ${typeof value.asset_count === 'number' ? value.asset_count : 0} ${ro ? 'surse' : 'sources'}`
  return <DeleteApproval ro={ro} label={ro ? 'Confirmă ștergerea proiectului' : 'Confirm project deletion'} title={label(value.title)} meta={meta} />
}

function ClipsDeleteApproval({ value, ro }: ApprovalProps) {
  const meta = typeof value.duration === 'number' && Number.isFinite(value.duration) ? `${value.duration} s` : ''
  return <DeleteApproval ro={ro} label={ro ? 'Confirmă ștergerea clipului' : 'Confirm clip deletion'} title={label(value.title)} meta={meta} />
}

function CalendarDeleteApproval({ value, ro }: ApprovalProps) {
  const account = object(value.account)
  const meta = [label(account.provider), label(account.username)].filter(Boolean).join(' ')
  return <DeleteApproval ro={ro} label={ro ? 'Confirmă ștergerea ciornei' : 'Confirm draft deletion'} title={label(value.title) || label(account.name)} meta={meta} />
}


const PLATFORM_NAMES: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' }
const PUBLISHING_STATES: Record<string, [string, string]> = {
  connected: ['Connected', 'Conectat'], disconnected: ['Disconnected', 'Deconectat'], needs_reconnect: ['Reconnect needed', 'Necesită reconectare'],
  draft: ['Draft', 'Ciornă'], scheduled: ['Scheduled', 'Programată'], publishing: ['Publishing', 'Se publică'], published: ['Published', 'Publicată'], failed: ['Failed', 'Eșuată']
}
const platformName = (provider: string) => PLATFORM_NAMES[provider.toLowerCase()] ?? provider
const publishingState = (state: string, ro: boolean) => PUBLISHING_STATES[state]?.[ro ? 1 : 0] ?? state

function scheduleText(scheduled: string, ro: boolean): string {
  const date = new Date(scheduled)
  if (!Number.isNaN(date.getTime())) return DATE_FORMATTERS[ro ? 'ro' : 'en'].format(date)
  if (scheduled === 'Immediately after this approval') return ro ? 'Imediat după această aprobare' : 'Immediately after this approval'
  return scheduled || (ro ? 'Fără dată programată' : 'No scheduled time')
}

function PublishingApproval({ value, ro }: ApprovalProps) {
  return <section className={SECTION} aria-label={ro ? 'Detalii publicare pentru aprobare' : 'Publishing approval details'}>
    <h4 className="text-sm font-semibold">{label(value.title)}</h4>
    {label(value.caption) && <p className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{label(value.caption)}</p>}
    <PublishingSummary value={value} ro={ro} />
    <PublishingMedia value={value} />
    <PublishingDestinations value={value} ro={ro} />
    <PublishingOptions value={value} ro={ro} />
    {publishingConsentMissing(value) && <p role="alert" className="flex items-start gap-1.5 text-destructive"><WarningIcon />{ro ? 'Completează declarațiile obligatorii în Publicare.' : 'Complete the required declarations in Publishing.'}</p>}
  </section>
}

function PublishingSummary({ value, ro }: ApprovalProps) {
  const clip = object(value.clip)
  const scheduled = label(value.scheduled_at)
  const valid = !Number.isNaN(new Date(scheduled).getTime())
  return <>
    <ApprovalRow label={ro ? 'Publicare' : 'Publishing time'}>{scheduleText(scheduled, ro)}</ApprovalRow>
    {valid && <p className="text-muted-foreground">{scheduled}</p>}
    {label(value.current_status) && <ApprovalRow label={ro ? 'Stare curentă' : 'Current status'}>{publishingState(label(value.current_status), ro)}</ApprovalRow>}
    {label(value.clip_id) && <ApprovalRow label={ro ? 'Clip selectat' : 'Selected clip'}>{label(clip.title)}{typeof clip.duration === 'number' && Number.isFinite(clip.duration) ? ` · ${clip.duration} s` : ''}</ApprovalRow>}
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

function PublishingDestinations({ value, ro }: ApprovalProps) {
  const destinations = (Array.isArray(value.destinations) ? value.destinations.map(object) : [])
    .sort((a, b) => platformRank(label(a.provider)) - platformRank(label(b.provider)))
  if (!destinations.length) return null
  return <ul className="flex flex-col gap-2">{destinations.map(destination => <li key={`${label(destination.provider)}-${label(destination.id)}`} className="flex items-start justify-between gap-3 rounded-[14px] border border-border p-2.5">
    <span className="min-w-0 break-words font-semibold">{destinationTitle(destination)}<span className="block font-normal text-muted-foreground">{label(destination.username)}</span></span>
    <span className="shrink-0 text-right text-muted-foreground">{publishingState(label(destination.status), ro)}{destination.configured === false ? ` · ${ro ? 'Necesită configurare' : 'Needs configuration'}` : ''}</span>
  </li>)}</ul>
}

function PublishingOptions({ value, ro }: ApprovalProps) {
  return <>{PLATFORM_ORDER.map(provider => {
    const options = Object.entries(object(value[provider])).filter(([key]) => key in OPTION_LABELS)
    return options.length ? <details key={provider}><summary className="cursor-pointer font-semibold">{platformName(provider)}</summary><dl className="mt-2 flex flex-col gap-1.5">{options.map(([key, item]) => <div key={key} className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">{OPTION_LABELS[key][ro ? 1 : 0]}</dt><dd className="whitespace-pre-wrap break-words text-right">{typeof item === 'boolean' ? item ? (ro ? 'Da' : 'Yes') : (ro ? 'Nu' : 'No') : label(item) || '—'}</dd></div>)}</dl></details> : null
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

function studioApprovalDetails(value: Record<string, unknown>, ro: boolean) {
  const layer = object(value.layer)
  const asset = object(value.asset)
  const render = object(value.render)
  const affected = Array.isArray(value.affected_layers) ? value.affected_layers.length : 0
  const target = label(layer.text) || label(asset.name) || label(render.filename) || (ro ? 'Elementul selectat' : 'Selected layer')
  const effects: Record<string, string> = {
    'studio.layer.remove': 'Elementul selectat va fi eliminat din compoziție. Fișierele sursă rămân disponibile. Poți anula această modificare.',
    'studio.assets.delete': 'Fișierul selectat va fi șters din proiectul Studio. Elementele și stilurile care îl folosesc vor pierde această resursă. Compoziția, exporturile salvate și încărcările din afara proiectului rămân disponibile.',
    'studio.renders.delete': 'Exportul selectat și evidența randării vor fi șterse. Compoziția, sursele încărcate și celelalte exporturi rămân disponibile.'
  }
  const effect = ro ? effects[label(value.action)] || label(value.effect) : label(value.effect)
  const timing = typeof layer.start === 'number' && typeof layer.duration === 'number' ? `${layer.start} – ${layer.start + layer.duration} s` : ''
  return { target, affected, effect, timing }
}

function StudioApproval({ value, ro }: ApprovalProps) {
  const { target, affected, effect, timing } = studioApprovalDetails(value, ro)
  const notes = <>
    {affected > 0 && <p>{affected} {ro ? 'elemente au referințe directe la această resursă; pot exista și referințe în stiluri.' : 'layers reference this resource directly; styles may reference it too.'}</p>}
    {value.references_complete === false && <p className="text-muted-foreground">{ro ? 'Sunt enumerate doar referințele media directe. Fișierul poate fi folosit și în stiluri, fonturi sau elemente dinamice.' : 'Only direct media references are listed. Stylesheets, fonts or dynamic elements may also use this file.'}</p>}
  </>
  // Studio deletes are the studio.*.delete actions (assets and renders).
  if (label(value.action).endsWith('.delete')) return <DeleteApproval ro={ro} label={ro ? 'Confirmă modificarea în Studio' : 'Confirm Studio change'} title={target} meta={timing || undefined}>
    <div className="flex flex-col gap-1.5 text-left">{notes}{effect && <p>{effect}</p>}</div>
  </DeleteApproval>
  return <section className={SECTION} aria-label={ro ? 'Confirmă modificarea în Studio' : 'Confirm Studio change'}>
    <h4 className="text-sm font-semibold">{label(value.title)}</h4>
    <p className="whitespace-pre-wrap break-words font-semibold">{target}</p>
    {timing && <p className="text-muted-foreground">{timing}</p>}
    {notes}
    {effect && <p>{effect}</p>}
  </section>
}

function FolderApproval({ value, ro }: ApprovalProps) {
  const folder = object(value.folder)
  const children = Array.isArray(value.children) ? value.children.map(object) : []
  const clips = Array.isArray(value.clips) ? value.clips.map(object) : []
  const meta = `${children.length} ${ro ? 'subfoldere' : 'child folders'} · ${clips.length} ${ro ? 'clipuri' : 'clips'}`
  return <DeleteApproval ro={ro} label={ro ? 'Confirmă ștergerea folderului' : 'Confirm folder removal'} title={label(folder.name)} meta={meta}>
    <p className="text-center text-muted-foreground">{ro ? 'Conținutul se mută la nivelul părinte.' : 'Contents move to the parent level.'}</p>
    {(children.length > 0 || clips.length > 0) && <ul className="max-h-40 overflow-auto rounded-[14px] border border-border p-2.5 text-left">
      {children.map(item => <li key={`folder-${label(item.id)}-${label(item.name)}`}>{label(item.name)}</li>)}
      {clips.map(item => <li key={`clip-${label(item.id)}-${label(item.title)}`}>{label(item.title)}</li>)}
    </ul>}
  </DeleteApproval>
}
