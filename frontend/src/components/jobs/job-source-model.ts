import type { ProcessingCardSource } from '@/components/create/processing-card'
import type { JobStatus } from './use-job-status'

type Text = (english: string, romanian: string) => string
type JobRecord = JobStatus['job']

/** YouTube and URL jobs come from a link; everything else is uploaded footage. */
export function isLinkJob(job: Partial<Pick<JobRecord, 'source_type'>>) {
  return job.source_type === 'youtube' || job.source_type === 'url'
}

function clipCountLabel(count: number | undefined, text: Text) {
  if (count === undefined) return null
  if (count === 0) return text('Auto', 'Auto')
  if (count === 1) return text('1 clip', '1 clip')
  return text(`${count} clips`, `${count} clipuri`)
}

function subtitleStyleLabel(style: string | null | undefined, text: Text) {
  if (!style) return null
  if (style === 'default') return text('Standard', 'Standard')
  return style.charAt(0).toUpperCase() + style.slice(1)
}

/** Source row for the job card: title and "Auto · 9:16 · Bold" style meta, from the job record. */
export function jobSourceCard(job: Partial<JobRecord>, text: Text): ProcessingCardSource {
  const fallbackTitle = isLinkJob(job) ? text('YouTube video', 'Videoclip YouTube') : text('Uploaded footage', 'Filmări încărcate')
  const meta = [
    clipCountLabel(job.num_clips_requested, text),
    job.aspect_ratio,
    subtitleStyleLabel(job.subtitle_style, text)
  ].filter(Boolean)
  return {
    title: job.source_title || fallbackTitle,
    meta: meta.length > 0 ? meta.join(' · ') : undefined,
    thumbnailUrl: job.source_thumbnail_url ?? null
  }
}
