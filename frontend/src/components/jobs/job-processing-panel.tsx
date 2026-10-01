'use client'

import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowUpRight,
  AudioLines,
  Check,
  CircleAlert,
  Clock3,
  Download,
  Film,
  Pause,
  Scissors,
  Sparkles
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ProcessingPipeline } from './processing-pipeline'

const stages = [
  { key: 'pending', label: 'stepQueued', detail: 'stepQueuedDetail', icon: Clock3 },
  {
    key: 'downloading',
    label: 'stepDownload',
    detail: 'stepDownloadDetail',
    icon: Download
  },
  {
    key: 'transcribing',
    label: 'stepTranscribe',
    detail: 'stepTranscribeDetail',
    icon: AudioLines
  },
  {
    key: 'analyzing',
    label: 'stepAnalyze',
    detail: 'stepAnalyzeDetail',
    icon: Sparkles
  },
  {
    key: 'clipping',
    label: 'stepExtract',
    detail: 'stepExtractDetail',
    icon: Scissors
  },
  { key: 'rendering', label: 'stepRender', detail: 'stepRenderDetail', icon: Film },
  { key: 'completed', label: 'stepDone', detail: 'stepDoneDetail', icon: Check }
] as const

interface JobProcessingPanelProps {
  status: string
  progress: number
  message: string
  errorMessage?: string | null
  connected: boolean
}

export function JobProcessingPanel({
  status,
  progress,
  message,
  errorMessage,
  connected
}: JobProcessingPanelProps) {
  const t = useTranslations('jobProgress')
  const reduceMotion = useReducedMotion()
  const complete = status === 'completed'
  const failed = status === 'failed'
  const cancelled = status === 'cancelled'
  const stopped = failed || cancelled
  const stageIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.key === status)
  )
  const activeStage = stages[stageIndex] ?? stages[0]
  const running = connected && !complete && !stopped
  const value = complete
    ? 100
    : Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0))
  const tone = failed
    ? 'error'
    : complete
      ? 'success'
      : cancelled || !connected
        ? 'idle'
        : 'active'
  const StatusIcon = failed
    ? CircleAlert
    : complete
      ? Check
      : cancelled
        ? Pause
        : Sparkles
  const durationError = errorMessage?.match(
    /video duration\s+([\d.]+)s exceeds max\s+(\d+)s/i
  )
  const failureDescription = durationError
    ? t('durationExceeded', {
        actual: Math.ceil(Number(durationError[1]) / 60),
        max: Math.floor(Number(durationError[2]) / 60)
      })
    : t('failedDesc')

  return (
    <ProcessingPipeline
      title={t('pipelineTitle')}
      eyebrow={running ? t('aiWorking') : t('pipelineTitle')}
      countLabel={t('stageCount', { current: stageIndex + 1, total: stages.length })}
      stage={{
        key: activeStage.key,
        label: t(activeStage.label),
        detail: t(activeStage.detail),
        icon: activeStage.icon
      }}
      stageLabel={`${String(stageIndex + 1).padStart(2, '0')} / ${String(stages.length).padStart(2, '0')}`}
      message={message}
      running={running}
      tone={tone}
      progress={{
        label: t(
          complete
            ? 'stageComplete'
            : running
              ? 'stageActive'
              : stopped
                ? 'stageStopped'
                : 'stageWaiting'
        ),
        ariaLabel: t('overallProgress'),
        value,
        displayValue: `${Math.round(value)}%`
      }}
      stages={stages.map((stage, index) => {
        const done = complete || index < stageIndex
        const active = index === stageIndex && !stopped
        return {
          key: stage.key,
          label: t(stage.label),
          state: done ? 'done' : active ? 'active' : 'waiting',
          stateLabel: t(
            done
              ? 'stageComplete'
              : active
                ? 'stageActive'
                : stopped
                  ? 'stageStopped'
                  : 'stageWaiting'
          )
        }
      })}
    >
      {(stopped || complete) && (
        <motion.div
          className="job-processing-result"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="job-result-copy">
            <StatusIcon size={20} aria-hidden="true" />
            <div>
              <p>
                {t(failed ? 'failedTitle' : complete ? 'readyLabel' : 'cancelledTitle')}
              </p>
              <span className="job-processing-description">
                {failed
                  ? failureDescription
                  : t(complete ? 'reviewHint' : 'cancelledDesc')}
              </span>
              {failed && durationError && <span>{t('shorterVideoHint')}</span>}
              {failed && errorMessage && (
                <details className="job-error-details">
                  <summary>{t('technicalDetails')}</summary>
                  <p>{errorMessage}</p>
                </details>
              )}
            </div>
          </div>
          <Button asChild={true} variant={complete ? 'default' : 'outline'}>
            <Link href={complete ? '/dashboard/clips' : '/dashboard/create'}>
              {t(complete ? 'viewClips' : 'newProject')}
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </Button>
        </motion.div>
      )}
    </ProcessingPipeline>
  )
}
