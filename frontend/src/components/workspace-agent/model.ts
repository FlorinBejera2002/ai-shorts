export type AgentContext = { route: string; project_id?: string; clip_id?: string; studio_selection?: string[] }
export type AgentAction = { name: string; input: Record<string, unknown> }
export type AgentStatus = 'planning' | 'running' | 'waiting_for_confirmation' | 'waiting_for_resources' | 'paused' | 'cancel_requested' | 'cancelled' | 'completed' | 'failed'
export type AgentRun = {
  id: string; message: string; reply: string; status: AgentStatus
  context: AgentContext; action?: AgentAction
  missing_resources?: { kind: string; label: string; target_id?: string }[]
  approval_preview?: Record<string, unknown>
  steps?: { action: AgentAction; result?: { summary?: string; route?: string; data?: Record<string, unknown> } }[]
  result?: { summary?: string; route?: string; data?: Record<string, unknown>; pending?: boolean; undo?: unknown }
  error?: string; created_at: string; updated_at: string; revision: number; cost_credits: number
}
export type Suggestion = { id: string; title: string; description: string; action: AgentAction; context: AgentContext; missing_resources: string[]; cost_credits: number }
export type RunRequest = { request_id: string; message: string; context: AgentContext; suggestion_id?: string; resource_ids?: string[] }
export type AgentResource = { id: string; kind: 'logo' | 'document' | 'publishing_media'; name: string; project_id?: string }
export type AgentCommand = 'pause' | 'resume' | 'stop' | 'approve' | 'reject' | 'undo'

export function safeAgentRoute(route?: string): string | null {
  if (!route || /[\\\s#]/.test(route)) return null
  const pathname = route.split('?')[0]
  return /^\/dashboard(?:\/(?:studio|clips(?:\/[a-zA-Z0-9-]+(?:\/edit)?)?|calendar|publish(?:\/(?:new|[a-zA-Z0-9-]+\/edit))?|create|script-generator|settings|brand|billing|jobs\/[a-zA-Z0-9-]+))?$/.test(pathname) ? route : null
}
export function agentContext(route: string): AgentContext {
  const clip = route.match(/^\/dashboard\/clips\/([a-zA-Z0-9-]+)(?:\/edit)?$/)
  return { route, ...(clip ? { clip_id: clip[1] } : {}) }
}
export function pollingDelay(runs: AgentRun[]): number | false {
  return runs.some(run => ['planning', 'running', 'cancel_requested'].includes(run.status)) ? 2000
    : runs.some(run => run.status === 'waiting_for_resources') ? 15000 : false
}
export function mergeRuns(previous: AgentRun[], incoming: AgentRun[]): AgentRun[] {
  const records = new Map(previous.map(run => [run.id, run]))
  for (const run of incoming) {
    if ((records.get(run.id)?.revision ?? -1) <= run.revision) records.set(run.id, run)
  }
  return [...records.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}
export function publishingConsentMissing(preview?: Record<string, unknown>): boolean {
  if (!preview || !['publishing.publish', 'publishing.schedule', 'publishing.reschedule'].includes(String(preview.action))) return false
  const destinations = Array.isArray(preview.destinations) ? preview.destinations : []
  const tiktok = preview.tiktok as { musicUsageConfirmed?: boolean } | null
  const youtube = preview.youtube as { termsAccepted?: boolean } | null
  return destinations.some(destination => destination?.provider === 'tiktok' && tiktok?.musicUsageConfirmed !== true || destination?.provider === 'youtube' && youtube?.termsAccepted !== true)
}
