'use client'

import { useCallback, useRef, useState } from 'react'
import { useLocale } from 'next-intl'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LazyMotion, domAnimation, useReducedMotion } from 'framer-motion'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { localizeHref, usePathname } from '@/i18n/navigation'
import { useIsMobile } from '@/hooks/use-mobile'
import theme from '@/components/calendar/publishing-theme.module.css'
import { agentMessages } from './messages'
import { useWorkspaceAgent } from './use-workspace-agent'
import { useDictation } from './use-dictation'
import { useAgentResources } from './use-agent-resources'
import { useAgentAttachments } from './use-agent-attachments'
import { useResourceResume } from './use-resource-resume'
import { useStoryAgentHelp } from './use-story-agent-help'
import { useConversationScroll } from './use-conversation-scroll'
import { useAgentProjectSelection } from './use-agent-project-selection'
import { useAgentContextPanel } from './use-agent-context-panel'
import { useAgentFocusHandoff } from './use-agent-focus-handoff'
import { appendDictatedText, canSendDraft, isAgentUploading, panelTitles, isLauncherHiddenOnPhone } from './agent-view-state'
import { attachmentTarget } from './attachment-target'
import { AgentTrigger } from './agent-trigger'
import { AgentHeader } from './agent-header'
import { useAgentBubble } from './use-agent-bubble'
import { useAgentSidebarCollapse } from './use-agent-sidebar-collapse'
import styles from './agent-shell.module.css'
import { AgentConversation } from './agent-conversation'
import { AgentTranscript } from './agent-transcript'
import { AgentContextPanel } from './agent-context-panel'
import { AgentComposer } from './agent-composer'
import './workspace-agent.css'

