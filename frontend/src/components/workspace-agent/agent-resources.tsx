import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { storyIsBusy } from '@/components/story/types'
import type { useAgentResources } from './use-agent-resources'

export function AgentResources({ resource, ro }: { resource: ReturnType<typeof useAgentResources>; ro: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  if (!resource.projectId) return null
  const project = resource.query.data
  const text = (en: string, romanian: string) => ro ? romanian : en
  return <section className="space-y-3 rounded-md border p-3" aria-label={text('Story resources', 'Resursele poveștii')}>
    <h3 className="text-xs font-semibold">{text('Attach recordings to this story', 'Atașează filmări la această poveste')}</h3>
    <p className="break-all text-[10px] text-muted-foreground">{resource.projectId}</p>
    {resource.query.isError && <p role="alert" className="text-xs text-destructive">{text('Could not load this story.', 'Povestea nu a putut fi încărcată.')}</p>}
    {project && <>
      <p className="text-xs text-muted-foreground">MP4, MOV, WebM, MKV · {project.limits.max_files} {text('files maximum', 'fișiere maxim')} · {Math.round(project.limits.max_file_bytes / 1024 ** 2)} MB / {text('file', 'fișier')}</p>
      <input id="agent-recordings" ref={input} type="file" multiple accept=".mp4,.mov,.webm,.mkv" className="hidden" aria-label={text('Attach recordings', 'Atașează filmări')} onChange={event => { resource.add(Array.from(event.target.files ?? []), ro); event.target.value = '' }} />
      <Button type="button" size="sm" variant="outline" disabled={storyIsBusy(project.status)} onClick={() => input.current?.click()}>{text('Choose recordings', 'Alege filmări')}</Button>
      {project.assets.map(asset => <p key={asset.id} className="truncate text-xs">✓ {asset.name} · {text('Validated', 'Validat')}</p>)}
    </>}
    {resource.error && <p className="text-xs text-destructive" role="alert">{resource.error}</p>}
    {resource.uploads.items.filter(item => item.status !== 'complete').map(item => <div key={item.id} className="space-y-1 text-xs">
      <p className="truncate">{item.file.name}</p>
      <progress value={item.bytes} max={item.file.size} className="h-1 w-full accent-foreground" aria-label={item.file.name} />
      <p>{item.status === 'validating' ? text('Validating on server…', 'Se validează pe server…') : item.status === 'failed' ? item.error : `${Math.round(item.bytes / item.file.size * 100)}%`}</p>
      <div className="flex gap-2">{item.status === 'failed' && <Button type="button" size="sm" variant="outline" onClick={() => resource.uploads.retry(item.id)}>{text('Retry', 'Reîncearcă')}</Button>}<Button type="button" size="sm" variant="ghost" onClick={() => resource.uploads.forget(item.id)}>{text('Cancel upload', 'Anulează încărcarea')}</Button></div>
    </div>)}
  </section>
}

