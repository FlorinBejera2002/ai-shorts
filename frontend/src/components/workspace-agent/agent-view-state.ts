import type { SiteLocale } from '@/lib/site-config'
import type { AgentPanel } from './agent-menu'
import type { AgentMessages } from './messages'

interface MissingResource {
  kind: string
}

/** Which side panel the waiting run needs, if any. */
export function contextualPanelFor(missing: MissingResource[]): AgentPanel | null {
  const kinds = missing.map(item => item.kind)
  if (kinds.some(kind => ['logo', 'document', 'publishing_media'].includes(kind))) return 'attachments'
  if (kinds.some(kind => ['video', 'videos'].includes(kind))) return 'recordings'
  if (kinds.includes('studio_asset')) return 'studio'
  if (kinds.some(kind => ['project', 'story'].includes(kind))) return 'projects'
  return null
}

export function panelTitles(locale: SiteLocale, copy: AgentMessages): Record<AgentPanel, string> {
  return {
    attachments: { en: 'Conversation files', ro: 'Fișiere pentru conversație', es: 'Archivos de la conversación' }[locale],
    projects: { en: 'Choose project', ro: 'Alege proiectul', es: 'Elige el proyecto' }[locale],
    recordings: { en: 'Media sources', ro: 'Surse media', es: 'Fuentes de medios' }[locale],
    studio: { en: 'Studio media', ro: 'Media pentru Studio', es: 'Medios de Studio' }[locale],
    preferences: { en: 'Preferences and history', ro: 'Preferințe și istoric', es: 'Preferencias e historial' }[locale],
    suggestions: copy.suggestions
  }
}

/** True while any upload, attachment or Studio file is still in flight. */
export function isAgentUploading(state: { resourceBusy: boolean; attachmentPending: unknown; studioUploading: boolean }): boolean {
  return state.resourceBusy || Boolean(state.attachmentPending) || state.studioUploading
}

export function canSendDraft(state: { busy: boolean; draft: string; retry: unknown; uploading: boolean }): boolean {
  return !state.busy && Boolean(state.draft.trim()) && !state.retry && !state.uploading
}

/** Appends dictated speech to the draft, keeping the composer's character limit. */
export function appendDictatedText(draft: string, text: string): string {
  return `${draft}${draft ? ' ' : ''}${text}`.slice(0, 4000)
}

/**
 * Phone pages with a fixed bottom action bar (Creare, job results, the post composer) keep the
 * launcher out of the way so it never covers their buttons; the agent stays reachable elsewhere.
 */
export function isLauncherHiddenOnPhone(route: string): boolean {
  return route.startsWith('/dashboard/create') || route.startsWith('/dashboard/jobs/')
    || /^\/dashboard\/publish\/(?:new|[^/]+\/edit)\/?$/.test(route)
}
