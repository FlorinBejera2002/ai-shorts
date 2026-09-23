import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { agentApi, AgentApiError } from './api'
import { agentContext, mergeRuns, pollingDelay, safeAgentRoute } from './model'
import type { AgentCommand, AgentRun, RunRequest, Suggestion } from './model'
import { publishAgentActivity } from './activity'
import { useStudioSelection } from './studio-selection'

const historyKey = ['workspace-agent', 'runs']
export function useWorkspaceAgent(route: string, navigate: (route: string) => void, projectId?: string, onProject?: (id: string) => void, locale = 'ro', resourceIds: string[] = []) {
  const client = useQueryClient()
  const [draft, setDraft] = useState('')
  const preferences = useQuery({ queryKey: ['workspace-agent', 'preferences'], queryFn: agentApi.preferences, staleTime: 30000 })
  const follow = preferences.data?.follow ?? false
  const showSuggestions = preferences.data?.recommendations ?? true
  const [preferencesBusy, setPreferencesBusy] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState<RunRequest | null>(null)
  const lock = useRef(false)
  const seen = useRef(new Map<string, number>())
  const initialized = useRef(false)
  const selection = useStudioSelection()
  const context = { ...agentContext(route), ...(projectId ? { project_id: projectId } : {}), ...(route === '/dashboard/studio' && selection && selection.projectId === projectId ? { studio_selection: selection.ids } : {}) }
  const history = useQuery({ queryKey: historyKey,
    queryFn: async ({ signal }) => {
      const page = await agentApi.list(undefined, signal)
      const previous = client.getQueryData<{ runs: AgentRun[]; has_more: boolean }>(historyKey)
      const pageIds = new Set(page.runs.map(run => run.id))
      const olderActive = (previous?.runs ?? []).filter(run => !pageIds.has(run.id) && pollingDelay([run]))
      const refreshed = await Promise.all(olderActive.map(run => agentApi.run(run.id)))
      return { ...page, runs: mergeRuns(previous?.runs ?? [], [...page.runs, ...refreshed]), has_more: previous?.has_more ?? page.has_more }
    },
    refetchInterval: query => pollingDelay(query.state.data?.runs ?? []),
    refetchIntervalInBackground: false, staleTime: 10000
  })
  const suggestions = useQuery({ queryKey: ['workspace-agent', 'suggestions', context.project_id, locale],
    queryFn: ({ signal }) => agentApi.suggestions(context.project_id, signal, locale), staleTime: 60000 })
  const runs = history.data?.runs
  useEffect(() => {
    if (!runs) return
    for (const run of runs) {
      const previous = seen.current.get(run.id)
      seen.current.set(run.id, run.revision)
      if (initialized.current && previous !== undefined && previous < run.revision) {
        publishAgentActivity(run)
        if (run.action?.name === 'stories.create' && typeof run.result?.data?.id === 'string') onProject?.(run.result.data.id)
        for (const step of run.steps ?? []) if (step.action.name === 'stories.create' && typeof step.result?.data?.id === 'string') onProject?.(step.result.data.id)
      }
      const destination = safeAgentRoute(run.result?.route)
      if (initialized.current && previous !== undefined && previous < run.revision && follow && destination) navigate(destination)
    }
    initialized.current = true
  }, [runs, follow, navigate, onProject])
  const storeRun = useCallback((run: AgentRun) => {
    if (run.action?.name === 'stories.create' && typeof run.result?.data?.id === 'string') onProject?.(run.result.data.id)
    for (const step of run.steps ?? []) if (step.action.name === 'stories.create' && typeof step.result?.data?.id === 'string') onProject?.(step.result.data.id)
    client.setQueryData<{ runs: AgentRun[]; has_more: boolean }>(historyKey, old => ({ runs: mergeRuns(old?.runs ?? [], [run]), has_more: old?.has_more ?? false }))
    void client.invalidateQueries({ queryKey: ['workspace-agent', 'suggestions'] })
  }, [client, onProject])
  async function send(request?: RunRequest, suggestion?: Suggestion) {
    if (lock.current) return
    const body = request ?? { request_id: crypto.randomUUID(), message: suggestion?.title ?? draft.trim(), context, resource_ids: resourceIds, ...(suggestion ? { suggestion_id: suggestion.id } : {}) }
    if (!body.message) return
    lock.current = true; setBusy(true); setError(''); setRetry(null)
    try {
      const run = await agentApi.send(body)
      publishAgentActivity(run)
      seen.current.set(run.id, run.revision)
      storeRun(run)
      const destination = safeAgentRoute(run.result?.route)
      if (follow && destination) navigate(destination)
      if (!suggestion) setDraft(previous => previous.trim() === body.message ? '' : previous)
    } catch (cause) {
      // Keep the exact identity on ambiguous delivery; rejected input can be edited.
      setRetry(cause instanceof AgentApiError && cause.status >= 400 && cause.status < 500 ? null : body)
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally { lock.current = false; setBusy(false) }
  }
  async function control(run: AgentRun, command: AgentCommand) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { storeRun(await agentApi.control(run, command, resourceIds)) }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      // Refresh after a stale revision or network ambiguity; never replay approval automatically.
      try { storeRun(await agentApi.run(run.id)) } catch { /* Keep the original actionable error. */ }
    } finally { lock.current = false; setBusy(false) }
  }
  async function older() {
    const first = runs?.[0]
    if (!first || lock.current) return
    lock.current = true; setBusy(true)
    try {
      const page = await agentApi.list(`${first.created_at}|${first.id}`)
      for (const run of page.runs) seen.current.set(run.id, run.revision)
      client.setQueryData(historyKey, { ...page, runs: mergeRuns(runs ?? [], page.runs) })
    } catch (cause) { setError(String(cause)) }
    finally { lock.current = false; setBusy(false) }
  }
  async function dismiss(id: string) {
    try { await agentApi.dismiss(id); await suggestions.refetch() }
    catch (cause) { setError(String(cause)) }
  }
  async function savePreferences(body: { follow?: boolean; recommendations?: boolean; reset?: boolean }) {
    if (preferencesBusy) return
    setPreferencesBusy(true)
    try { client.setQueryData(['workspace-agent', 'preferences'], await agentApi.savePreferences(body)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setPreferencesBusy(false) }
  }
  async function clearHistory() {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try {
      await client.cancelQueries({ queryKey: historyKey })
      const result = await agentApi.clearHistory()
      const cleared = new Set(result.cleared_ids)
      client.setQueryData<{ runs: AgentRun[]; has_more: boolean }>(historyKey, old => ({ runs: (old?.runs ?? []).filter(run => !cleared.has(run.id)), has_more: false }))
      for (const id of cleared) seen.current.delete(id)
      await history.refetch()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { lock.current = false; setBusy(false) }
  }
  return { draft, setDraft, follow, showSuggestions, savePreferences, preferencesBusy, clearHistory, error, busy, retry, send, control, older, dismiss, history, suggestions, runs: runs ?? [] }
}
