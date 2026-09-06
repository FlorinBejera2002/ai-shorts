'use client'

import { Button } from '@/components/ui/button'

import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

import { Check, Loader2, RotateCcw, Send, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useToast } from '@/components/ui/toast'
import { extractApiError } from '@/lib/api-error'

export interface AssistantAction {
  type: string
  [key: string]: unknown
}

interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  actions?: AssistantAction[] | null
}

interface AssistantChatProps {
  context: 'create' | 'editor'
  clipId?: string
  /** Snapshot of the page state sent with each message. */
  getState: () => Record<string, unknown>
  /** Apply live actions from a fresh assistant reply. */
  onActions: (actions: AssistantAction[]) => void
  suggestions: string[]
}

const ACTION_LABEL_KEYS: Record<string, string> = {
  update_settings: 'actionSettings',
  set_instructions: 'actionInstructions',
  apply_segments: 'actionSegments',
  seek: 'actionSeek'
}

export function AssistantChat({
  context,
  clipId,
  getState,
  onActions,
  suggestions
}: AssistantChatProps) {
  const t = useTranslations('assistant')
  const toast = useToast()
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const historyQuery = `context=${context}${clipId ? `&clip_id=${clipId}` : ''}`

  useEffect(() => {
    let cancelled = false
    fetch(`/api/assistant/history?${historyQuery}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.messages) return
        setMessages(
          data.messages.map(
            (m: {
              id: string
              role: 'user' | 'assistant'
              content: string
              actions?: AssistantAction[] | null
            }) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              actions: m.actions
            })
          )
        )
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setHistoryLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [historyQuery])

  // Keep the newest message in view
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll runs on every new message/typing state
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const send = useCallback(
    async (text: string) => {
      const message = text.trim()
      if (!message || busy) return
      setBusy(true)
      setInput('')
      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, role: 'user', content: message }
      ])

      try {
        const stateKey = context === 'create' ? 'create_state' : 'editor_state'
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context,
            clip_id: clipId ?? null,
            message,
            [stateKey]: getState()
          })
        })
        const data = await res.json()
        if (!res.ok) {
          toast.add('error', extractApiError(data, t('error')))
          return
        }
        const actions: AssistantAction[] = Array.isArray(data.actions)
          ? data.actions
          : []
        setMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}-a`,
            role: 'assistant',
            content: data.reply ?? '',
            actions
          }
        ])
        if (actions.length > 0) onActions(actions)
      } catch {
        toast.add('error', t('error'))
      } finally {
        setBusy(false)
      }
    },
    [busy, context, clipId, getState, onActions, t, toast]
  )

  const clearHistory = useCallback(async () => {
    if (!window.confirm(t('clearConfirm'))) return
    try {
      const res = await fetch(`/api/assistant/history?${historyQuery}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setMessages([])
        toast.add('success', t('cleared'))
      }
    } catch {
      toast.add('error', t('error'))
    }
  }, [historyQuery, t, toast])

  return (
    <Card className="block gap-0 py-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/35 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <h3 className="text-sm font-semibold text-foreground">
            {t('title')}
          </h3>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            type="button"
            onClick={() => void clearHistory()}
            title={t('clear')}
            className="h-auto whitespace-normal rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        className="flex h-64 flex-col gap-3 overflow-y-auto p-4 sm:h-72"
      >
        {!historyLoaded ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="max-w-[26ch] text-xs leading-relaxed text-muted-foreground">
              {t(context === 'create' ? 'emptyCreate' : 'emptyEditor')}
            </p>
            <div className="grid w-full max-w-lg gap-2 sm:grid-cols-3">
              {suggestions.map((suggestion) => (
                <Button
                  variant="ghost"
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="h-auto whitespace-normal rounded-lg border border-border bg-background px-3 py-2 text-left text-[11px] leading-relaxed text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex flex-col gap-1.5 ${
                message.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                  message.role === 'user'
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm border border-border bg-muted/70 text-foreground'
                }`}
              >
                {message.content}
              </div>
              {message.role === 'assistant' &&
                (message.actions?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {message.actions!.map((action, i) => {
                      const labelKey = ACTION_LABEL_KEYS[action.type]
                      if (!labelKey) return null
                      return (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success"
                        >
                          <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
                          {t(labelKey)}
                        </span>
                      )
                    })}
                  </div>
                )}
            </div>
          ))
        )}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Sparkles className="h-3 w-3" strokeWidth={2} />
            </span>
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('thinking')}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 border-t border-border bg-muted/25 p-3">
        <Textarea
          aria-label={t('placeholder')}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(input)
            }
          }}
          placeholder={t('placeholder')}
          rows={1}
          maxLength={2000}
          className="max-h-24 min-h-10 flex-1 resize-none rounded-lg border border-input bg-card px-3 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/55 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <Button
          variant="ghost"
          type="button"
          onClick={() => void send(input)}
          disabled={!input.trim() || busy}
          title={t('send')}
          aria-label={t('send')}
          className="h-auto whitespace-normal flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:-translate-y-0.5 hover:opacity-90 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" strokeWidth={1.75} />
          )}
        </Button>
      </div>
    </Card>
  )
}
