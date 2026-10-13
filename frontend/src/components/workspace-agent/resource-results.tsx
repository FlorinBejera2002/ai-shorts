type ResourceRecord = Record<string, unknown>
function records(value: unknown): ResourceRecord[] {
  return Array.isArray(value) ? value.filter((item): item is ResourceRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []
}
function label(value: unknown) { return typeof value === 'string' ? value : '' }

export function ResourceResults({ data, ro }: { data: ResourceRecord; ro: boolean }) {
  const items = records(data.items)
  const kinds: Record<string, [string, string]> = { logo: ['Logo', 'Logo'], document: ['Document', 'Document'], publishing_media: ['Publishing media', 'Media pentru publicare'], video: ['Video', 'Video'], narration: ['Narration', 'Narațiune'] }
  if (typeof data.untrusted_text === 'string') return <div className="space-y-2 rounded-md border p-3 text-xs"><p className="font-medium">{label(data.name)}</p><p className="max-h-48 overflow-auto whitespace-pre-wrap">{data.untrusted_text}</p></div>
  return <ul className="max-h-64 space-y-2 overflow-auto rounded-md border p-3 text-xs">
    {!items.length && <li className="text-muted-foreground">{label(data.name) || (ro ? 'Nicio resursă găsită.' : 'No resources found.')}</li>}
    {items.map((item, index) => <li key={label(item.id) || index}><p className="font-medium">{label(item.name) || (ro ? 'Resursă fără nume' : 'Unnamed resource')}</p><p className="text-muted-foreground">{kinds[label(item.kind)]?.[ro ? 1 : 0]}{typeof item.duration === 'number' ? ` · ${new Intl.NumberFormat(ro ? 'ro' : 'en', { maximumFractionDigits: 1 }).format(item.duration)} s` : ''}</p></li>)}
    {data.has_more === true && <li className="text-muted-foreground">{ro ? 'Mai sunt rezultate. Cere agentului pagina următoare.' : 'More results are available. Ask the agent for the next page.'}</li>}
  </ul>
}

export function StudioResults({ data, ro }: { data: ResourceRecord; ro: boolean }) {
  const assets = records(data.assets)
  const layers = records(data.layers)
  const renders = records(data.renders)
  const asset = data.asset && typeof data.asset === 'object' ? data.asset as ResourceRecord : undefined
  const bytes = typeof data.bytes === 'number' ? data.bytes : undefined
  const title = label(data.title) || label(data.name)
  const stateLabels: Record<string, [string, string]> = { complete: ['Completed', 'Finalizat'], rendering: ['Rendering', 'Se randează'], failed: ['Failed', 'Eșuat'], cancelled: ['Stopped', 'Oprit'] }
  if (!assets.length && !layers.length && !renders.length && !asset && !title && data.verified !== true) return null
  return <section className="space-y-2 rounded-md border p-3 text-xs" aria-label={ro ? 'Rezultat Studio' : 'Studio result'}>
    {title && <p className="font-medium">{title}</p>}
    {data.verified === true && <p>{ro ? 'Export verificat' : 'Verified export'}{bytes === undefined ? '' : ` · ${new Intl.NumberFormat(ro ? 'ro' : 'en', { maximumFractionDigits: 1 }).format(bytes / 1024 ** 2)} MB`}</p>}
    {asset && <p>{label(asset.name)}</p>}
    {assets.length > 0 && <ul className="max-h-48 space-y-1 overflow-auto">{assets.map((item, index) => <li key={label(item.asset_id) || index}>{label(item.name)}</li>)}</ul>}
    {data.has_more === true && <p className="text-muted-foreground">{ro ? 'Mai sunt resurse. Cere agentului pagina următoare.' : 'More assets are available. Ask the agent for the next page.'}</p>}
    {layers.length > 0 && <><p className="text-muted-foreground">{layers.length} {ro ? 'elemente în compoziție' : 'composition layers'}</p><ul className="max-h-48 space-y-1 overflow-auto">{layers.filter(item => label(item.text) || label(item.name)).map((item, index) => <li key={index}>{label(item.name) || label(item.text)}</li>)}</ul></>}
    {renders.length > 0 && <ul className="max-h-48 space-y-1 overflow-auto">{renders.map((item, index) => <li key={index}>{label(item.name) || `${ro ? 'Export' : 'Export'} ${index + 1}`} · {stateLabels[label(item.status)]?.[ro ? 1 : 0] || label(item.format)}</li>)}</ul>}
  </section>
}
