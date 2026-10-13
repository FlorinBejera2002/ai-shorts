import type { AgentRun } from './model'

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i

export function studioResourceTarget(run: AgentRun | undefined, fallback?: string): string | undefined {
  const needs = run?.missing_resources?.filter(resource => resource.kind === 'studio_asset') ?? []
  if (!needs.length) return fallback
  const contextProject = run?.context.route.split('?')[0] === '/dashboard/studio' ? run.context.project_id : undefined
  const targets = new Set(needs.map(resource => resource.target_id ?? contextProject))
  const target = [...targets][0]
  return targets.size === 1 && target && uuid.test(target) ? target : undefined
}

/** Resume only a uniquely identified waiter, after the upload server acknowledges every file. */
export function studioResourceWaiter(runs: AgentRun[], projectId: string): AgentRun | undefined {
  const candidates = runs.filter(run => run.status === 'waiting_for_resources' && run.missing_resources?.length && run.missing_resources.every(resource => resource.kind === 'studio_asset') && studioResourceTarget(run) === projectId)
  return candidates.length === 1 ? candidates[0] : undefined
}
