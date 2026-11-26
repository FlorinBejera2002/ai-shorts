'use client'

import { useState } from 'react'
import { ProcessingCard, type ProcessingCardSource } from '@/components/create/processing-card'
import type { ProcessingCardStage } from '@/components/create/processing-stages'
import { useCreateText } from '@/components/create/create-text'
import { ChevronDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { durationLimit } from './job-processing-model'
import { jobStageIllustrationAlt, jobStageTitle } from './job-processing-copy'

type Text = (english: string, romanian: string, spanish?: string) => string

const FAILED_ILLUSTRATION_ALT = (text: Text) =>
  text('Ana and Radu try to repair a projector', 'Ana și Radu încearcă să repună în funcțiune un proiector')

interface RunningCardProps {
  stage: number
  progress: number
  stages: ProcessingCardStage[]
  illustration: string
  source: ProcessingCardSource
  /** False while the status is stale or unreachable; the card stops animating. */
  connected: boolean
  busy: boolean
  onCancel: () => void
}

/** Card for a job that is downloading, transcribing, analysing or editing. */
export function JobRunningCard({ stage, progress, stages, illustration, source, connected, busy, onCancel }: RunningCardProps) {
  const text = useCreateText()
  return (
    <ProcessingCard
      testID="job-processing"
      title={jobStageTitle(stage, text)}
      illustration={{ src: `/illustrations/${illustration}.webp`, alt: jobStageIllustrationAlt(stage, text) }}
      progress={progress}
      progressLabel={text('Overall progress', 'Progres total')}
      stages={stages}
      stagesLabel={text('Processing steps', 'Etapele procesării')}
      animated={connected}
      source={source}
    >
      {connected && (
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          {text('Cancel processing', 'Anulează procesarea')}
        </Button>
      )}
    </ProcessingCard>
  )
}

interface TooLongCardProps {
  errorMessage?: string | null
  source: ProcessingCardSource
}

/** Card for a video that exceeds the plan's duration limit. */
export function JobTooLongCard({ errorMessage, source }: TooLongCardProps) {
  const text = useCreateText()
  const limit = durationLimit(errorMessage)
  return (
    <ProcessingCard
      testID="job-too-long"
      role="alert"
      title={text('The video is too long', 'Videoul e prea lung')}
      detail={limit ? `${limit.actualMinutes} min · maximum ${limit.maxMinutes} min` : undefined}
      illustration={{
        src: '/illustrations/youtube-too-long.webp',
        alt: text(
          'Ana unrolls a very long film strip, Radu measures it with a tape',
          'Ana desfășoară o bandă de film foarte lungă, Radu o măsoară cu ruleta'
        )
      }}
      progress={0}
      showProgress={false}
      progressLabel={text('Overall progress', 'Progres total')}
      stagesLabel={text('Processing steps', 'Etapele procesării')}
      animated={false}
      source={source}
    >
      <Button asChild>
        <Link href="/dashboard/create?mode=youtube">{text('Choose another video', 'Alege alt videoclip')}</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/dashboard/create"><Plus aria-hidden="true" />{text('New project', 'Proiect nou')}</Link>
      </Button>
    </ProcessingCard>
  )
}

interface StoppedCardProps {
  failed: boolean
  progress: number
  stages: ProcessingCardStage[]
  errorMessage?: string | null
  source: ProcessingCardSource
  busy: boolean
  onRetry: () => void
}

/** Card for a failed or cancelled job; failures offer retry and technical details. */
export function JobStoppedCard({ failed, progress, stages, errorMessage, source, busy, onRetry }: StoppedCardProps) {
  const text = useCreateText()
  return (
    <ProcessingCard
      testID="job-stopped"
      role={failed ? 'alert' : 'status'}
      title={failed ? text('Processing failed', 'Procesarea a eșuat') : text('Processing stopped', 'Procesarea s-a oprit')}
      illustration={{ src: '/illustrations/create-failed.webp', alt: FAILED_ILLUSTRATION_ALT(text) }}
      progress={progress}
      showProgress={!failed}
      progressLabel={text('Overall progress', 'Progres total')}
      stages={failed ? stages : undefined}
      stagesLabel={text('Processing steps', 'Etapele procesării')}
      animated={false}
      source={source}
    >
      {failed && (
        <Button disabled={busy} onClick={onRetry}>
          {busy ? text('Retrying…', 'Se reîncearcă…') : text('Try again', 'Încearcă din nou')}
        </Button>
      )}
      <Button asChild variant="outline">
        <Link href="/dashboard/create"><Plus aria-hidden="true" />{text('New project', 'Proiect nou')}</Link>
      </Button>
      {failed && errorMessage && <TechnicalDetails message={errorMessage} />}
    </ProcessingCard>
  )
}

/** Collapsible raw error text for support; hidden until asked for. */
function TechnicalDetails({ message }: { message: string }) {
  const text = useCreateText()
  const [open, setOpen] = useState(false)
  return (
    <div className="w-full">
      <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {text('Technical details', 'Detalii tehnice')}
        <ChevronDown aria-hidden="true" className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </Button>
      {open && <p className="break-words text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}