/** Ana & Radu, the floating workspace assistant: a docked panel on desktop and a full-height sheet on phones. */
export function WorkspaceAgent() {
  const locale = useLocale()
  const ro = locale === 'ro'
  const copy = agentMessages[ro ? 'ro' : 'en']
  const route = usePathname()
  const [search] = useSearchParams()
  const routerNavigate = useNavigate()
  const navigate = useCallback((destination: string) => { void routerNavigate(localizeHref(destination, locale)) }, [routerNavigate, locale])
  const { routeKey, routeStudio, selectedProject, setSelectedProject, projectId, storyId } = useAgentProjectSelection(route, search)
  const [studioUploading, setStudioUploading] = useState(false)
  const [open, setOpen] = useState(false)
  const mobile = useIsMobile()
  useAgentSidebarCollapse(open, !mobile)
  const bubble = useAgentBubble(open)
  const [width, setWidth] = useState(380)
  const resource = useAgentResources(storyId)
  const attachments = useAgentAttachments()
  const selectProject = useCallback((id: string) => {
    if (resource.uploads.busy || id === projectId) return
    resource.uploads.items.forEach(item => resource.uploads.forget(item.id))
    setSelectedProject({ id, kind: 'story', route: routeKey })
  }, [projectId, resource.uploads, routeKey, setSelectedProject])
  const agent = useWorkspaceAgent(route, navigate, projectId, selectProject, locale, attachments.resources)
  useResourceResume({ runs: agent.runs, projectId: storyId, items: resource.uploads.items.filter(item => item.projectId === storyId), uploading: resource.uploads.busy, resources: attachments.resources, completedBatch: attachments.completedBatch, pending: Boolean(attachments.pending), busy: agent.busy, resume: run => void agent.control(run, 'resume') })
  const context = useAgentContextPanel({ agent, routeStudio, selectedProject })
  const openForHelp = useCallback(() => { setOpen(true); bubble.hide() }, [bubble.hide])
  const { pending: pendingHelp, addQuestion, composerRef, focusComposer, restoreFocus } = useStoryAgentHelp(locale, agent.prepareHelp, openForHelp)
  const trigger = useRef<HTMLButtonElement>(null)
  const reducedMotion = Boolean(useReducedMotion())
  const focus = useAgentFocusHandoff({ mobile, focusComposer, restoreFocus, trigger })
  const { viewportRef, onScroll, awayFromBottom, scrollToLatest, preserveHistoryPosition } = useConversationScroll()
  const speech = useDictation(locale, text => agent.setDraft(previous => appendDictatedText(previous, text)))
  const uploading = isAgentUploading({ resourceBusy: resource.uploads.busy, attachmentPending: attachments.pending, studioUploading })
  const canSend = canSendDraft({ busy: agent.busy, draft: agent.draft, retry: agent.retry, uploading })

  function changeOpen(value: boolean) {
    setOpen(value)
    if (value) bubble.hide()
    else { speech.cancel(); focus.onDesktopHide() }
  }
  function openRecordings(id: string) { selectProject(id); context.setPanel('recordings') }
  function loadOlder() { preserveHistoryPosition(); void agent.older() }
  function submit() { scrollToLatest(); void agent.send() }

  const content = (
    <LazyMotion features={domAnimation} strict><div className="flex h-full min-h-0 flex-col">
      <AgentHeader title={copy.title} controlLabel={mobile ? copy.closePanel : copy.close} variant={mobile ? 'sheet' : 'panel'} onClose={() => changeOpen(false)} />
      <AgentConversation viewportRef={viewportRef} onScroll={onScroll} ro={ro} awayFromBottom={awayFromBottom} onScrollToLatest={scrollToLatest}>
        <AgentTranscript agent={agent} copy={copy} ro={ro} uploading={uploading} reducedMotion={reducedMotion} onOpenRecordings={openRecordings} />
        {context.visiblePanel && (
          <AgentContextPanel
            panel={context.visiblePanel}
            title={panelTitles(ro, copy)[context.visiblePanel]}
            copy={copy}
            ro={ro}
            agent={agent}
            attachments={attachments}
            resource={resource}
            attachmentKinds={context.attachmentKinds}
            attachmentTarget={attachmentTarget(context.waiting)}
            storyId={storyId}
            projectId={projectId}
            studioProjectId={context.studioProjectId}
            uploading={uploading}
            width={width}
            onWidth={setWidth}
            onClose={context.closePanel}
            onRecordingsProject={project => { setSelectedProject({ ...project, route: routeKey }); context.setPanel('recordings') }}
            onProject={project => { setSelectedProject({ ...project, route: routeKey }); context.closePanel() }}
            onStudioBusy={setStudioUploading}
            onStudioUploaded={context.resumeStudioUpload}
            reducedMotion={reducedMotion}
          />
        )}
      </AgentConversation>
      <AgentComposer
        agent={agent}
        copy={copy}
        locale={locale}
        ro={ro}
        mobile={mobile}
        canSend={canSend}
        studioBusy={studioUploading}
        studio={Boolean(context.studioProjectId)}
        hasOlder={Boolean(agent.history.data?.has_more)}
        speech={speech}
        composerRef={composerRef}
        pendingQuestion={pendingHelp?.question}
        onAddQuestion={addQuestion}
        onSubmit={submit}
        onPanel={context.openPanel}
        onOlder={loadOlder}
      />
    </div></LazyMotion>
  )

  return (
    <>
      {!open && (
        <AgentTrigger
          copy={copy}
          bubbleVisible={bubble.visible}
          hiddenOnPhone={isLauncherHiddenOnPhone(route)}
          triggerRef={trigger}
          onOpen={() => changeOpen(true)}
          onDismissBubble={bubble.hide}
        />
      )}
      {mobile
        ? (
          <Sheet open={open} onOpenChange={changeOpen}>
            <SheetContent
              id="workspace-agent-panel"
              showCloseButton={false}
              onOpenAutoFocus={focus.onOpenAutoFocus}
              onCloseAutoFocus={focus.onCloseAutoFocus}
              data-reference-surface=""
              className={`${theme.surface} ${styles.sheet} h-[100dvh] w-full gap-0 sm:max-w-md`}
            >
              <SheetTitle className="sr-only">{copy.title}</SheetTitle>
              <SheetDescription className="sr-only">{copy.subtitle}</SheetDescription>
              {content}
            </SheetContent>
          </Sheet>
        )
        : (
          <aside
            id="workspace-agent-panel"
            aria-label={copy.title}
            hidden={!open}
            data-reference-surface=""
            style={{ width }}
            className={`${theme.surface} ${styles.panel} sticky top-0 h-screen shrink-0`}
          >
            {content}
          </aside>
        )}
    </>
  )
}
