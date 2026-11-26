import { useRef } from 'react'
import { FileText, Image as ImageIcon, ImagePlus, Upload, X } from 'lucide-react'
import type { SiteLocale } from '@/lib/site-config'
import { PUBLISHING_FILE_ACCEPT } from '@/components/calendar/publishing-media-utils'
import { AgentPill } from './agent-pill'
import { AgentIconButton, FileRow, UploadRow } from './agent-ui'
import type { AttachmentTarget } from './attachment-target'
import type { useAgentAttachments } from './use-agent-attachments'
import panelStyles from './agent-panels.module.css'
import uiStyles from './agent-ui.module.css'

type Attachments = ReturnType<typeof useAgentAttachments>

const IMAGE_NAME = /\.(png|jpe?g|webp|gif)$/i

function FilePicker({ attachments, locale, logo, document, target }: {
  attachments: Attachments; locale: SiteLocale; logo: boolean; document: boolean; target?: AttachmentTarget
}) {
  const picker = useRef<HTMLInputElement>(null)
  const accept = [logo ? 'image/png,image/jpeg,image/webp' : '', document ? '.txt,.md' : ''].filter(Boolean).join(',')
  const documentHint = { en: 'TXT, Markdown · 20,000 characters', ro: 'TXT, Markdown · 20.000 caractere', es: 'TXT, Markdown · 20.000 caracteres' }[locale]
  const description = [logo ? 'PNG, JPEG, WebP · 5 MB' : '', document ? documentHint : ''].filter(Boolean).join(' · ')
  const buttonLabel = logo && !document
    ? { en: 'Upload logo', ro: 'Încarcă logo-ul', es: 'Subir logotipo' }[locale]
    : { en: 'Choose files', ro: 'Alege fișiere', es: 'Elegir archivos' }[locale]
  return <div className={uiStyles.stack}>
    <p className={uiStyles.hint}>{description}</p>
    <input ref={picker} type="file" multiple accept={accept} className="hidden" aria-label={{ en: 'Attach logo or document', ro: 'Atașează logo sau document', es: 'Adjuntar logotipo o documento' }[locale]} onChange={event => { void attachments.add(Array.from(event.target.files ?? []), locale, false, target); event.target.value = '' }} />
    <AgentPill icon={<Upload aria-hidden="true" />} disabled={Boolean(attachments.pending)} onClick={() => picker.current?.click()}>{buttonLabel}</AgentPill>
  </div>
}

function PublishingPicker({ attachments, locale }: { attachments: Attachments; locale: SiteLocale }) {
  const picker = useRef<HTMLInputElement>(null)
  return <div className={uiStyles.stack}>
    <input ref={picker} type="file" multiple accept={PUBLISHING_FILE_ACCEPT} className="hidden" aria-label={{ en: 'Attach publishing media', ro: 'Atașează media pentru publicare', es: 'Adjuntar medios para publicar' }[locale]} onChange={event => { void attachments.add(Array.from(event.target.files ?? []), locale, true); event.target.value = '' }} />
    <AgentPill icon={<ImagePlus aria-hidden="true" />} disabled={Boolean(attachments.pending)} onClick={() => picker.current?.click()}>{{ en: 'Publishing media', ro: 'Media pentru publicare', es: 'Medios para publicar' }[locale]}</AgentPill>
  </div>
}

function AttachedFiles({ attachments, locale }: { attachments: Attachments; locale: SiteLocale }) {
  const removeLabel = { en: 'Remove', ro: 'Elimină', es: 'Quitar' }[locale]
  return <>
    {attachments.pending && <div role="status">
      <UploadRow
        name={attachments.pending}
        status={{ en: 'Uploading…', ro: 'Se încarcă…', es: 'Subiendo…' }[locale]}
        actions={<AgentPill variant="ghost" onClick={attachments.cancel}>{{ en: 'Cancel', ro: 'Anulează', es: 'Cancelar' }[locale]}</AgentPill>}
      />
    </div>}
    {attachments.error && <p role="alert" className={uiStyles.error}>{attachments.error}</p>}
    {attachments.resources.length > 0 && <ul className={panelStyles.list}>
      {attachments.resources.map(resource => <li key={resource.id}>
        <FileRow
          name={resource.name}
          icon={IMAGE_NAME.test(resource.name) ? <ImageIcon /> : <FileText />}
          action={<AgentIconButton label={`${removeLabel} ${resource.name}`} onClick={() => attachments.remove(resource.id)}><X /></AgentIconButton>}
        />
      </li>)}
    </ul>}
  </>
}

export function AgentAttachments({ attachments, locale, kinds, target }: { attachments: Attachments; locale: SiteLocale; kinds?: string[]; target?: AttachmentTarget }) {
  const logo = !kinds || kinds.includes('logo')
  const document = !kinds || kinds.includes('document')
  const publishing = !kinds || kinds.includes('publishing_media')
  return <section className={panelStyles.body} aria-label={{ en: 'Agent resources', ro: 'Resurse pentru agent', es: 'Recursos para el agente' }[locale]}>
    {target?.ambiguous
      ? <p className={uiStyles.hint}>{{ en: 'Identify the project for these files in the conversation.', ro: 'Precizează proiectul pentru aceste fișiere în conversație.', es: 'Indica el proyecto de estos archivos en la conversación.' }[locale]}</p>
      : (logo || document) && <FilePicker attachments={attachments} locale={locale} logo={logo} document={document} target={target} />}
    {publishing && <PublishingPicker attachments={attachments} locale={locale} />}
    <AttachedFiles attachments={attachments} locale={locale} />
  </section>
}
