'use client'

import {
  Check,
  Loader2,
  RotateCcw,
  Send,
  Sparkles
} from 'lucide-react'
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
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
            <Sparkles className="h-3.5 w-3.5 text-white" strokeWidth={2} />
          </span>
          <h3 className="text-sm font-semibold text-foreground">
            {t('title')}
          </h3>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => void clearHistory()}
            title={t('clear')}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex h-72 flex-col gap-3 overflow-y-auto p-4"
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
            <div className="flex flex-col gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  className="rounded-lg border border-border px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                >
                  {suggestion}
                </button>
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
                    : 'rounded-bl-sm bg-muted text-foreground'
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
            <span className="flex h-5 w-5 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-accent">
              <Sparkles className="h-3 w-3 text-white" strokeWidth={2} />
            </span>
            <Loader2 className="h-3 w-3 animate-spin" />
            {t('thinking')}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex items-end gap-2 border-t border-border p-3">
        <textarea
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
          className="max-h-24 min-h-9 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-[13px] leading-relaxed placeholder:text-muted-foreground/40 outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <button
          type="button"
          onClick={() => void send(input)}
          disabled={!input.trim() || busy}
          title={t('send')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
      </div>
    </div>
  )
}
