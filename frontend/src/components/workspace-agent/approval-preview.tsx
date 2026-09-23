import { publishingConsentMissing } from './model'

function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function label(value: unknown): string { return typeof value === 'string' ? value : '' }
export function ApprovalPreview({ value, ro }: { value: Record<string, unknown>; ro: boolean }) {
  if (value.action === 'jobs.create') return <section className="space-y-2 rounded-md border p-3 text-xs" aria-label={ro ? 'Confirmă generarea clipurilor' : 'Confirm clip generation'}>
    <h4 className="text-sm font-semibold">{ro ? 'Generează clipuri din sursa selectată' : 'Generate clips from the selected source'}</h4>
    <p>{label(value.source_type)} · {label(value.source_url) || label(value.asset_id)}</p>
    <p>{typeof value.num_clips === 'number' ? value.num_clips : '—'} {ro ? 'clipuri' : 'clips'} · {label(value.aspect_ratio)}</p>
    <p className="font-medium">{typeof value.cost_credits === 'number' ? value.cost_credits : '—'} {ro ? 'credite' : 'credits'}</p>
  </section>
  if (value.action === 'publishing.disconnect' || value.action === 'calendar.delete') {
    const account = object(value.account)
    return <section className="space-y-2 rounded-md border p-3 text-xs" aria-label={ro ? 'Confirmă acțiunea definitivă' : 'Confirm irreversible action'}>
      <h4 className="text-sm font-semibold">{label(value.title) || label(account.name)}</h4>
      <p>{label(account.provider)} {label(account.username)}</p>
      <p className="break-all text-muted-foreground">{label(value.post_id) || label(account.id)}</p>
      {label(value.caption) && <p className="whitespace-pre-wrap">{label(value.caption)}</p>}
      <p>{label(value.effect)}</p><p className="font-medium text-destructive">{ro ? 'Această acțiune nu are Undo.' : 'This action has no Undo.'}</p>
    </section>
  }
  if (value.action === 'stories.delete') return <section className="space-y-2 rounded-md border p-3 text-xs" aria-label={ro ? 'Confirmă ștergerea poveștii' : 'Confirm story deletion'}>
    <h4 className="text-sm font-semibold">{label(value.title)}</h4><p className="break-all text-muted-foreground">{label(value.story_id)}</p>
    <p>{ro ? 'Versiune' : 'Version'}: {typeof value.current_version === 'number' ? value.current_version : '—'} · {typeof value.asset_count === 'number' ? value.asset_count : 0} {ro ? 'surse' : 'sources'}</p>
    <p>{label(value.effect)}</p><p className="font-medium text-destructive">{ro ? 'Ștergerea este definitivă și nu poate fi anulată.' : 'Deletion is permanent and cannot be undone.'}</p>
  </section>
  if (value.action === 'clips.delete') return <section className="space-y-2 rounded-md border p-3 text-xs" aria-label={ro ? 'Confirmă ștergerea clipului' : 'Confirm clip deletion'}>
    <h4 className="text-sm font-semibold">{label(value.title)}</h4>
    <p className="break-all text-muted-foreground">{label(value.clip_id)}</p>
    {typeof value.duration === 'number' && Number.isFinite(value.duration) && <p>{value.duration} s</p>}
    <p>{label(value.effect)}</p>
    {value.irreversible === true && <p className="font-medium text-destructive">{ro ? 'Ștergerea este definitivă și nu poate fi anulată.' : 'Deletion is permanent and cannot be undone.'}</p>}
  </section>
  if (value.action === 'folders.delete') return <FolderApproval value={value} ro={ro} />
  const destinations = Array.isArray(value.destinations) ? value.destinations.map(object) : []
  const media = Array.isArray(value.media) ? value.media.map(object) : []
  const clip = object(value.clip)
  const scheduled = label(value.scheduled_at)
  const date = new Date(scheduled)
  const scheduleLabel = Number.isNaN(date.getTime()) ? scheduled === 'Immediately after this approval' ? (ro ? 'Imediat după această aprobare' : 'Immediately after this approval') : scheduled || (ro ? 'Fără dată programată' : 'No scheduled time') : new Intl.DateTimeFormat(ro ? 'ro' : 'en', { dateStyle: 'medium', timeStyle: 'long' }).format(date)
  const consentMissing = publishingConsentMissing(value)
  const optionLabels: Record<string, [string, string]> = {
    privacyLevel: ['Privacy', 'Vizibilitate'], privacyStatus: ['Privacy', 'Vizibilitate'],
    disableComment: ['Comments disabled', 'Comentarii dezactivate'], disableDuet: ['Duets disabled', 'Duete dezactivate'], disableStitch: ['Stitch disabled', 'Stitch dezactivat'],
    autoAddMusic: ['Automatic music', 'Muzică automată'], musicUsageConfirmed: ['Music rights confirmed', 'Drepturi muzicale confirmate'],
    brandContentToggle: ['Branded content', 'Conținut de brand'], brandOrganicToggle: ['Own brand content', 'Conținut pentru brandul propriu'],
    isAigc: ['AI content declaration', 'Declarație conținut AI'], termsAccepted: ['Terms accepted', 'Termeni acceptați'],
    madeForKids: ['Made for children', 'Creat pentru copii'], containsSyntheticMedia: ['Synthetic media', 'Media sintetică'],
    notifySubscribers: ['Notify subscribers', 'Notifică abonații'], commentEnabled: ['Comments enabled', 'Comentarii activate'], shareToFeed: ['Share to feed', 'Distribuie în flux'],
    title: ['Title', 'Titlu'], description: ['Description', 'Descriere'], photoTitle: ['Photo title', 'Titlu fotografie']
  }
  return <section className="space-y-3 rounded-md border p-3 text-xs" aria-label={ro ? 'Detalii publicare pentru aprobare' : 'Publishing approval details'}>
    <h4 className="text-sm font-semibold">{label(value.title)}</h4>
    {label(value.caption) && <p className="max-h-48 overflow-auto whitespace-pre-wrap">{label(value.caption)}</p>}
    <dl className="space-y-2"><div><dt className="font-medium">{ro ? 'Publicare' : 'Publishing time'}</dt><dd>{scheduleLabel}</dd>{!Number.isNaN(date.getTime()) && <dd className="text-muted-foreground">{scheduled}</dd>}</div>
      <div><dt className="font-medium">{ro ? 'Stare curentă' : 'Current status'}</dt><dd>{label(value.current_status)}</dd></div>
      {label(value.clip_id) && <div><dt className="font-medium">{ro ? 'Clip selectat' : 'Selected clip'}</dt><dd>{label(clip.title)}{typeof clip.duration === 'number' && Number.isFinite(clip.duration) ? ` · ${clip.duration} s` : ''}</dd><dd className="break-all text-muted-foreground">{label(value.clip_id)}</dd></div>}
    </dl>
    <ul className="space-y-1">{destinations.map((destination, index) => <li key={label(destination.id) || index}><span className="font-medium">{label(destination.provider)} · {label(destination.name)}</span> {label(destination.username)} · {label(destination.status)}{destination.configured === false ? ` · ${ro ? 'Necesită configurare' : 'Needs configuration'}` : ''}</li>)}</ul>
    <ul>{media.map((item, index) => <li key={index}>{label(item.name)} · {label(item.type)}</li>)}</ul>
    {['tiktok', 'youtube', 'instagram'].map(provider => {
      const options = Object.entries(object(value[provider])).filter(([key]) => key in optionLabels)
      return options.length ? <details key={provider}><summary className="font-medium">{provider}</summary><dl className="mt-2 space-y-1">{options.map(([key, item]) => <div key={key}><dt>{optionLabels[key][ro ? 1 : 0]}</dt><dd className="whitespace-pre-wrap text-muted-foreground">{typeof item === 'boolean' ? item ? (ro ? 'Da' : 'Yes') : (ro ? 'Nu' : 'No') : label(item) || '—'}</dd></div>)}</dl></details> : null
    })}
    {consentMissing && <p role="alert" className="text-destructive">{ro ? 'Completează declarațiile obligatorii în Publicare, apoi cere agentului să verifice din nou postarea.' : 'Complete the required declarations in Publishing, then ask the agent to inspect this post again.'}</p>}
    <p className="text-muted-foreground">{ro ? 'Aprobarea autorizează acțiunea afișată. Confirmarea publicării vine din starea platformei de destinație.' : 'Approval authorizes the action shown. Publication is confirmed by the destination platform status.'}</p>
  </section>
}

