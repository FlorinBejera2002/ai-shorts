import type { AgentStatus } from './model'

/** Ana & Radu state scenes, by key. Files live in `public/illustrations/`. */
export type AgentScene =
  | 'welcome' | 'thinking' | 'working' | 'approval' | 'resources' | 'paused' | 'stopped' | 'failed'
  | 'done' | 'help' | 'navigate' | 'offline' | 'busy' | 'listening' | 'historyEmpty' | 'noSuggestions'

export const SCENE_FILE: Record<AgentScene, string> = {
  welcome: 'agent-welcome', thinking: 'agent-thinking', working: 'agent-working', approval: 'agent-approval',
  resources: 'agent-resources', paused: 'agent-paused', stopped: 'agent-stopped', failed: 'agent-failed',
  done: 'agent-done', help: 'agent-help', navigate: 'agent-navigate', offline: 'agent-offline', busy: 'agent-busy',
  listening: 'agent-listening', historyEmpty: 'agent-history-empty', noSuggestions: 'agent-no-suggestions'
}

/** The scene shown inside a run card for each run status (none for completed: results speak there). */
export const STATUS_SCENE: Partial<Record<AgentStatus, AgentScene>> = {
  planning: 'thinking', running: 'working', waiting_for_confirmation: 'approval', waiting_for_resources: 'resources',
  paused: 'paused', cancel_requested: 'stopped', cancelled: 'stopped', failed: 'failed'
}
