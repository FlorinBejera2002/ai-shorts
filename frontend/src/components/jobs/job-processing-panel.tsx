'use client'

import './job-processing-panel.css'

import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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

const stages = [
  {
    key: 'pending',
    label: 'stepQueued',
    detail: 'stepQueuedDetail',
    icon: Clock3
  },
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
  {
    key: 'rendering',
    label: 'stepRender',
    detail: 'stepRenderDetail',
    icon: Film
  },
  { key: 'completed', label: 'stepDone', detail: 'stepDoneDetail', icon: Check }
] as const
const initialStage = stages[0]

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
  const foundStageIndex = stages.findIndex((stage) => stage.key === status)
  const stageIndex = foundStageIndex >= 0 ? foundStageIndex : 0
  const activeStage = stages[stageIndex] ?? initialStage
  const ActiveIcon = activeStage.icon
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
    <section
      className="job-processing"
      data-tone={tone}
      data-running={running}
      data-stage={activeStage.key}
      aria-label={t('pipelineTitle')}
    >
      <div className="job-processing-ambient" aria-hidden="true" />
      <div className="job-processing-stages">
        <div className="job-stages-heading">
          <div>
            <span className="job-eyebrow">
              <span className="job-processing-signal" aria-hidden="true" />
              {running ? t('aiWorking') : t('pipelineTitle')}
            </span>
            <h3>{t('pipelineTitle')}</h3>
          </div>
          <span>
            {t('stageCount', { current: stageIndex + 1, total: stages.length })}
          </span>
        </div>

        <div className="job-stage-focus">
          <div className="job-ai-visual" aria-hidden="true">
            <span className="job-ai-orbit job-ai-orbit-one" />
            <span className="job-ai-orbit job-ai-orbit-two" />
            <span className="job-ai-orbit job-ai-orbit-three" />
            <span className="job-ai-scan" />
            <span className="job-ai-particle job-ai-particle-one" />
            <span className="job-ai-particle job-ai-particle-two" />
            <span className="job-ai-particle job-ai-particle-three" />
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                className="job-ai-core"
                key={activeStage.key}
                initial={
                  reduceMotion
                    ? false
                    : { opacity: 0, scale: 0.72, rotate: -18 }
                }
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={
                  reduceMotion
                    ? undefined
                    : { opacity: 0, scale: 0.72, rotate: 18 }
                }
                transition={{
                  duration: reduceMotion ? 0 : 0.42,
                  ease: 'easeOut'
                }}
              >
                <ActiveIcon size={31} strokeWidth={1.55} />
              </motion.span>
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              className="job-stage-copy"
              key={activeStage.key}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.32 }}
            >
              <span className="job-stage-kicker">
                {String(stageIndex + 1).padStart(2, '0')} /{' '}
                {String(stages.length).padStart(2, '0')}
              </span>
              <h4>{t(activeStage.label)}</h4>
              <p>{t(activeStage.detail)}</p>
              <div className="job-thinking-line" aria-live="polite">
                {running && (
                  <span className="job-stage-activity" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
                <span>{message}</span>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="job-stage-progress">
          <div className="job-progress-meta">
            <span>
              {t(
                complete
                  ? 'stageComplete'
                  : running
                    ? 'stageActive'
                    : stopped
                      ? 'stageStopped'
                      : 'stageWaiting'
              )}
            </span>
            <strong>{Math.round(value)}%</strong>
          </div>
          <div
            className="job-progress-track"
            role="progressbar"
            aria-label={t('overallProgress')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value}
          >
            <motion.span
              initial={false}
              animate={{ scaleX: value / 100 }}
              transition={{
                duration: reduceMotion ? 0 : 0.75,
                ease: [0.22, 1, 0.36, 1]
              }}
            />
          </div>
        </div>

        <ol className="job-stage-map">
          {stages.map((stage, index) => {
            const done = complete || index < stageIndex
            const active = index === stageIndex && !stopped
            const stageState = done ? 'done' : active ? 'active' : 'waiting'
            return (
              <li
                key={stage.key}
                data-state={stageState}
                aria-current={active ? 'step' : undefined}
                aria-label={`${t(stage.label)} — ${t(done ? 'stageComplete' : active ? 'stageActive' : stopped ? 'stageStopped' : 'stageWaiting')}`}
              >
                <span className="job-map-dot">
                  {done ? (
                    <Check size={11} strokeWidth={2.25} aria-hidden="true" />
                  ) : (
                    <span />
                  )}
                </span>
                <span className="job-map-label">{t(stage.label)}</span>
              </li>
            )
          })}
        </ol>
      </div>

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
                {t(
                  failed
                    ? 'failedTitle'
                    : complete
                      ? 'readyLabel'
                      : 'cancelledTitle'
                )}
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
    </section>
  )
}
