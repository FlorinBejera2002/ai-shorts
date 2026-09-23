'use client'

import { Button } from '@/components/ui/button'
import { LoadingIndicator } from '@/components/ui/loading-indicator'
import { Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { type StudioProposal, createStudioAssistant } from './studio-assistant-client'

export function StudioAssistant({ origin, projectId }: { origin: string; projectId: string }) {
  const t = useTranslations('studioWorkspace')
  const [message, setMessage] = useState('')
  const [proposal, setProposal] = useState<StudioProposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const flight = useRef<AbortController | null>(null)
  useEffect(() => () => flight.current?.abort(), [])

  async function run(apply: boolean) {
    if (flight.current) return
    const controller = new AbortController()
    flight.current = controller
    setBusy(true)
    setError('')
    setNotice('')
    await (async () => {
      const client = createStudioAssistant(origin, projectId)
      if (apply && proposal) {
        await client.apply(proposal, controller.signal)
        if (!controller.signal.aborted) {
          setProposal(null)
          setNotice(t('changesSaved'))
        }
      } else {
        setProposal(null)
        const result = await client.propose(message.trim(), controller.signal)
        if (!controller.signal.aborted) setProposal(result)
      }
    })()
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : t('aiError'))
      })
      .finally(() => {
        if (flight.current === controller) {
          flight.current = null
          if (!controller.signal.aborted) setBusy(false)
        }
      })
  }

  return (
    <aside
      id="studio-assistant"
      aria-label={t('assistant')}
      className="w-full shrink-0 space-y-4 overflow-y-auto border-t bg-card p-4 lg:w-80 lg:border-l lg:border-t-0"
    >
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4" /> {t('creativeAssistant')}
        </h2>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">{t('assistantHint')}</p>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void run(false)
        }}
        className="space-y-3"
      >
        <label htmlFor="studio-ai-message" className="text-xs font-medium">
          {t('editPrompt')}
        </label>
        <textarea
          id="studio-ai-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={4000}
          rows={4}
          disabled={busy}
          required={true}
          className="w-full resize-y rounded-md border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={t('promptPlaceholder')}
        />
        <Button type="submit" className="w-full" disabled={busy || !message.trim()}>
          {busy && <LoadingIndicator className="size-4" />}{' '}
          {busy ? t('working') : t('generateProposal')}
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
          <h3 className="text-sm font-medium">{t('proposedChanges')}</h3>
          <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
            {proposal.summary}
          </p>
          <details>
            <summary className="cursor-pointer text-xs font-medium">{t('reviewHtml')}</summary>
            <textarea
              aria-label={t('reviewHtml')}
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
            {t('applyChanges')}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={busy}
            onClick={() => setProposal(null)}
          >
            {t('discard')}
          </Button>
        </div>
      )}
    </aside>
  )
}
