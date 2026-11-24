import type { CaptionStyle } from '@/components/dashboard/brand/caption-style'
export interface StoryOptions {
  caption_style?: CaptionStyle
  use_brand_kit?: boolean
  /** Empty or absent asset_ids means every footage asset (backend contract). */
  audio_cleanup?: { enabled: boolean; asset_ids?: string[] }
  brief: string
  /** 0 = Auto (the planner decides); otherwise 1..MAX_CLIP_COUNT. */
  clip_count?: number
  target_seconds: number
  aspect_ratio: string
  dynamic_range?: 'sdr' | 'hdr'
  language: string
  mode: string
  preserve_order: boolean
  captions: boolean
  caption_mode?: 'all' | 'selective' | 'off'
  narration?: boolean
  music?: StoryMusicOptions | null
}

export interface StoryMusicOptions {
  track_id: string
  upload_reference?: string
  title?: string
  start_seconds?: number
  end_seconds?: number
  loop?: boolean
  source_audio?: 'preserve' | 'mute'
  volume: number
  sync: boolean
}

export interface MusicTrack {
  id: string
  title: string
  artist: string
  duration_seconds: number
  bpm: number
  genres: string[]
  moods: string[]
  preview_url: string
  source_url: string
  license: string
  license_url: string
  attribution: string
}

export interface StoryMusicOutput {
  track_id: string
  title: string
  artist: string
  license: string
  license_url: string
  source_url: string
  attribution: string
  sync_status: 'aligned' | 'partial' | 'unchanged' | 'off'
  adjusted_cuts: number
  aligned_cuts?: number
  bpm: number
  strategy?: 'structure' | 'rhythm' | 'accents' | 'content'
  explanation?: string
  start_seconds?: number
  end_seconds?: number
}

export const defaultOptions: StoryOptions = {
  brief: '',
  target_seconds: 45,
  clip_count: 0,
  aspect_ratio: '9:16',
  language: 'auto',
  mode: 'smart',
  preserve_order: true,
  captions: true,
  caption_mode: 'all',
  // Canvas default: noise reduction on. An empty asset list applies it to all footage.
  audio_cleanup: { enabled: true, asset_ids: [] }
}

export const MAX_CLIP_COUNT = 30

/** Auto (0) for missing, invalid or non-positive values; otherwise an integer capped at MAX_CLIP_COUNT. */
export function normalizeClipCount(value: unknown): number {
  const count = Math.trunc(Number(value))
  if (!Number.isFinite(count) || count < 1) return 0
  return Math.min(MAX_CLIP_COUNT, count)
}

/** A manually typed count: an integer from 1 to MAX_CLIP_COUNT. */
export function clampManualClipCount(value: number) {
  const count = Math.trunc(value)
  if (!Number.isFinite(count)) return 1
  return Math.min(MAX_CLIP_COUNT, Math.max(1, count))
}

export function storyClipCount(options: StoryOptions) {
  return normalizeClipCount(options.clip_count)
}

/** Old projects predate the three caption modes. Preserve their saved choice. */
export function storyCaptionMode(options: StoryOptions) {
  return options.caption_mode ?? (options.captions ? 'all' : 'off')
}

/** Compare effective choices across legacy and normalized API responses. */
export function storyOptionsEqual(current: StoryOptions, saved: StoryOptions) {
  return (
    JSON.stringify(current.caption_style) ===
      JSON.stringify(saved.caption_style) &&
    Boolean(current.use_brand_kit) === Boolean(saved.use_brand_kit) &&
    Boolean(current.audio_cleanup?.enabled) ===
      Boolean(saved.audio_cleanup?.enabled) &&
    (current.audio_cleanup?.asset_ids ?? []).join() ===
      (saved.audio_cleanup?.asset_ids ?? []).join() &&
    storyClipCount(current) === storyClipCount(saved) &&
    current.brief === saved.brief &&
    current.target_seconds === saved.target_seconds &&
    current.aspect_ratio === saved.aspect_ratio &&
    (current.dynamic_range ?? 'sdr') === (saved.dynamic_range ?? 'sdr') &&
    current.language === saved.language &&
    current.mode === saved.mode &&
    current.preserve_order === saved.preserve_order &&
    Boolean(current.narration) === Boolean(saved.narration) &&
    (current.music?.track_id ?? '') === (saved.music?.track_id ?? '') &&
    (current.music?.upload_reference ?? '') === (saved.music?.upload_reference ?? '') &&
    (current.music?.title ?? '') === (saved.music?.title ?? '') &&
    (current.music?.start_seconds ?? 0) === (saved.music?.start_seconds ?? 0) &&
    (current.music?.end_seconds ?? 0) === (saved.music?.end_seconds ?? 0) &&
    (current.music?.loop ?? true) === (saved.music?.loop ?? true) &&
    (current.music?.source_audio ?? 'preserve') ===
      (saved.music?.source_audio ?? 'preserve') &&
    current.music?.volume === saved.music?.volume &&
    current.music?.sync === saved.music?.sync &&
    storyCaptionMode(current) === storyCaptionMode(saved)
  )
}

export function canEditStorySources(project: StoryProject) {
  return (
    ['draft', 'failed', 'cancelled'].includes(project.status) &&
    !project.current_version &&
    !project.versions?.some((version) => version.accepted)
  )
}

export interface StoryWord {
  text: string
  start: number
  end: number
}

export interface StoryTranscriptProposal {
  id: string
  candidate_id: string
  in: number
  out: number
  words: StoryWord[]
  confidence: number
  reason: string
  timing_verified: boolean
  timing_source?: 'owner'
  reviewed: boolean
}

export interface StoryTranscriptApproval {
  asset_id: string
  proposal_id: string
  words?: string[]
  timed_words?: StoryWord[]
  timing_confirmed?: boolean
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
  transcript_proposals?: StoryTranscriptProposal[]
  processed_audio_url?: string
  audio_cleanup?: {
    status: 'ready' | 'failed' | 'unchanged' | 'no_audio'
    message?: string
  }
  id: string
  name: string
  size: number
  duration: number
  role: string
  include: string
  order: number
  kind?: 'narration' | 'video'
  source_url?: string
  proxy_url?: string
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

/** One rendered clip of a result. Multi-clip versions send `outputs`; older versions have one single output. */
export interface StoryResultOutput {
  id: string
  index: number
  video_url: string
  poster_url: string | null
  duration_seconds: number
  aspect_ratio: string
  clip_id: string | null
}

export interface StoryVersion {
  number: number
  clip_id?: string
  parent: number
  accepted: boolean
  preview_url?: string
  export_url?: string
  thumbnail_url?: string
  render_options?: StoryOptions
  output?: {
    captions?: boolean
    duration?: number
    music?: StoryMusicOutput
    caption_warnings?: string[]
  }
  /** Every clip of a multi-clip version in index order; `output` stays the first clip. */
  outputs?: StoryResultOutput[]
  plan: {
    title: string
    summary: string
    blocks: StoryBlock[]
    gaps?: string[]
  }
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
  operation_status?: 'succeeded' | 'failed' | 'unchanged' | 'cancelled'
  expected_state?: string
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
  max_files: 0, // Compatibility field; storage and duration limits protect resources.
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
    'music_analysis',
    'building_story',
    'editing',
    'reviewing',
    'improving',
    'rendering',
    'cancelling'
  ].includes(status ?? '')
}
