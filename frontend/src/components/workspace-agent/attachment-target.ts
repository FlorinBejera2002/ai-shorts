import type { AgentRun } from './model'

export type AttachmentTarget = { projectId?: string; ambiguous?: boolean }

/** Missing targets mean a global resource; they must not inherit the open story. */
export function attachmentTarget(run?: AgentRun): AttachmentTarget | undefined {
  if (run?.status !== 'waiting_for_resources') return undefined
  const needs = run.missing_resources?.filter(resource => resource.kind === 'logo' || resource.kind === 'document') ?? []
  if (!needs.length) return undefined
  const targets = new Set(needs.map(resource => resource.target_id || undefined))
  if (targets.size !== 1) return { ambiguous: true }
  return { projectId: [...targets][0] }
}
