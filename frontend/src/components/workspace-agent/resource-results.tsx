import type { SiteLocale } from '@/lib/site-config'
import type { Localized } from './model'

type ResourceRecord = Record<string, unknown>
function records(value: unknown): ResourceRecord[] {
  return Array.isArray(value) ? value.filter((item): item is ResourceRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item)) : []
}
function label(value: unknown) { return typeof value === 'string' ? value : '' }
/** Fallback key for records without an identifier: their own content, never the list position. */
function itemKey(item: ResourceRecord): string { return JSON.stringify(item) }
const ONE_DECIMAL: Record<SiteLocale, Intl.NumberFormat> = {
  en: new Intl.NumberFormat('en', { maximumFractionDigits: 1 }),
  ro: new Intl.NumberFormat('ro', { maximumFractionDigits: 1 }),
  es: new Intl.NumberFormat('es', { maximumFractionDigits: 1 })
}

const RESOURCE_KINDS: Record<string, Localized> = {
  logo: { en: 'Logo', ro: 'Logo', es: 'Logotipo' },
  document: { en: 'Document', ro: 'Document', es: 'Documento' },
  publishing_media: { en: 'Publishing media', ro: 'Media pentru publicare', es: 'Medios para publicar' },
  video: { en: 'Video', ro: 'Video', es: 'Video' },
  narration: { en: 'Narration', ro: 'Narațiune', es: 'Narración' }
}

export function ResourceResults({ data, locale }: { data: ResourceRecord; locale: SiteLocale }) {
  if (typeof data.untrusted_text === 'string') return <UntrustedResourceText name={label(data.name)} text={data.untrusted_text} />
  return <ResourceList data={data} locale={locale} />
}

function UntrustedResourceText({ name, text }: { name: string; text: string }) {
  return <div className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs"><p className="font-medium">{name}</p><p className="max-h-48 overflow-auto whitespace-pre-wrap">{text}</p></div>
}

function ResourceList({ data, locale }: { data: ResourceRecord; locale: SiteLocale }) {
  const items = records(data.items)
  return <ul className="max-h-64 space-y-2 overflow-auto rounded-[14px] border border-border bg-card p-3 text-xs">
    {!items.length && <li className="text-muted-foreground">{label(data.name) || { en: 'No resources found.', ro: 'Nicio resursă găsită.', es: 'No se encontraron recursos.' }[locale]}</li>}
    {items.map(item => <li key={label(item.id) || `${label(item.kind)}-${label(item.name)}`}><p className="font-medium">{label(item.name) || { en: 'Unnamed resource', ro: 'Resursă fără nume', es: 'Recurso sin nombre' }[locale]}</p><p className="text-muted-foreground">{RESOURCE_KINDS[label(item.kind)]?.[locale]}{typeof item.duration === 'number' ? ` · ${ONE_DECIMAL[locale].format(item.duration)} s` : ''}</p></li>)}
    {data.has_more === true && <li className="text-muted-foreground">{{ en: 'More results are available. Ask the agent for the next page.', ro: 'Mai sunt rezultate. Cere agentului pagina următoare.', es: 'Hay más resultados. Pide al agente la página siguiente.' }[locale]}</li>}
  </ul>
}

const RENDER_STATES: Record<string, Localized> = {
  complete: { en: 'Completed', ro: 'Finalizat', es: 'Completado' },
  rendering: { en: 'Rendering', ro: 'Se randează', es: 'Renderizando' },
  failed: { en: 'Failed', ro: 'Eșuat', es: 'Fallido' },
  cancelled: { en: 'Stopped', ro: 'Oprit', es: 'Detenido' }
}

export function StudioResults({ data, locale }: { data: ResourceRecord; locale: SiteLocale }) {
  const assets = records(data.assets)
  const layers = records(data.layers)
  const renders = records(data.renders)
  if (!hasStudioContent(data, assets, layers, renders)) return null
  return <section className="space-y-2 rounded-[14px] border border-border bg-card p-3 text-xs" aria-label={{ en: 'Studio result', ro: 'Rezultat Studio', es: 'Resultado de Studio' }[locale]}>
    <StudioSummary data={data} locale={locale} />
    {assets.length > 0 && <StudioAssetList assets={assets} />}
    {data.has_more === true && <p className="text-muted-foreground">{{ en: 'More assets are available. Ask the agent for the next page.', ro: 'Mai sunt resurse. Cere agentului pagina următoare.', es: 'Hay más recursos. Pide al agente la página siguiente.' }[locale]}</p>}
    {layers.length > 0 && <StudioLayerList layers={layers} locale={locale} />}
    {renders.length > 0 && <StudioRenderList renders={renders} locale={locale} />}
  </section>
}

function studioAsset(data: ResourceRecord): ResourceRecord | undefined {
  return data.asset && typeof data.asset === 'object' ? data.asset as ResourceRecord : undefined
}

function hasStudioContent(data: ResourceRecord, ...lists: ResourceRecord[][]): boolean {
  return lists.some(list => list.length > 0) || Boolean(studioAsset(data)) || Boolean(label(data.title) || label(data.name)) || data.verified === true
}

/** Title, verified-export line and the single asset of a Studio result. */
function StudioSummary({ data, locale }: { data: ResourceRecord; locale: SiteLocale }) {
  const title = label(data.title) || label(data.name)
  const asset = studioAsset(data)
  const size = typeof data.bytes === 'number' ? ` · ${ONE_DECIMAL[locale].format(data.bytes / 1024 ** 2)} MB` : ''
  return <>
    {title && <p className="font-medium">{title}</p>}
    {data.verified === true && <p>{{ en: 'Verified export', ro: 'Export verificat', es: 'Exportación verificada' }[locale]}{size}</p>}
    {asset && <p>{label(asset.name)}</p>}
  </>
}

function StudioAssetList({ assets }: { assets: ResourceRecord[] }) {
  return <ul className="max-h-48 space-y-1 overflow-auto">{assets.map(item => <li key={label(item.asset_id) || itemKey(item)}>{label(item.name)}</li>)}</ul>
}

function StudioLayerList({ layers, locale }: { layers: ResourceRecord[]; locale: SiteLocale }) {
  return <>
    <p className="text-muted-foreground">{layers.length} {{ en: 'composition layers', ro: 'elemente în compoziție', es: 'capas de la composición' }[locale]}</p>
    <ul className="max-h-48 space-y-1 overflow-auto">{layers.filter(item => label(item.text) || label(item.name)).map(item => <li key={label(item.id) || itemKey(item)}>{label(item.name) || label(item.text)}</li>)}</ul>
  </>
}

function StudioRenderList({ renders, locale }: { renders: ResourceRecord[]; locale: SiteLocale }) {
  return <ul className="max-h-48 space-y-1 overflow-auto">{renders.map((item, index) => <li key={label(item.id) || itemKey(item)}>{label(item.name) || `Export ${index + 1}`} · {RENDER_STATES[label(item.status)]?.[locale] || label(item.format)}</li>)}</ul>
}