function FolderApproval({ value, ro }: { value: Record<string, unknown>; ro: boolean }) {
  const folder = object(value.folder)
  const children = Array.isArray(value.children) ? value.children.map(object) : []
  const clips = Array.isArray(value.clips) ? value.clips.map(object) : []
  return <section className="space-y-2 rounded-md border p-3 text-xs" aria-label={ro ? 'Confirmă ștergerea folderului' : 'Confirm folder removal'}>
    <h4 className="text-sm font-semibold">{label(folder.name)}</h4><p>{label(value.project_name)}</p>
    <p>{ro ? 'Folderul va fi șters. Subfolderele și clipurile de mai jos vor fi mutate la nivelul părinte; fișierele video rămân intacte. Această ștergere nu are Undo.' : 'This folder will be removed. The child folders and clips below move to its parent; video files remain intact. This removal has no Undo.'}</p>
    <p>{ro ? 'Destinație' : 'Destination'}: {label(folder.parent_id) || (ro ? 'Rădăcina proiectului' : 'Project root')}</p>
    <p>{children.length} {ro ? 'subfoldere' : 'child folders'} · {clips.length} {ro ? 'clipuri' : 'clips'}</p>
    <ul className="max-h-40 overflow-auto">{children.map(item => <li key={label(item.id)}>{label(item.name)} · {label(item.id)}</li>)}{clips.map(item => <li key={label(item.id)}>{label(item.title)} · {label(item.id)}</li>)}</ul>
  </section>
}
