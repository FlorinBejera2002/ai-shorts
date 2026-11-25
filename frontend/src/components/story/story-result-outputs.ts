import type { StoryOptions, StoryVersion } from './types'

export type { StoryResultOutput } from './types'

export interface StoryResultClip {
  id: string
  index: number
  videoUrl: string
  downloadUrl: string
  posterUrl: string | null
  durationSeconds: number
  aspectRatio: string
  clipId: string | null
}

/** Duration the version reports, falling back to the end of its timeline. */
export function versionDuration(version: StoryVersion) {
  return (
    version.output?.duration ??
    version.timeline.reduce((end, entry) => Math.max(end, entry.output_out), 0)
  )
}

/**
 * The clips of a version in index order. A version without `outputs` yields its single
 * preview, and a version without any playable video yields none.
 */
export function resultClips(
  version: StoryVersion,
  options: Pick<StoryOptions, 'aspect_ratio'>
): StoryResultClip[] {
  if (version.outputs?.length) {
    return [...version.outputs]
      .sort((first, second) => first.index - second.index)
      .map((output) => ({
        id: output.id,
        index: output.index,
        videoUrl: output.video_url,
        downloadUrl: output.video_url,
        posterUrl: output.poster_url,
        durationSeconds: output.duration_seconds,
        aspectRatio: output.aspect_ratio,
        clipId: output.clip_id
      }))
  }
  if (!version.preview_url) return []
  return [
    {
      id: `version-${version.number}`,
      index: 0,
      videoUrl: version.preview_url,
      downloadUrl: version.export_url ?? version.preview_url,
      posterUrl: version.thumbnail_url ?? null,
      durationSeconds: versionDuration(version),
      aspectRatio: version.render_options?.aspect_ratio ?? options.aspect_ratio,
      clipId: version.clip_id ?? null
    }
  ]
}

/** Keeps a requested clip position inside the list; an empty list selects nothing. */
export function selectClipPosition(requested: number, count: number) {
  if (count <= 0) return 0
  if (!Number.isFinite(requested)) return 0
  return Math.min(Math.max(0, Math.trunc(requested)), count - 1)
}

/** Total of the clip durations, rounded to whole seconds for the stats strip. */
export function totalDuration(clips: StoryResultClip[]) {
  return clips.reduce((sum, clip) => sum + clip.durationSeconds, 0)
}
