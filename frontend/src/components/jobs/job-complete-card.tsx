'use client'

import { ArrowRight, Check, Plus } from 'lucide-react'
import { ProcessingSourceRow, type ProcessingCardSource } from '@/components/create/processing-card'
import { useCreateText } from '@/components/create/create-text'
import { Button } from '@/components/ui/button'
import { ClipFeedbackPrompt } from '@/components/feedback/clip-feedback-prompt'
import { Link } from '@/i18n/navigation'
import { JobClipsGrid } from './job-clips-grid'
import { useJobClips } from './use-job-clips'
import styles from './job-complete-card.module.css'

interface JobCompleteCardProps {
  jobId: string
  source: ProcessingCardSource
}

/** Done state for a finished job: hero with the clip count, then the clip grid. */
export function JobCompleteCard({ jobId, source }: JobCompleteCardProps) {
  const text = useCreateText()
  const clips = useJobClips(jobId, true)
  return (
    <>
      <section className={styles.hero} data-testid="job-complete" aria-label={text('All clips are ready!', 'Toate clipurile sunt gata!')}>
        <img
          className={styles.art}
          src="/illustrations/create-done.webp"
          alt={text('Ana and Radu high-five, each holding a clip on a phone', 'Ana și Radu bat palma, fiecare cu un clip pe telefon')}
        />
        <div className={styles.copy}>
          {clips.length > 0 && (
            <span className={styles.count}>
              <Check size={14} strokeWidth={3} aria-hidden="true" />
              {text(`${clips.length} clips ready`, `${clips.length} clipuri gata`)}
            </span>
          )}
          <h2 className={styles.title}>{text('All clips are ready!', 'Toate clipurile sunt gata!')}</h2>
          <ProcessingSourceRow source={source} />
          <div className={styles.actions}>
            <Button asChild>
              <Link href="/dashboard/clips">{text('View clips', 'Vezi clipurile')}<ArrowRight aria-hidden="true" /></Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/create"><Plus aria-hidden="true" />{text('New project', 'Proiect nou')}</Link>
            </Button>
          </div>
        </div>
      </section>
      {clips.length > 0 && <ClipFeedbackPrompt jobId={jobId} />}
      {clips.length > 0 && <JobClipsGrid clips={clips} />}
    </>
  )
}
