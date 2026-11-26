import type { SiteLocale } from '@/lib/site-config'
import type { StoryHelpStep } from './story-help'

export type AgentContext = { route: string; locale?: SiteLocale;project_id?: string; clip_id?: string; studio_selection?: string[]; help_topic?: 'story_builder'; story_step?: StoryHelpStep }
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

export function resourceIdsForContext(resources: AgentResource[], context: AgentContext): string[] {
  return [...new Set(resources.filter(resource => !resource.project_id || resource.project_id === context.project_id).map(resource => resource.id))]
}

export function safeAgentRoute(route?: string): string | null {
  if (!route || /[\\\s#]/.test(route)) return null
  const pathname = route.split('?')[0]
  return /^\/dashboard(?:\/(?:studio|clips(?:\/[a-zA-Z0-9-]+(?:\/edit)?)?|calendar|publish(?:\/(?:new|[a-zA-Z0-9-]+\/edit))?|create|script-generator|settings|brand|billing|jobs\/[a-zA-Z0-9-]+))?$/.test(pathname) ? route : null
}
export function agentContext(route: string): AgentContext {
  const pathname = route.split('?')[0]
  const clip = pathname.match(/^\/dashboard\/clips\/([a-zA-Z0-9-]+)(?:\/edit)?$/)
  const project = pathname.match(/^\/dashboard\/jobs\/([a-zA-Z0-9-]+)$/)
  return { route, ...(clip ? { clip_id: clip[1] } : {}), ...(project ? { project_id: project[1] } : {}) }
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
export function resourceProjectFromRun(run: AgentRun): string | undefined {
  if (run.status !== 'waiting_for_resources') return undefined
  const targets = new Set((run.missing_resources ?? []).filter(need => need.kind === 'videos' && need.target_id).map(need => need.target_id!))
  return targets.size === 1 ? [...targets][0] : undefined
}
export function publishingConsentMissing(preview?: Record<string, unknown>): boolean {
  if (!preview || !['publishing.publish', 'publishing.schedule', 'publishing.reschedule'].includes(String(preview.action))) return false
  const destinations = Array.isArray(preview.destinations) ? preview.destinations : []
  const tiktok = preview.tiktok as { musicUsageConfirmed?: boolean } | null
  const youtube = preview.youtube as { termsAccepted?: boolean } | null
  return destinations.some(destination => destination?.provider === 'tiktok' && tiktok?.musicUsageConfirmed !== true || destination?.provider === 'youtube' && youtube?.termsAccepted !== true)
}
/** Copy for each supported locale. */
export type Localized = Record<SiteLocale, string>

/** Singular and plural nouns for each supported locale. */
export type CountForms = Record<SiteLocale, [singular: string, plural: string]>

/** Shared noun forms for counts shown in result and approval cards. */
export const countForms = {
  clip: { en: ['clip', 'clips'], ro: ['clip', 'clipuri'], es: ['clip', 'clips'] },
  folder: { en: ['folder', 'folders'], ro: ['folder', 'foldere'], es: ['carpeta', 'carpetas'] },
  childFolder: { en: ['child folder', 'child folders'], ro: ['subfolder', 'subfoldere'], es: ['subcarpeta', 'subcarpetas'] },
  project: { en: ['project', 'projects'], ro: ['proiect', 'proiecte'], es: ['proyecto', 'proyectos'] }
} satisfies Record<string, CountForms>

/** Count with the right noun form. Romanian uses the singular for 1 and "de" from 20 (unless the last two digits are 01–19). */
export function countLabel(count: number, locale: SiteLocale, forms: CountForms): string {
  if (locale !== 'ro') return `${count} ${count === 1 ? forms[locale][0] : forms[locale][1]}`
  if (count === 1) return `1 ${forms.ro[0]}`
  const lastTwo = count % 100
  return `${count} ${count !== 0 && (lastTwo === 0 || lastTwo >= 20) ? 'de ' : ''}${forms.ro[1]}`
}
