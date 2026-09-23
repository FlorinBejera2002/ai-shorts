import { apiFetch } from '@/lib/auth'
import { extractApiError } from '@/lib/api-error'
import type { AgentCommand, AgentRun, RunRequest, Suggestion, AgentResource } from './model'
export class AgentApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(`/api/workspace-agent${path}`, {
    method: body === undefined ? 'GET' : 'POST', signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  })
  const data = response.status === 204 ? undefined : await response.json().catch(() => ({}))
  if (!response.ok) throw new AgentApiError(extractApiError(data ?? {}, `Request failed (${response.status})`), response.status)
  return data as T
}
export const agentApi = {
  preferences: () => request<{ follow: boolean; recommendations: boolean }>('/preferences'),
  savePreferences: (body: { follow?: boolean; recommendations?: boolean; reset?: boolean }) => request<{ follow: boolean; recommendations: boolean }>('/preferences', body),
  clearHistory: () => request<{ cleared_ids: string[] }>('/history/clear', {}),
  list: (before?: string, signal?: AbortSignal) => request<{ runs: AgentRun[]; has_more: boolean }>(`/runs${before ? `?before=${encodeURIComponent(before)}` : ''}`, undefined, signal),
  run: (id: string) => request<AgentRun>(`/runs/${encodeURIComponent(id)}`),
  send: (body: RunRequest) => request<AgentRun>('/runs', body),
  control: (run: AgentRun, command: AgentCommand, resourceIds?: string[]) => request<AgentRun>(`/runs/${encodeURIComponent(run.id)}/control`, { command, revision: run.revision, ...(command === 'resume' && resourceIds?.length ? { resource_ids: resourceIds } : {}) }),
  suggestions: (project?: string, signal?: AbortSignal, locale = 'ro') => request<{ suggestions: Suggestion[]; capabilities: unknown[] }>(`/suggestions?locale=${encodeURIComponent(locale)}${project ? `&project_id=${encodeURIComponent(project)}` : ''}`, undefined, signal),
  dismiss: (id: string) => request<void>(`/suggestions/${encodeURIComponent(id)}/dismiss`, {}),
  revise: (id: string, instruction: string) => request<Suggestion>(`/suggestions/${encodeURIComponent(id)}/revise`, { instruction }),
  resource: (body: { kind: 'logo' | 'document' | 'publishing_media'; reference?: string; text?: string; name: string; project_id?: string }, signal: AbortSignal) => request<AgentResource>('/resources', body, signal)
}
