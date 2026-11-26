import { useRef } from 'react'
import { Film, Upload } from 'lucide-react'
import type { SiteLocale } from '@/lib/site-config'
import { pickInlineText } from '@/i18n/inline-text'
import { storyIsBusy } from '@/components/story/types'
import { AgentPill } from './agent-pill'
import { FileRow, UploadRow } from './agent-ui'
import type { useAgentResources } from './use-agent-resources'
import panelStyles from './agent-panels.module.css'
import uiStyles from './agent-ui.module.css'

export function AgentResources({ resource, locale }: { resource: ReturnType<typeof useAgentResources>; locale: SiteLocale }) {
  const input = useRef<HTMLInputElement>(null)
  if (!resource.projectId) return null
  const project = resource.query.data
  const text = (english: string, romanian: string, spanish: string) => pickInlineText(locale, english, romanian, spanish)
  return <section className={panelStyles.body} aria-label={text('Project resources', 'Resursele proiectului', 'Recursos del proyecto')}>
    {project?.options.brief && <p className={`${uiStyles.hint} ${uiStyles.clamp}`}>{project.options.brief}</p>}
    {resource.query.isError && <p role="alert" className={uiStyles.error}>{text('Could not load this project.', 'Proiectul nu a putut fi încărcat.', 'No se pudo cargar este proyecto.')}</p>}
    {project && <>
      <p className={uiStyles.hint}>MP4, MOV, WebM, MKV · {project.limits ? `${Math.round(project.limits.max_file_bytes / 1024 ** 2)} MB / ${text('file', 'fișier', 'archivo')}` : ''}</p>
      <input id="agent-recordings" ref={input} type="file" multiple accept=".mp4,.mov,.webm,.mkv" className="hidden" aria-label={text('Attach recordings', 'Atașează filmări', 'Adjuntar grabaciones')} onChange={event => { resource.add(Array.from(event.target.files ?? []), locale); event.target.value = '' }} />
      <AgentPill icon={<Upload aria-hidden="true" />} disabled={storyIsBusy(project.status)} onClick={() => input.current?.click()}>{text('Choose recordings', 'Alege filmări', 'Elegir grabaciones')}</AgentPill>
      {project.assets.length > 0 && <ul className={panelStyles.list}>
        {project.assets.map(asset => <li key={asset.id}>
          <FileRow name={asset.name} icon={<Film />} status={text('Validated', 'Validat', 'Validado')} tone="success" />
        </li>)}
      </ul>}
    </>}
    {resource.error && <p role="alert" className={uiStyles.error}>{resource.error}</p>}
    {resource.uploads.items.filter(item => item.status !== 'complete').map(item => <UploadRow
      key={item.id}
      name={item.file.name}
      percent={item.status === 'validating' ? undefined : Math.round(item.bytes / item.file.size * 100)}
      status={item.status === 'validating' ? text('Validating on server…', 'Se validează pe server…', 'Validando en el servidor…') : item.status === 'failed' ? item.error : undefined}
      tone={item.status === 'failed' ? 'danger' : 'neutral'}
      note={item.projectId !== resource.projectId ? text('Attached to the original project', 'Atașat proiectului inițial', 'Adjuntado al proyecto original') : undefined}
      actions={<>
        {item.status === 'failed' && <AgentPill onClick={() => resource.uploads.retry(item.id)}>{text('Retry', 'Reîncearcă', 'Reintentar')}</AgentPill>}
        <AgentPill variant="ghost" onClick={() => resource.uploads.forget(item.id)}>{text('Cancel upload', 'Anulează încărcarea', 'Cancelar subida')}</AgentPill>
      </>}
    />)}
  </section>
}
