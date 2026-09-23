export interface StoryOptions {
  brief: string
  target_seconds: number
  aspect_ratio: string
  language: string
  mode: string
  preserve_order: boolean
  captions: boolean
  narration?: boolean
}

export const defaultOptions: StoryOptions = {
  brief: '',
  target_seconds: 45,
  aspect_ratio: '9:16',
  language: 'auto',
  mode: 'smart',
  preserve_order: false,
  captions: true
}

export interface StoryWord {
  text: string
  start: number
  end: number
}

export interface StoryCandidate {
  id: string
  source_id: string
  in: number
  out: number
  text: string
  words?: StoryWord[]
  reason: string
  role: string
  confidence: number
}

export interface StoryAsset {
  id: string
  name: string
  size: number
  duration: number
  role: string
  include: string
  order: number
  kind?: 'narration' | 'video'
  source_url?: string
  thumbnail_url?: string
  candidates?: StoryCandidate[]
  warnings?: string[]
}

export interface StoryBlock {
  id: string
  candidate_id: string
  role: string
  reason: string
  alternatives?: string[]
  b_roll_id?: string
  locked: boolean
  lock_text: boolean
  lock_order: boolean
  lock_crop: boolean
}

export interface StoryIssue {
  id: string
  type: string
  severity: string
  start: number
  end: number
  evidence: string
  operation?: string
  repair_note?: string
  resolved: boolean
}

export interface StoryVersion {
  number: number
  parent: number
  accepted: boolean
  preview_url?: string
  thumbnail_url?: string
  plan: { title: string; summary: string; blocks: StoryBlock[]; gaps?: string[] }
  timeline: Array<{
    block_id: string
    candidate_id?: string
    output_in: number
    output_out: number
    video: { source_id: string; in: number; out: number }
    audio?: { source_id: string; in: number; out: number }
    words?: StoryWord[]
  }>
  report: {
    status: string
    issues?: StoryIssue[]
    coverage: {
      plan: boolean
      file: boolean
      audio: boolean
      visual: boolean
      captions: boolean
      semantics: boolean
      boundaries: boolean
      incomplete?: string[]
    }
  }
}

export interface StoryProject {
  id: string
  options: StoryOptions
  status: string
  stage?: string
  message?: string
  error?: string
  assets: StoryAsset[]
  versions: StoryVersion[]
  current_version: number
  attempts?: Array<{
    issue_id: string
    operation: string
    version: number
    accepted: boolean
    reason: string
  }>
  limits: {
    max_files: number
    max_file_bytes: number
    max_total_bytes: number
    max_source_seconds: number
    max_total_seconds: number
  }
}

export const defaultLimits: StoryProject['limits'] = {
  max_files: 20,
  max_file_bytes: 2 * 1024 ** 3,
  max_total_bytes: 10 * 1024 ** 3,
  max_source_seconds: 900,
  max_total_seconds: 3600
}

export function storyIsBusy(status?: string) {
  return [
    'queued',
    'pending',
    'processing',
    'analyzing',
    'building_story',
    'editing',
    'reviewing',
    'improving',
    'rendering',
    'cancelling'
  ].includes(status ?? '')
}
