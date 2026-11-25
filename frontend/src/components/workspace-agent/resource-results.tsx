type ResourceRecord = Record<string, unknown>
function records(value: unknown): ResourceRecord[] {
  return Array.isArray(value) ? value.filter((item): item is ResourceRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []
}
function label(value: unknown) { return typeof value === 'string' ? value : '' }
/** Fallback key for records without an identifier: their own content, never the list position. */
function itemKey(item: ResourceRecord): string { return JSON.stringify(item) }
const ONE_DECIMAL = { ro: new Intl.NumberFormat('ro', { maximumFractionDigits: 1 }), en: new Intl.NumberFormat('en', { maximumFractionDigits: 1 }) }

const RESOURCE_KINDS: Record<string, [string, string]> = { logo: ['Logo', 'Logo'], document: ['Document', 'Document'], publishing_media: ['Publishing media', 'Media pentru publicare'], video: ['Video', 'Video'], narration: ['Narration', 'Narațiune'] }

export function ResourceResults({ data, ro }: { data: ResourceRecord; ro: boolean }) {
  if (typeof data.untrusted_text === 'string') return <UntrustedResourceText name={label(data.name)} text={data.untrusted_text} />
  return <ResourceList data={data} ro={ro} />
}

function UntrustedResourceText({ name, text }: { name: string; text: string }) {
  return <div className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs"><p className="font-medium">{name}</p><p className="max-h-48 overflow-auto whitespace-pre-wrap">{text}</p></div>
}

function ResourceList({ data, ro }: { data: ResourceRecord; ro: boolean }) {
  const items = records(data.items)
  return <ul className="max-h-64 space-y-2 overflow-auto rounded-[14px] border border-border bg-card p-3 text-xs">
    {!items.length && <li className="text-muted-foreground">{label(data.name) || (ro ? 'Nicio resursă găsită.' : 'No resources found.')}</li>}
    {items.map(item => <li key={label(item.id) || `${label(item.kind)}-${label(item.name)}`}><p className="font-medium">{label(item.name) || (ro ? 'Resursă fără nume' : 'Unnamed resource')}</p><p className="text-muted-foreground">{RESOURCE_KINDS[label(item.kind)]?.[ro ? 1 : 0]}{typeof item.duration === 'number' ? ` · ${ONE_DECIMAL[ro ? 'ro' : 'en'].format(item.duration)} s` : ''}</p></li>)}
    {data.has_more === true && <li className="text-muted-foreground">{ro ? 'Mai sunt rezultate. Cere agentului pagina următoare.' : 'More results are available. Ask the agent for the next page.'}</li>}
  </ul>
}

const RENDER_STATES: Record<string, [string, string]> = { complete: ['Completed', 'Finalizat'], rendering: ['Rendering', 'Se randează'], failed: ['Failed', 'Eșuat'], cancelled: ['Stopped', 'Oprit'] }

export function StudioResults({ data, ro }: { data: ResourceRecord; ro: boolean }) {
  const assets = records(data.assets)
  const layers = records(data.layers)
  const renders = records(data.renders)
  if (!hasStudioContent(data, assets, layers, renders)) return null
  return <section className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs" aria-label={ro ? 'Rezultat Studio' : 'Studio result'}>
    <StudioSummary data={data} ro={ro} />
    {assets.length > 0 && <StudioAssetList assets={assets} />}
    {data.has_more === true && <p className="text-muted-foreground">{ro ? 'Mai sunt resurse. Cere agentului pagina următoare.' : 'More assets are available. Ask the agent for the next page.'}</p>}
    {layers.length > 0 && <StudioLayerList layers={layers} ro={ro} />}
    {renders.length > 0 && <StudioRenderList renders={renders} ro={ro} />}
  </section>
}

function studioAsset(data: ResourceRecord): ResourceRecord | undefined {
  return data.asset && typeof data.asset === 'object' ? data.asset as ResourceRecord : undefined
}

function hasStudioContent(data: ResourceRecord, ...lists: ResourceRecord[][]): boolean {
  return lists.some(list => list.length > 0) || Boolean(studioAsset(data)) || Boolean(label(data.title) || label(data.name)) || data.verified === true
}

/** Title, verified-export line and the single asset of a Studio result. */
function StudioSummary({ data, ro }: { data: ResourceRecord; ro: boolean }) {
  const title = label(data.title) || label(data.name)
  const asset = studioAsset(data)
  const size = typeof data.bytes === 'number' ? ` · ${ONE_DECIMAL[ro ? 'ro' : 'en'].format(data.bytes / 1024 ** 2)} MB` : ''
  return <>
    {title && <p className="font-medium">{title}</p>}
    {data.verified === true && <p>{ro ? 'Export verificat' : 'Verified export'}{size}</p>}
    {asset && <p>{label(asset.name)}</p>}
  </>
}

function StudioAssetList({ assets }: { assets: ResourceRecord[] }) {
  return <ul className="max-h-48 space-y-1 overflow-auto">{assets.map(item => <li key={label(item.asset_id) || itemKey(item)}>{label(item.name)}</li>)}</ul>
}

function StudioLayerList({ layers, ro }: { layers: ResourceRecord[]; ro: boolean }) {
  return <>
    <p className="text-muted-foreground">{layers.length} {ro ? 'elemente în compoziție' : 'composition layers'}</p>
    <ul className="max-h-48 space-y-1 overflow-auto">{layers.filter(item => label(item.text) || label(item.name)).map(item => <li key={label(item.id) || itemKey(item)}>{label(item.name) || label(item.text)}</li>)}</ul>
  </>
}

function StudioRenderList({ renders, ro }: { renders: ResourceRecord[]; ro: boolean }) {
  return <ul className="max-h-48 space-y-1 overflow-auto">{renders.map((item, index) => <li key={label(item.id) || itemKey(item)}>{label(item.name) || `Export ${index + 1}`} · {RENDER_STATES[label(item.status)]?.[ro ? 1 : 0] || label(item.format)}</li>)}</ul>
}
