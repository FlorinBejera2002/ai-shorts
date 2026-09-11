import type { CoachScene } from '@/components/script/shooting-coach'

export type ScriptScene = CoachScene & { editor_id?: string }

export type GeneratedScript = {
  title: string
  hook: string
  scenes: ScriptScene[]
  call_to_action: string
  caption: string
  hashtags: string[]
  total_duration_seconds: number
  equipment_suggestions: string[]
  filming_tips: string[]
}

export type ScriptRecord = {
  id: string
  title: string
  status: string
  topic: string
  platform: string
  language: string
  targetDurationSeconds: number
  tone: string
  style: string
  audience: string
  revision: number
  snapshot: GeneratedScript
  archived: boolean
  createdAt: string
  updatedAt: string
}

export type ScriptVersion = {
  id: string
  versionNumber: number
  changeType: string
  summary: string
  createdAt: string
}

export function emptyScript(title = 'Untitled script'): GeneratedScript {
  return {
    title,
    hook: '',
    scenes: [],
    call_to_action: '',
    caption: '',
    hashtags: [],
    total_duration_seconds: 30,
    equipment_suggestions: [],
    filming_tips: []
  }
}
