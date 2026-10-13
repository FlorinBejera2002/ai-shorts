'use client'

import { useCallback, useRef, useState } from 'react'
import { useLocale } from 'next-intl'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LazyMotion, domAnimation, m as motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowUp, Bot, ChevronRight, Mic, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { localizeHref, usePathname } from '@/i18n/navigation'
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
import { StudioAssets } from './studio-assets'
import { useResourceResume } from './use-resource-resume'
import { useStoryAgentHelp } from './use-story-agent-help'
import { AgentHelpComposer } from './agent-help-composer'
import { AgentMenu, type AgentPanel } from './agent-menu'
import { AgentPreferences } from './agent-preferences'
import { AgentProjectPicker } from './agent-project-picker'
import { useConversationScroll } from './use-conversation-scroll'
import { studioResourceTarget, studioResourceWaiter } from './studio-resources'
import { attachmentTarget } from './attachment-target'
import './workspace-agent.css'

type SelectedProject = { id: string; kind: 'story' | 'project' | 'studio'; route: string }
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i

export function WorkspaceAgent() {
  const locale = useLocale()
  const ro = locale === 'ro'
  const m = agentMessages[ro ? 'ro' : 'en']
  const route = usePathname()
  const [search] = useSearchParams()
  const queryStory = search.get('story') ?? ''
  const routeStory = route === '/dashboard/create' && uuid.test(queryStory) ? queryStory : undefined
  const queryStudio = search.get('project') ?? ''
  const routeStudio = route === '/dashboard/studio' && uuid.test(queryStudio) ? queryStudio : undefined
  const routeKey = `${route}?${search.toString()}`
  const routerNavigate = useNavigate()
  const navigate = useCallback((destination: string) => { void routerNavigate(localizeHref(destination, locale)) }, [routerNavigate, locale])
  const [selectedProject, setSelectedProject] = useState<SelectedProject | undefined>(() => routeStory ? { id: routeStory, kind: 'story', route: routeKey } : routeStudio ? { id: routeStudio, kind: 'studio', route: routeKey } : undefined)
  const [lastRouteKey, setLastRouteKey] = useState(routeKey)
  if (lastRouteKey !== routeKey) {
    setLastRouteKey(routeKey)
    if (routeStory) setSelectedProject({ id: routeStory, kind: 'story', route: routeKey })
    else if (routeStudio) setSelectedProject({ id: routeStudio, kind: 'studio', route: routeKey })
  }
  const projectId = selectedProject?.route === routeKey ? selectedProject.id : routeStory ?? routeStudio ?? selectedProject?.id
  const storyId = projectId === routeStory ? routeStory : selectedProject?.kind === 'story' && selectedProject.id === projectId ? projectId : undefined
  const [studioUploading, setStudioUploading] = useState(false)
  const [panel, setPanel] = useState<AgentPanel | null>(null)
  const [dismissedContext, setDismissedContext] = useState('')
  const resource = useAgentResources(storyId)
  const attachments = useAgentAttachments()
  const selectProject = useCallback((id: string) => {
    if (resource.uploads.busy || id === projectId) return
    resource.uploads.items.forEach(item => resource.uploads.forget(item.id))
    setSelectedProject({ id, kind: 'story', route: routeKey })
  }, [projectId, resource.uploads, routeKey])
  const agent = useWorkspaceAgent(route, navigate, projectId, selectProject, locale, attachments.resources)
  useResourceResume({ runs: agent.runs, projectId: storyId, items: resource.uploads.items.filter(item => item.projectId === storyId), uploading: resource.uploads.busy, resources: attachments.resources, completedBatch: attachments.completedBatch, pending: Boolean(attachments.pending), busy: agent.busy, resume: run => void agent.control(run, 'resume') })
  const [open, setOpen] = useState(false)
  const openForHelp = useCallback(() => setOpen(true), [])
  const { pending: pendingHelp, addQuestion, composerRef, focusComposer, restoreFocus } = useStoryAgentHelp(locale, agent.prepareHelp, openForHelp)
  const [width, setWidth] = useState(380)
  const trigger = useRef<HTMLButtonElement>(null)
  const mobile = useIsMobile()
  const reducedMotion = Boolean(useReducedMotion())
  const { viewportRef, onScroll, awayFromBottom, scrollToLatest, preserveHistoryPosition } = useConversationScroll()
  const speech = useDictation(locale, text => agent.setDraft(previous => `${previous}${previous ? ' ' : ''}${text}`.slice(0, 4000)))
  const waiting = [...agent.runs].reverse().find(run => run.status === 'waiting_for_resources')
  const missing = waiting?.missing_resources ?? []
  const studioProjectId = studioResourceTarget(waiting, routeStudio ?? (selectedProject?.kind === 'studio' ? selectedProject.id : undefined))
  const contextKey = waiting ? `${waiting.id}:${waiting.revision}` : ''
  const contextualPanel: AgentPanel | null = missing.some(item => ['logo', 'document', 'publishing_media'].includes(item.kind)) ? 'attachments'
    : missing.some(item => ['video', 'videos'].includes(item.kind)) ? 'recordings'
    : missing.some(item => item.kind === 'studio_asset') ? 'studio'
    : missing.some(item => ['project', 'story'].includes(item.kind)) ? 'projects' : null
  const visiblePanel = (contextKey !== dismissedContext ? contextualPanel : null) ?? panel
  const uploading = resource.uploads.busy || Boolean(attachments.pending) || studioUploading
  const canSend = !agent.busy && Boolean(agent.draft.trim()) && !agent.retry && !uploading
  const panelTitle: Record<AgentPanel, string> = {
    attachments: ro ? 'Fișiere pentru conversație' : 'Conversation files', projects: ro ? 'Alege proiectul' : 'Choose project',
    recordings: ro ? 'Surse media' : 'Media sources', studio: ro ? 'Media pentru Studio' : 'Studio media',
    preferences: ro ? 'Preferințe și istoric' : 'Preferences and history', suggestions: m.suggestions
  }

  function changeOpen(value: boolean) {
    setOpen(value)
    if (!value) { speech.cancel(); if (!mobile) restoreFocus() }
  }
  function openRecordings(id: string) { selectProject(id); setPanel('recordings') }
  function openPanel(next: AgentPanel) { setDismissedContext(contextKey); setPanel(next) }
  function resumeStudioUpload(id: string) {
    const run = studioResourceWaiter(agent.runs, id)
    if (run && !agent.busy) void agent.control(run, 'resume')
  }
  function closePanel() { setPanel(null); setDismissedContext(contextKey) }
  function loadOlder() { preserveHistoryPosition(); void agent.older() }

  const content = <LazyMotion features={domAnimation} strict><div className="flex h-full min-h-0 flex-col">
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <span className="mr-1 flex size-7 items-center justify-center rounded-md bg-foreground text-background"><Bot className="size-4" aria-hidden="true" /></span>
      <h2 className="min-w-0 flex-1 text-sm font-semibold tracking-tight">{m.title}</h2>
      <Button size="icon" variant="ghost" className="size-8" aria-label={m.close} onClick={() => changeOpen(false)}><ChevronRight className="size-4" /></Button>
    </header>
    <div className="relative min-h-0 flex-1">
      <div ref={viewportRef} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain px-4" aria-label={ro ? 'Conversație' : 'Conversation'} tabIndex={0} data-agent-conversation>
        <div className="min-h-full pb-4">
          {agent.history.isPending && <p className="py-6 text-xs text-muted-foreground" role="status">{m.loading}</p>}
          {agent.history.isError && <div className="space-y-2 py-4"><p role="alert" className="text-xs text-destructive">{agent.runs.length ? (ro ? 'Conexiunea s-a întrerupt. Verifică starea înainte să continui.' : 'Connection interrupted. Refresh the status before continuing.') : m.error}</p><Button variant="outline" size="sm" disabled={agent.history.isFetching} onClick={() => void agent.history.refetch()}>{m.retry}</Button></div>}
          {!agent.runs.length && !agent.history.isPending && <div className="flex min-h-48 items-center px-2 py-10"><p className="max-w-64 text-sm leading-relaxed text-muted-foreground">{m.empty}</p></div>}
          {agent.runs.map(run => <RunCard key={run.id} run={run} messages={m} busy={agent.busy} uploading={uploading} connectionLost={agent.connectionLost} control={(item, command) => void agent.control(item, command)} selectProject={openRecordings} />)}
          {agent.sending && <p className={`py-3 text-xs text-muted-foreground ${reducedMotion ? '' : 'agent-shimmer'}`} role="status" data-agent-sending>{ro ? 'Se trimite cererea…' : 'Sending request…'}</p>}
          {visiblePanel && <motion.section initial={reducedMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.16 }} className="mt-3 space-y-3 rounded-md border p-3" data-agent-context-panel={visiblePanel} aria-label={panelTitle[visiblePanel]}>
            <div className="flex items-center justify-between gap-2"><h3 className="text-xs font-medium">{panelTitle[visiblePanel]}</h3><Button size="icon" variant="ghost" className="size-7" aria-label={ro ? 'Închide opțiunile' : 'Close options'} disabled={uploading} onClick={closePanel}><X className="size-3.5" /></Button></div>
            {visiblePanel === 'attachments' && <AgentAttachments attachments={attachments} ro={ro} kinds={panel === 'attachments' ? undefined : missing.map(item => item.kind)} target={attachmentTarget(waiting)} />}
            {visiblePanel === 'recordings' && (storyId ? <AgentResources resource={resource} ro={ro} /> : <><p className="text-xs text-muted-foreground">{ro ? 'Alege povestea la care atașezi filmările.' : 'Choose a story for these recordings.'}</p><AgentProjectPicker ro={ro} storiesOnly disabled={uploading} selectedId={projectId} onSelect={project => { setSelectedProject({ ...project, route: routeKey }); setPanel('recordings') }} /></>)}
            {visiblePanel === 'studio' && (studioProjectId ? <StudioAssets key={studioProjectId} projectId={studioProjectId} ro={ro} onBusy={setStudioUploading} onUploaded={resumeStudioUpload} /> : <p className="text-xs text-muted-foreground">{ro ? 'Precizează proiectul Studio în conversație înainte de a atașa fișierele.' : 'Identify the Studio project in the conversation before attaching files.'}</p>)}
            {visiblePanel === 'projects' && <AgentProjectPicker ro={ro} disabled={uploading} selectedId={projectId} onSelect={project => { setSelectedProject({ ...project, route: routeKey }); closePanel() }} />}
            {visiblePanel === 'preferences' && <AgentPreferences agent={agent} messages={m} ro={ro} width={width} onWidth={setWidth} />}
            {visiblePanel === 'suggestions' && <div className="space-y-3">{agent.suggestions.isPending ? <p role="status" className="text-xs">{m.loading}</p> : agent.suggestions.isError ? <div><p className="text-xs" role="alert">{m.error}</p><Button size="sm" variant="outline" onClick={() => void agent.suggestions.refetch()}>{m.retry}</Button></div> : !agent.suggestions.data?.suggestions.length ? <p className="text-xs text-muted-foreground">{ro ? 'Nu sunt recomandări acum.' : 'No suggestions right now.'}</p> : agent.suggestions.data.suggestions.map(suggestion => <SuggestionCard key={suggestion.id} original={suggestion} messages={m} disabled={agent.busy || Boolean(agent.retry) || uploading} onAccept={item => { closePanel(); void agent.send(undefined, item) }} onDismiss={id => void agent.dismiss(id)} />)}</div>}
          </motion.section>}
        </div>
      </div>
      {awayFromBottom && <Button size="sm" variant="outline" className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background shadow-sm" onClick={scrollToLatest}><ArrowDown className="mr-1.5 size-3.5" />{ro ? 'Ultimele mesaje' : 'Latest messages'}</Button>}
    </div>
    <form className="shrink-0 space-y-2 bg-background p-4 pt-2" onSubmit={event => { event.preventDefault(); if (canSend) { scrollToLatest(); void agent.send() } }}>
      {agent.error && <p role="alert" className="text-xs text-destructive">{agent.error}</p>}
      {agent.retry && <Button type="button" size="sm" variant="outline" disabled={agent.busy} onClick={() => void agent.send(agent.retry!)}>{m.retry}</Button>}
      <AgentHelpComposer locale={locale} helpMode={agent.helpMode} pendingQuestion={pendingHelp?.question} draftLength={agent.draft.length} onRegularMessage={agent.clearHelp} onAddQuestion={addQuestion} />
      {speech.listening && <p role="status" className="text-xs text-muted-foreground">{ro ? 'Se ascultă…' : 'Listening…'}</p>}
      {speech.failed && <p role="alert" className="text-xs text-destructive">{m.speechError}</p>}
      <div className="rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
        <textarea ref={composerRef} aria-label={m.placeholder} placeholder={m.placeholder} value={agent.draft} onChange={event => agent.setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !mobile) { event.preventDefault(); if (canSend) event.currentTarget.form?.requestSubmit() } }} maxLength={4000} rows={2} className="agent-composer-input block max-h-40 min-h-16 w-full resize-none rounded-md bg-transparent p-3 text-sm leading-relaxed outline-none" />
        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant={speech.listening ? 'default' : 'ghost'} className="size-8" aria-label={speech.listening ? m.endDictation : m.dictate} aria-pressed={speech.listening} title={speech.supported ? (speech.listening ? m.endDictation : m.dictate) : m.speechUnavailable} disabled={!speech.supported} onClick={speech.toggle}>{speech.listening ? <Square className="size-3.5" /> : <Mic className="size-4" />}</Button>
            <AgentMenu ro={ro} busy={agent.busy} panelBusy={studioUploading} hasOlder={Boolean(agent.history.data?.has_more)} studio={Boolean(studioProjectId)} onPanel={openPanel} onOlder={loadOlder} />
          </div>
          <Button type="submit" size="icon" className="size-8" aria-label={m.send} disabled={!canSend}><ArrowUp className="size-4" /></Button>
        </div>
      </div>
    </form>
  </div></LazyMotion>

  return <>
    {!open && <Button data-agent-trigger ref={trigger} className="fixed right-4 bottom-24 z-40 shadow-lg lg:bottom-6" onClick={() => changeOpen(true)} aria-label={m.open} aria-expanded={false} aria-controls="workspace-agent-panel"><Bot className="mr-2 size-4" />{m.title}</Button>}
    {mobile ? <Sheet open={open} onOpenChange={changeOpen}><SheetContent id="workspace-agent-panel" showCloseButton={false} onOpenAutoFocus={event => { if (focusComposer()) event.preventDefault() }} onCloseAutoFocus={event => { event.preventDefault(); if (!restoreFocus()) trigger.current?.focus() }} className="h-[100dvh] w-full gap-0 sm:max-w-md"><SheetTitle className="sr-only">{m.title}</SheetTitle><SheetDescription className="sr-only">{m.subtitle}</SheetDescription>{content}</SheetContent></Sheet> : <aside id="workspace-agent-panel" aria-label={m.title} hidden={!open} style={{ width }} className="sticky top-0 h-screen shrink-0 border-l bg-background">{content}</aside>}
  </>
}
