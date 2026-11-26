'use client'

import { JobClipTitle } from './job-clip-title'
import type { JobClip } from './use-job-clips'
import styles from './job-clips-grid.module.css'

/** Duration label as the canvas shows it, e.g. 0:38 or 1:04. */
function formatDuration(seconds: number) {
  const whole = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`
}

/** Grid of the job's finished clips, each with duration and subtitle badges and an editable title. */
export function JobClipsGrid({ jobId, clips }: { jobId: string; clips: JobClip[] }) {
  return (
    <ol className={styles.grid} data-testid="job-clips">
      {clips.map((clip) => (
        <li key={clip.id} className={styles.card}>
          <div className={styles.thumb}>
            {clip.thumbnailUrl && <img src={clip.thumbnailUrl} alt="" />}
            {clip.hasSubtitles && <span className={`${styles.badge} ${styles.subtitles}`}>CC</span>}
            <span className={`${styles.badge} ${styles.duration}`}>{formatDuration(clip.duration)}</span>
          </div>
          <JobClipTitle jobId={jobId} clipId={clip.id} title={clip.title} />
          <p className={styles.meta}>{clip.aspectRatio}</p>
        </li>
      ))}
    </ol>
  )
}
