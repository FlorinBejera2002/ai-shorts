import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { useAgentAttachments } from './use-agent-attachments'
import { PUBLISHING_FILE_ACCEPT } from '@/components/calendar/publishing-media-utils'
import type { AttachmentTarget } from './attachment-target'

type Attachments = ReturnType<typeof useAgentAttachments>

function FilePicker({ attachments, ro, logo, document, target }: {
  attachments: Attachments; ro: boolean; logo: boolean; document: boolean; target?: AttachmentTarget
}) {
  const picker = useRef<HTMLInputElement>(null)
  const accept = [logo ? 'image/png,image/jpeg,image/webp' : '', document ? '.txt,.md' : ''].filter(Boolean).join(',')
  const description = [logo ? 'PNG, JPEG, WebP · 5 MB' : '', document ? (ro ? 'TXT, Markdown · 20.000 caractere' : 'TXT, Markdown · 20,000 characters') : ''].filter(Boolean).join(' / ')
  const buttonLabel = logo && !document ? (ro ? 'Încarcă logo-ul' : 'Upload logo') : (ro ? 'Alege fișiere' : 'Choose files')
  return <div className="space-y-2">
    <p className="text-muted-foreground">{description}</p>
    <input ref={picker} type="file" multiple accept={accept} className="hidden" aria-label={ro ? 'Atașează logo sau document' : 'Attach logo or document'} onChange={event => { void attachments.add(Array.from(event.target.files ?? []), ro, false, target); event.target.value = '' }} />
    <Button size="sm" variant="outline" disabled={Boolean(attachments.pending)} onClick={() => picker.current?.click()}>{buttonLabel}</Button>
  </div>
}

function PublishingPicker({ attachments, ro }: { attachments: Attachments; ro: boolean }) {
  const picker = useRef<HTMLInputElement>(null)
  return <div>
    <input ref={picker} type="file" multiple accept={PUBLISHING_FILE_ACCEPT} className="hidden" aria-label={ro ? 'Atașează media pentru publicare' : 'Attach publishing media'} onChange={event => { void attachments.add(Array.from(event.target.files ?? []), ro, true); event.target.value = '' }} />
    <Button size="sm" variant="outline" disabled={Boolean(attachments.pending)} onClick={() => picker.current?.click()}>{ro ? 'Media pentru publicare' : 'Publishing media'}</Button>
  </div>
}

function AttachedFiles({ attachments, ro }: { attachments: Attachments; ro: boolean }) {
  return <>
    {attachments.pending && <div role="status"><p>{ro ? 'Se încarcă' : 'Uploading'}: {attachments.pending}</p><Button size="sm" variant="ghost" onClick={attachments.cancel}>{ro ? 'Anulează' : 'Cancel'}</Button></div>}
    {attachments.error && <p role="alert" className="text-destructive">{attachments.error}</p>}
    {attachments.resources.map(resource => <div key={resource.id} className="flex items-center justify-between gap-2"><span className="truncate">{resource.name}</span><Button size="sm" variant="ghost" aria-label={`${ro ? 'Elimină' : 'Remove'} ${resource.name}`} onClick={() => attachments.remove(resource.id)}>×</Button></div>)}
  </>
}

export function AgentAttachments({ attachments, ro, kinds, target }: { attachments: Attachments; ro: boolean; kinds?: string[]; target?: AttachmentTarget }) {
  const logo = !kinds || kinds.includes('logo')
  const document = !kinds || kinds.includes('document')
  const publishing = !kinds || kinds.includes('publishing_media')
  return <section className="space-y-2 text-xs" aria-label={ro ? 'Resurse pentru agent' : 'Agent resources'}>
    {target?.ambiguous ? <p>{ro ? 'Precizează proiectul pentru aceste fișiere în conversație.' : 'Identify the project for these files in the conversation.'}</p> : (logo || document) && <FilePicker attachments={attachments} ro={ro} logo={logo} document={document} target={target} />}
    {publishing && <PublishingPicker attachments={attachments} ro={ro} />}
    <AttachedFiles attachments={attachments} ro={ro} />
  </section>
}
