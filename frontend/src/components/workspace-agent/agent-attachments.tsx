import { useRef } from 'react'
import { FileText, Image as ImageIcon, ImagePlus, Upload, X } from 'lucide-react'
import { PUBLISHING_FILE_ACCEPT } from '@/components/calendar/publishing-media-utils'
import { AgentPill } from './agent-pill'
import { AgentIconButton, FileRow, UploadRow } from './agent-ui'
import type { AttachmentTarget } from './attachment-target'
import type { useAgentAttachments } from './use-agent-attachments'
import panelStyles from './agent-panels.module.css'
import uiStyles from './agent-ui.module.css'

type Attachments = ReturnType<typeof useAgentAttachments>

const IMAGE_NAME = /\.(png|jpe?g|webp|gif)$/i

function FilePicker({ attachments, ro, logo, document, target }: {
  attachments: Attachments; ro: boolean; logo: boolean; document: boolean; target?: AttachmentTarget
}) {
  const picker = useRef<HTMLInputElement>(null)
  const accept = [logo ? 'image/png,image/jpeg,image/webp' : '', document ? '.txt,.md' : ''].filter(Boolean).join(',')
  const description = [logo ? 'PNG, JPEG, WebP · 5 MB' : '', document ? (ro ? 'TXT, Markdown · 20.000 caractere' : 'TXT, Markdown · 20,000 characters') : ''].filter(Boolean).join(' · ')
  const buttonLabel = logo && !document ? (ro ? 'Încarcă logo-ul' : 'Upload logo') : (ro ? 'Alege fișiere' : 'Choose files')
  return <div className={uiStyles.stack}>
    <p className={uiStyles.hint}>{description}</p>
    <input ref={picker} type="file" multiple accept={accept} className="hidden" aria-label={ro ? 'Atașează logo sau document' : 'Attach logo or document'} onChange={event => { void attachments.add(Array.from(event.target.files ?? []), ro, false, target); event.target.value = '' }} />
    <AgentPill icon={<Upload aria-hidden="true" />} disabled={Boolean(attachments.pending)} onClick={() => picker.current?.click()}>{buttonLabel}</AgentPill>
  </div>
}

function PublishingPicker({ attachments, ro }: { attachments: Attachments; ro: boolean }) {
  const picker = useRef<HTMLInputElement>(null)
  return <div className={uiStyles.stack}>
    <input ref={picker} type="file" multiple accept={PUBLISHING_FILE_ACCEPT} className="hidden" aria-label={ro ? 'Atașează media pentru publicare' : 'Attach publishing media'} onChange={event => { void attachments.add(Array.from(event.target.files ?? []), ro, true); event.target.value = '' }} />
    <AgentPill icon={<ImagePlus aria-hidden="true" />} disabled={Boolean(attachments.pending)} onClick={() => picker.current?.click()}>{ro ? 'Media pentru publicare' : 'Publishing media'}</AgentPill>
  </div>
}

function AttachedFiles({ attachments, ro }: { attachments: Attachments; ro: boolean }) {
  return <>
    {attachments.pending && <div role="status">
      <UploadRow
        name={attachments.pending}
        status={ro ? 'Se încarcă…' : 'Uploading…'}
        actions={<AgentPill variant="ghost" onClick={attachments.cancel}>{ro ? 'Anulează' : 'Cancel'}</AgentPill>}
      />
    </div>}
    {attachments.error && <p role="alert" className={uiStyles.error}>{attachments.error}</p>}
    {attachments.resources.length > 0 && <ul className={panelStyles.list}>
      {attachments.resources.map(resource => <li key={resource.id}>
        <FileRow
          name={resource.name}
          icon={IMAGE_NAME.test(resource.name) ? <ImageIcon /> : <FileText />}
          action={<AgentIconButton label={`${ro ? 'Elimină' : 'Remove'} ${resource.name}`} onClick={() => attachments.remove(resource.id)}><X /></AgentIconButton>}
        />
      </li>)}
    </ul>}
  </>
}

export function AgentAttachments({ attachments, ro, kinds, target }: { attachments: Attachments; ro: boolean; kinds?: string[]; target?: AttachmentTarget }) {
  const logo = !kinds || kinds.includes('logo')
  const document = !kinds || kinds.includes('document')
  const publishing = !kinds || kinds.includes('publishing_media')
  return <section className={panelStyles.body} aria-label={ro ? 'Resurse pentru agent' : 'Agent resources'}>
    {target?.ambiguous ? <p className={uiStyles.hint}>{ro ? 'Precizează proiectul pentru aceste fișiere în conversație.' : 'Identify the project for these files in the conversation.'}</p> : (logo || document) && <FilePicker attachments={attachments} ro={ro} logo={logo} document={document} target={target} />}
    {publishing && <PublishingPicker attachments={attachments} ro={ro} />}
    <AttachedFiles attachments={attachments} ro={ro} />
  </section>
}
