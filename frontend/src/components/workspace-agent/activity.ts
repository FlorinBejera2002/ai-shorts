import { useSyncExternalStore } from 'react'
import type { AgentRun } from './model'
import { safeAgentRoute } from './model'

export type AgentActivity = { runId: string; revision: number; route: string; resourceId?: string; action: string; status: AgentRun['status'] }
let activity: AgentActivity | null = null
let clearTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function publishAgentActivity(run: AgentRun) {
  const action = run.action ?? run.steps?.at(-1)?.action
  const result = run.result ?? run.steps?.at(-1)?.result
  const route = safeAgentRoute(result?.route ?? run.context.route)
  if (!route || !action) return
  const candidate = result?.data?.clip_id ?? result?.data?.id ?? action.input.id
  activity = { runId: run.id, revision: run.revision, route, action: action.name, status: run.status,
    ...(typeof candidate === 'string' ? { resourceId: candidate } : {}) }
  listeners.forEach(listener => listener())
  clearTimeout(clearTimer)
  clearTimer = setTimeout(() => { activity = null; listeners.forEach(listener => listener()) }, 8000)
}
export function useAgentActivity() { return useSyncExternalStore(subscribe, () => activity, () => null) }
export function activityMatchesRoute(value: AgentActivity | null, pathname: string, search: string): boolean {
  if (!value) return false
  const current = new URL(`${pathname}${search}`, 'https://workspace.local')
  const target = new URL(value.route, 'https://workspace.local')
  if (current.pathname !== target.pathname) return false
  const story = target.searchParams.get('story')
  if (story && current.searchParams.get('story') !== story) return false
  const studio = target.searchParams.get('project')
  if (studio && current.searchParams.get('project') !== studio) return false
  if (value.resourceId && current.pathname === '/dashboard/create') return current.searchParams.get('story') === value.resourceId
  return true
}
