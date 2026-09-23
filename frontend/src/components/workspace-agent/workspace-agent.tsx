'use client'

import { useCallback, useRef, useState } from 'react'
import { useLocale } from 'next-intl'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bot, ChevronRight, Mic, Paperclip, Send, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Link, localizeHref, usePathname } from '@/i18n/navigation'
import { useIsMobile } from '@/hooks/use-mobile'
import { agentMessages } from './messages'
import { RunCard } from './run-card'
import { useWorkspaceAgent } from './use-workspace-agent'
import { useDictation } from './use-dictation'
import { AgentResources } from './agent-resources'
import { useAgentResources } from './use-agent-resources'
import { SuggestionCard } from './suggestion-card'
import { AgentAttachments } from './agent-attachments'
import { useAgentAttachments } from './use-agent-attachments'
import './workspace-agent.css'
import { StudioAssets } from './studio-assets'
import { useResourceResume } from './use-resource-resume'

export function WorkspaceAgent() {
  const locale = useLocale()
  const m = agentMessages[locale === 'ro' ? 'ro' : 'en']
  const route = usePathname()
  const [search] = useSearchParams()
  const queryStory = search.get('story') ?? ''
  const routeStory = route === '/dashboard/create' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(queryStory) ? queryStory : undefined
  const queryStudio = search.get('project') ?? ''
  const routeStudio = route === '/dashboard/studio' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(queryStudio) ? queryStudio : undefined
  const routerNavigate = useNavigate()
  const navigate = useCallback((destination: string) => { void routerNavigate(localizeHref(destination, locale)) }, [routerNavigate, locale])
  const [projectId, setProjectId] = useState<string | undefined>(routeStory)
  const [studioUploading, setStudioUploading] = useState(false)
  const resource = useAgentResources(projectId)
  const attachments = useAgentAttachments(routeStudio ? undefined : routeStory ?? projectId)
  const selectProject = useCallback((id: string) => {
    if (resource.uploads.busy || id === projectId) return
    resource.uploads.items.forEach(item => resource.uploads.forget(item.id))
    setProjectId(id)
  }, [projectId, resource.uploads])
  const agent = useWorkspaceAgent(route, navigate, routeStory ?? routeStudio ?? projectId, selectProject, locale, attachments.resources.map(item => item.id))
  useResourceResume({ runs: agent.runs, projectId, items: resource.uploads.items, uploading: resource.uploads.busy, resources: attachments.resources, completedBatch: attachments.completedBatch, pending: Boolean(attachments.pending), busy: agent.busy, resume: run => void agent.control(run, 'resume') })
  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(380)
  const trigger = useRef<HTMLButtonElement>(null)
  const mobile = useIsMobile()
  const speech = useDictation(locale, text => agent.setDraft(previous => `${previous}${previous ? ' ' : ''}${text}`.slice(0, 4000)))
  function changeOpen(value: boolean) { setOpen(value); if (!value) speech.cancel() }
  const content = <div className="flex h-full min-h-0 flex-col">
    <header className="flex shrink-0 items-center gap-3 border-b p-4">
      <span className="flex size-9 items-center justify-center rounded-md bg-foreground text-background"><Bot className="size-5" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{m.title}</h2><p className="text-[11px] text-muted-foreground">{m.subtitle}</p></div>
      <Button size="icon" variant="ghost" aria-label={m.close} onClick={() => changeOpen(false)}><ChevronRight className="size-4" /></Button>
    </header>
    <div className="space-y-2 border-b px-4 py-3">
      <label className="flex cursor-pointer items-center gap-2 text-xs"><input type="checkbox" checked={agent.follow} disabled={agent.preferencesBusy} onChange={event => void agent.savePreferences({ follow: event.target.checked })} className="accent-foreground" />{m.follow}</label>
      <p className="truncate text-[11px] text-muted-foreground" title={route}>{m.context}: {route}</p>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4" aria-label={m.title} tabIndex={0}>
      {agent.history.isPending && <p className="py-6 text-sm text-muted-foreground" role="status">{m.loading}</p>}
      {agent.history.isError && <div className="py-4"><p role="alert" className="text-sm text-destructive">{m.error}</p><Button variant="outline" size="sm" onClick={() => void agent.history.refetch()}>{m.retry}</Button></div>}
      {agent.history.data?.has_more && <Button variant="ghost" size="sm" disabled={agent.busy} onClick={() => void agent.older()}>{m.older}</Button>}
      {!agent.runs.length && !agent.history.isPending && <p className="py-6 text-sm leading-relaxed text-muted-foreground">{m.empty}</p>}
      {agent.runs.map(run => <RunCard key={run.id} run={run} messages={m} busy={agent.busy} uploading={resource.uploads.busy || Boolean(attachments.pending)} control={(item, command) => void agent.control(item, command)} selectProject={selectProject} />)}
      <AgentResources resource={resource} ro={locale === 'ro'} />
      <AgentAttachments attachments={attachments} ro={locale === 'ro'} />
      {routeStudio && <StudioAssets key={routeStudio} projectId={routeStudio} ro={locale === 'ro'} onBusy={setStudioUploading} />}
      {routeStory && routeStory !== projectId && <Button size="sm" variant="outline" disabled={resource.uploads.busy} onClick={() => selectProject(routeStory)}>{locale === 'ro' ? 'Atașează la povestea deschisă' : 'Attach to the open story'}</Button>}
      <label className="my-3 flex items-center gap-2 text-xs"><input type="checkbox" checked={agent.showSuggestions} disabled={agent.preferencesBusy} onChange={event => void agent.savePreferences({ recommendations: event.target.checked })} className="accent-foreground" />{m.suggestions}</label>
      <details className="my-3 text-xs"><summary className="cursor-pointer">{locale === 'ro' ? 'Preferințe și istoric' : 'Preferences and history'}</summary><div className="mt-2 space-y-2">
        <Button variant="outline" size="sm" disabled={agent.preferencesBusy} onClick={() => void agent.savePreferences({ reset: true })}>{locale === 'ro' ? 'Resetează preferințele agentului' : 'Reset agent preferences'}</Button>
        <p className="text-muted-foreground">{locale === 'ro' ? 'Golește conversațiile încheiate din istoric. Activitățile curente, proiectele și fișierele rămân. Evidențele tehnice sunt păstrate pentru evitarea execuțiilor duplicate.' : 'Clear finished conversations from history. Current work, projects and files remain. Technical receipts are retained to prevent duplicate execution.'}</p>
        <Button variant="outline" size="sm" disabled={agent.busy} onClick={() => void agent.clearHistory()}>{locale === 'ro' ? 'Golește istoricul încheiat' : 'Clear finished history'}</Button>
      </div></details>
      {agent.showSuggestions && Boolean(agent.suggestions.data?.suggestions.length) && <section className="space-y-3 py-5" aria-label={m.suggestions}>
        <h3 className="text-xs font-semibold">{m.suggestions}</h3>
        {agent.suggestions.data?.suggestions.map(suggestion => <SuggestionCard key={suggestion.id} original={suggestion} messages={m} disabled={agent.busy || Boolean(agent.retry) || resource.uploads.busy} onAccept={item => void agent.send(undefined, item)} onDismiss={id => void agent.dismiss(id)} />)}
      </section>}
    </div>
    <form className="shrink-0 space-y-2 border-t bg-background p-4" onSubmit={event => { event.preventDefault(); if (!agent.retry) void agent.send() }}>
      {agent.error && <p role="alert" className="text-xs text-destructive">{agent.error}</p>}
      {agent.retry && <Button type="button" size="sm" variant="outline" disabled={agent.busy} onClick={() => void agent.send(agent.retry!)}>{m.retry}</Button>}
      <textarea aria-label={m.placeholder} placeholder={m.placeholder} value={agent.draft} onChange={event => agent.setDraft(event.target.value)} maxLength={4000} rows={3} className="w-full resize-none rounded-md border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <div className="flex items-center gap-2">
        {projectId ? <Button type="button" variant="ghost" size="icon" aria-label={locale === 'ro' ? 'Atașează filmări' : 'Attach recordings'} onClick={() => document.getElementById('agent-recordings')?.click()}><Paperclip className="size-4" /></Button> : <Button type="button" variant="ghost" size="icon" asChild><Link href="/dashboard/create" aria-label={m.upload} title={m.upload}><Paperclip className="size-4" /></Link></Button>}
        <Button type="button" variant="ghost" size="icon" disabled={!speech.supported} onClick={speech.toggle} aria-label={speech.listening ? m.endDictation : m.dictate} aria-pressed={speech.listening} title={speech.supported ? m.dictate : m.speechUnavailable}>{speech.listening ? <Square className="size-4" /> : <Mic className="size-4" />}</Button>
        <Button type="submit" size="sm" className="ml-auto" disabled={agent.busy || !agent.draft.trim() || Boolean(agent.retry) || Boolean(attachments.pending) || studioUploading}><Send className="mr-2 size-3" />{m.send}</Button>
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground" role={speech.failed ? 'alert' : undefined}>{speech.failed ? m.speechError : speech.supported ? m.speechHint : m.speechUnavailable}</p>
    </form>
  </div>
  return <>
    {!open && <Button data-agent-trigger ref={trigger} className="fixed right-4 bottom-24 z-40 shadow-lg lg:bottom-6" onClick={() => changeOpen(true)} aria-label={m.open} aria-expanded={false} aria-controls="workspace-agent-panel"><Bot className="mr-2 size-4" />{m.title}</Button>}
    {mobile ? <Sheet open={open} onOpenChange={changeOpen}><SheetContent id="workspace-agent-panel" showCloseButton={false} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus() }} className="h-[100dvh] w-full gap-0 sm:max-w-md"><SheetTitle className="sr-only">{m.title}</SheetTitle><SheetDescription className="sr-only">{m.subtitle}</SheetDescription>{content}</SheetContent></Sheet> : <aside id="workspace-agent-panel" aria-label={m.title} hidden={!open} style={{ width }} className="sticky top-0 h-screen shrink-0 border-l bg-background">
      <label className="absolute -left-2 top-1/2 z-10 -translate-y-1/2"><span className="sr-only">{m.width}</span><input type="range" min={320} max={560} step={20} value={width} onChange={event => setWidth(Number(event.target.value))} className="h-24 w-3 cursor-ew-resize accent-foreground [writing-mode:vertical-lr]" /></label>
      {content}
    </aside>}
  </>
}

