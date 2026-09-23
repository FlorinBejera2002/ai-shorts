import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import type { useAgentAttachments } from './use-agent-attachments'
import { PUBLISHING_FILE_ACCEPT } from '@/components/calendar/publishing-media-utils'

export function AgentAttachments({ attachments, ro }: { attachments: ReturnType<typeof useAgentAttachments>; ro: boolean }) {
  const picker = useRef<HTMLInputElement>(null)
  const publishingPicker = useRef<HTMLInputElement>(null)
  return <section className="space-y-2 rounded-md border p-3 text-xs" aria-label={ro ? 'Resurse pentru agent' : 'Agent resources'}>
    <p className="font-medium">{ro ? 'Logo sau document de lucru' : 'Logo or working document'}</p>
    <p className="text-muted-foreground">{ro ? 'PNG, JPEG, WebP (5 MB) · TXT, Markdown (20.000 caractere). Logo-ul este aplicat doar după aprobarea acțiunii.' : 'PNG, JPEG, WebP (5 MB) · TXT, Markdown (20,000 characters). A logo is applied only after you approve the action.'}</p>
    <input ref={picker} type="file" multiple accept="image/png,image/jpeg,image/webp,.txt,.md" className="hidden" aria-label={ro ? 'Atașează logo sau document' : 'Attach logo or document'} onChange={event => { void attachments.add(Array.from(event.target.files ?? []), ro); event.target.value = '' }} />
    <Button size="sm" variant="outline" disabled={Boolean(attachments.pending)} onClick={() => picker.current?.click()}>{ro ? 'Alege resurse' : 'Choose resources'}</Button>
    <input ref={publishingPicker} type="file" multiple accept={PUBLISHING_FILE_ACCEPT} className="hidden" aria-label={ro ? 'Atașează media pentru publicare' : 'Attach publishing media'} onChange={event => { void attachments.add(Array.from(event.target.files ?? []), ro, true); event.target.value = '' }} />
    <Button size="sm" variant="outline" disabled={Boolean(attachments.pending)} onClick={() => publishingPicker.current?.click()}>{ro ? 'Media pentru publicare' : 'Publishing media'}</Button>
    {attachments.pending && <div role="status"><p>{ro ? 'Se încarcă' : 'Uploading'}: {attachments.pending}</p><Button size="sm" variant="ghost" onClick={attachments.cancel}>{ro ? 'Anulează' : 'Cancel'}</Button></div>}
    {attachments.error && <p role="alert" className="text-destructive">{attachments.error}</p>}
    {attachments.resources.map(resource => <div key={resource.id} className="flex items-center justify-between gap-2"><span className="truncate">{resource.name}</span><Button size="sm" variant="ghost" aria-label={`${ro ? 'Elimină' : 'Remove'} ${resource.name}`} onClick={() => attachments.remove(resource.id)}>×</Button></div>)}
  </section>
}
