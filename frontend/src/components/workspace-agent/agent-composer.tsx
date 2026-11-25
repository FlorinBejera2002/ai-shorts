'use client'

import type { ComponentProps, Ref } from 'react'
import { ArrowUp, Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentHelpComposer } from './agent-help-composer'
import { AgentMenu, type AgentPanel } from './agent-menu'
import type { AgentMessages } from './messages'
import type { useDictation } from './use-dictation'
import type { useWorkspaceAgent } from './use-workspace-agent'

type AgentController = ReturnType<typeof useWorkspaceAgent>
type Dictation = ReturnType<typeof useDictation>

interface AgentComposerProps {
  agent: AgentController
  copy: AgentMessages
  locale: string
  ro: boolean
  mobile: boolean
  canSend: boolean
  studioBusy: boolean
  studio: boolean
  hasOlder: boolean
  speech: Dictation
  composerRef: Ref<HTMLTextAreaElement>
  pendingQuestion?: string
  onAddQuestion: ComponentProps<typeof AgentHelpComposer>['onAddQuestion']
  onSubmit: () => void
  onPanel: (panel: AgentPanel) => void
  onOlder: () => void
}

/** Composer form: retry, help mode, dictation, the attachment menu and send. */
export function AgentComposer(props: AgentComposerProps) {
  const { agent, copy, locale, ro, mobile, canSend, speech, studioBusy, studio, hasOlder, composerRef, pendingQuestion, onAddQuestion, onSubmit, onPanel, onOlder } = props
  return (
    <form
      className="shrink-0 space-y-2 bg-background p-4 pt-2"
      onSubmit={event => {
        event.preventDefault()
        if (canSend) onSubmit()
      }}
    >
      {agent.retry && (
        <Button type="button" size="sm" variant="outline" disabled={agent.busy} onClick={() => void agent.send(agent.retry!)}>
          {copy.retry}
        </Button>
      )}
      <AgentHelpComposer
        locale={locale}
        helpMode={agent.helpMode}
        pendingQuestion={pendingQuestion}
        draftLength={agent.draft.length}
        onRegularMessage={agent.clearHelp}
        onAddQuestion={onAddQuestion}
      />
      {speech.listening && <p role="status" className="text-xs text-muted-foreground">{ro ? 'Se ascultă…' : 'Listening…'}</p>}
      <div className="rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
        <textarea
          ref={composerRef}
          aria-label={copy.placeholder}
          placeholder={copy.placeholder}
          value={agent.draft}
          onChange={event => agent.setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !mobile) {
              event.preventDefault()
              if (canSend) event.currentTarget.form?.requestSubmit()
            }
          }}
          maxLength={4000}
          rows={2}
          className="agent-composer-input block max-h-40 min-h-16 w-full resize-none rounded-md bg-transparent p-3 text-sm leading-relaxed outline-none"
        />
        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant={speech.listening ? 'default' : 'ghost'}
              className="size-8"
              aria-label={speech.listening ? copy.endDictation : copy.dictate}
              aria-pressed={speech.listening}
              title={speech.supported ? (speech.listening ? copy.endDictation : copy.dictate) : copy.speechUnavailable}
              disabled={!speech.supported}
              onClick={speech.toggle}
            >
              {speech.listening ? <Square className="size-3.5" /> : <Mic className="size-4" />}
            </Button>
            <AgentMenu
              ro={ro}
              busy={agent.busy}
              panelBusy={studioBusy}
              hasOlder={hasOlder}
              studio={studio}
              onPanel={onPanel}
              onOlder={onOlder}
            />
          </div>
          <Button type="submit" size="icon" className="size-8" aria-label={copy.send} disabled={!canSend}>
            <ArrowUp className="size-4" />
          </Button>
        </div>
      </div>
    </form>
  )
}
