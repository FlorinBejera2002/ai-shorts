'use client'

import { Button } from '@/components/ui/button'
import { Loader2, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  type StudioProposal,
  createStudioAssistant
} from './studio-assistant-client'

export function StudioAssistant({
  origin,
  projectId
}: { origin: string; projectId: string }) {
  const [message, setMessage] = useState('')
  const [proposal, setProposal] = useState<StudioProposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const flight = useRef<AbortController | null>(null)
  useEffect(() => () => flight.current?.abort(), [])

  async function run(apply: boolean) {
    if (busy) return
    flight.current?.abort()
    const controller = new AbortController()
    flight.current = controller
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const client = createStudioAssistant(origin, projectId)
      if (apply && proposal) {
        await client.apply(proposal, controller.signal)
        if (!controller.signal.aborted) {
          setProposal(null)
          setNotice(
            'Changes saved. The editor will reload the updated composition.'
          )
        }
      } else {
        setProposal(null)
        const result = await client.propose(message.trim(), controller.signal)
        if (!controller.signal.aborted) setProposal(result)
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to reach the AI service.'
        )
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }

  return (
    <aside
      aria-label="Studio AI assistant"
      className="w-full shrink-0 space-y-4 overflow-y-auto border-t bg-card p-4 lg:w-80 lg:border-l lg:border-t-0"
    >
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4" /> Creative assistant
        </h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          Describe your edit. Review the proposal before changing your
          composition.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void run(false)
        }}
        className="space-y-3"
      >
        <label htmlFor="studio-ai-message" className="text-xs font-medium">
          What would you like to change?
        </label>
        <textarea
          id="studio-ai-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={4000}
          rows={4}
          disabled={busy}
          required={true}
          className="w-full resize-y rounded-lg border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Make the opening title larger and animate it in."
        />
        <Button
          type="submit"
          className="w-full"
          disabled={busy || !message.trim()}
        >
          {busy && <Loader2 className="size-4 animate-spin" />} Generate
          proposal
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-xs leading-5 text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs leading-5">
          {notice}
        </p>
      )}
      {proposal && (
        <div className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">Proposed changes</h3>
          <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
            {proposal.summary}
          </p>
          <details>
            <summary className="cursor-pointer text-xs font-medium">
              Review proposed HTML
            </summary>
            <textarea
              aria-label="Proposed HTML"
              readOnly={true}
              value={proposal.html}
              rows={12}
              className="mt-2 w-full rounded-md border bg-background p-2 font-mono text-xs"
            />
          </details>
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => void run(true)}
          >
            Apply changes
          </Button>
        </div>
      )}
    </aside>
  )
}
